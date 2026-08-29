import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import type { ScopeImportRow } from '../scopeTemplate';

export type CandidateOrigin = 'import' | 'standard';

export interface ScopeCandidate {
  id: string;
  subprojectId: string;
  origin: CandidateOrigin;
  sourceIdent: string;
  sourceName?: string;
  sourceDescription?: string;
  inScope: boolean;
  custom: boolean;
  mappedObjectId?: string;
  mappingNote?: string;
  confirmedAt?: string;
  confirmedBy?: string;
}

const toCandidate = (c: any): ScopeCandidate => ({
  id: c.id,
  subprojectId: c.subproject_id,
  origin: c.origin,
  sourceIdent: c.source_ident,
  sourceName: c.source_name ?? undefined,
  sourceDescription: c.source_description ?? undefined,
  inScope: c.in_scope,
  custom: c.custom,
  mappedObjectId: c.mapped_object_id ?? undefined,
  mappingNote: c.mapping_note ?? undefined,
  confirmedAt: c.confirmed_at ?? undefined,
  confirmedBy: c.confirmed_by ?? undefined,
});

export function useScopeCandidates(subprojectId?: string) {
  return useQuery({
    queryKey: ['scope-candidates', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<ScopeCandidate[]> => {
      const { data, error } = await supabase
        .from('scope_candidates').select('*')
        .eq('subproject_id', subprojectId!)
        .order('source_ident');
      if (error) throw error;
      return (data ?? []).map(toCandidate);
    },
  });
}

/** A candidate is ready to leave step 2 when it is mapped AND confirmed, or parked as custom.
 *
 * Custom objects are deliberately allowed through unmapped — they have no SAP equivalent by
 * definition, and forcing one into the standard catalogue produces a wrong answer rather than no
 * answer. They simply carry no dependencies, which is the honest consequence. */
export const isSettled = (c: ScopeCandidate): boolean =>
  !c.inScope || c.custom || (!!c.mappedObjectId && !!c.confirmedAt);

/** A candidate belongs in the real scope when it is in scope, not parked as custom, mapped, and
 * confirmed. Anything else is still a name someone is thinking about. */
const belongsInScope = (c: ScopeCandidate): boolean =>
  c.inScope && !c.custom && !!c.mappedObjectId && !!c.confirmedAt;

/** Makes `subproject_objects.in_scope` agree with the candidate list.
 *
 * The candidate list is the authority on what is in scope; `subproject_objects` is where that
 * decision is recorded so the rest of the app can act on it. Nothing kept the two in step, so scope
 * was **append-only in practice**: un-ticking a catalogue object deleted its candidate but left the
 * scope row, and the object went on appearing in the dependency check, the load sequence, the ERD
 * and FMD Mapping. A scope you cannot take something out of is not a scope.
 *
 * Objects that fall out are set `in_scope = false` rather than deleted, so the owner, consultant,
 * ETL developer and load position survive an object being taken out and put back — re-typing those
 * because someone un-ticked a row by accident is its own kind of data loss.
 *
 * Runs after every mutation that can change what belongs in scope, and is a full reconcile rather
 * than a targeted delete: that way it also repairs rows leaked before this existed. */
async function reconcileScope(subprojectId: string) {
  const [{ data: cRows, error: cErr }, { data: sRows, error: sErr }] = await Promise.all([
    supabase.from('scope_candidates').select('*').eq('subproject_id', subprojectId),
    supabase.from('subproject_objects').select('migration_object_id, in_scope').eq('subproject_id', subprojectId),
  ]);
  if (cErr) throw cErr;
  if (sErr) throw sErr;

  const wanted = new Set(
    (cRows ?? []).map(toCandidate).filter(belongsInScope).map((c) => c.mappedObjectId!),
  );
  const stale = (sRows ?? [])
    .filter((r: any) => r.in_scope && !wanted.has(r.migration_object_id))
    .map((r: any) => r.migration_object_id as string);

  if (stale.length === 0) return;
  const { error } = await supabase
    .from('subproject_objects')
    .update({ in_scope: false })
    .eq('subproject_id', subprojectId)
    .in('migration_object_id', stale);
  if (error) throw error;
}

export function useScopeCandidateMutations(subprojectId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['scope-candidates', subprojectId] }),
      queryClient.invalidateQueries({ queryKey: ['subproject-objects', subprojectId] }),
      queryClient.invalidateQueries({ queryKey: ['dependency-check', subprojectId] }),
      queryClient.invalidateQueries({ queryKey: ['scope-dependencies', subprojectId] }),
    ]);
  };

  /** Writes an uploaded list in. Upserts on (subproject, source_ident), so re-uploading a corrected
   * file updates rows rather than duplicating them — and deliberately does NOT clear a mapping
   * somebody already confirmed, because a re-import is usually a correction to a few rows, not a
   * reason to redo the whole mapping step. */
  const importRows = useMutation({
    mutationFn: async (rows: (ScopeImportRow & { mappedObjectId?: string })[]) => {
      if (rows.length === 0) return 0;
      const { error } = await supabase
        .from('scope_candidates')
        .upsert(
          rows.map((r) => ({
            subproject_id: subprojectId,
            origin: 'import' as const,
            source_ident: r.sourceIdent,
            source_name: r.sourceName ?? null,
            source_description: r.sourceDescription ?? null,
            in_scope: r.inScope,
            custom: r.custom,
            mapped_object_id: r.mappedObjectId ?? null,
            created_by: user?.email ?? 'Unknown',
          })),
          { onConflict: 'subproject_id,source_ident', ignoreDuplicates: false },
        );
      if (error) throw error;
      // A corrected re-upload can flip a row to IN_SCOPE=No, which has to take it back out.
      await reconcileScope(subprojectId);
      return rows.length;
    },
    onSuccess: invalidate,
  });

  /** Picking from the SAP catalogue. The mapping is itself, so it lands already mapped — step 2 is
   * then a confirmation rather than a decision, which is what "map regardless of option" means for
   * this path. */
  const addStandard = useMutation({
    mutationFn: async (objects: { id: string; objectId: string; description?: string }[]) => {
      if (objects.length === 0) return 0;
      const { error } = await supabase
        .from('scope_candidates')
        .upsert(
          objects.map((o) => ({
            subproject_id: subprojectId,
            origin: 'standard' as const,
            source_ident: o.objectId,
            source_name: o.description ?? null,
            in_scope: true,
            custom: false,
            mapped_object_id: o.id,
            created_by: user?.email ?? 'Unknown',
          })),
          { onConflict: 'subproject_id,source_ident', ignoreDuplicates: false },
        );
      if (error) throw error;
      return objects.length;
    },
    onSuccess: invalidate,
  });

  const removeStandard = useMutation({
    mutationFn: async (sourceIdents: string[]) => {
      if (sourceIdents.length === 0) return;
      const { error } = await supabase
        .from('scope_candidates').delete()
        .eq('subproject_id', subprojectId).in('source_ident', sourceIdents);
      if (error) throw error;
      // Un-ticking an object is the main way something LEAVES the scope. Without this the scope row
      // outlived the candidate and the object stayed in the load plan invisibly.
      await reconcileScope(subprojectId);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      mappedObjectId?: string | null;
      custom?: boolean;
      inScope?: boolean;
      mappingNote?: string | null;
    }) => {
      const patch: Record<string, unknown> = {};
      if (input.mappedObjectId !== undefined) {
        patch.mapped_object_id = input.mappedObjectId;
        // Changing what a row maps to invalidates the agreement that it mapped to the old one.
        patch.confirmed_at = null;
        patch.confirmed_by = null;
      }
      if (input.custom !== undefined) patch.custom = input.custom;
      if (input.inScope !== undefined) patch.in_scope = input.inScope;
      if (input.mappingNote !== undefined) patch.mapping_note = input.mappingNote;
      const { error } = await supabase.from('scope_candidates').update(patch).eq('id', input.id);
      if (error) throw error;
      // Re-mapping, parking as custom and taking a row out of scope all change what belongs in the
      // real scope. Each of these used to leave the old scope row behind.
      await reconcileScope(subprojectId);
    },
    onSuccess: invalidate,
  });

  /** Confirming is what promotes a candidate into the real scope. Two writes, deliberately in this
   * order: the scope row first, so a failure leaves the candidate unconfirmed and the step honestly
   * incomplete rather than confirmed-but-not-in-scope. */
  const confirm = useMutation({
    mutationFn: async (candidates: ScopeCandidate[]) => {
      const mappable = candidates.filter((c) => c.mappedObjectId && c.inScope && !c.custom);
      if (mappable.length > 0) {
        const { error: scopeError } = await supabase
          .from('subproject_objects')
          .upsert(
            mappable.map((c) => ({
              subproject_id: subprojectId,
              migration_object_id: c.mappedObjectId!,
              in_scope: true,
            })),
            { onConflict: 'subproject_id,migration_object_id' },
          );
        if (scopeError) throw scopeError;
      }

      const { error } = await supabase
        .from('scope_candidates')
        .update({ confirmed_at: new Date().toISOString(), confirmed_by: user?.email ?? 'Unknown' })
        .in('id', candidates.map((c) => c.id));
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const unconfirm = useMutation({
    mutationFn: async (candidate: ScopeCandidate) => {
      const { error } = await supabase
        .from('scope_candidates')
        .update({ confirmed_at: null, confirmed_by: null })
        .eq('id', candidate.id);
      if (error) throw error;
      // Un-confirming takes the object back out of the working scope. It was left in before, which
      // meant "this mapping needs another look" and "load this object" were true at the same time —
      // and the dependency check went on planning around a mapping nobody stood behind.
      await reconcileScope(subprojectId);
    },
    onSuccess: invalidate,
  });

  /** Prerequisites pulled in from the Dependency Check.
   *
   * They enter as full candidates — origin `standard`, mapped to themselves, already confirmed —
   * rather than as a bare `subproject_objects` row. Otherwise the object is in scope but absent
   * from Select Objects and Object Mapping, the Finalize count disagrees with what actually loads,
   * and `reconcileScope` (which reads the candidate list as the authority) would take it straight
   * back out again on the next edit. */
  const adoptPrerequisites = useMutation({
    mutationFn: async (objects: { id: string; objectId: string; description?: string }[]) => {
      if (objects.length === 0) return 0;
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('scope_candidates')
        .upsert(
          objects.map((o) => ({
            subproject_id: subprojectId,
            origin: 'standard' as const,
            source_ident: o.objectId,
            source_name: o.description ?? null,
            in_scope: true,
            custom: false,
            mapped_object_id: o.id,
            // Pulled in BECAUSE something in scope needs it — the mapping is the object itself and
            // there is nothing left to decide, so it does not go back through the mapping step.
            confirmed_at: now,
            confirmed_by: user?.email ?? 'Unknown',
            mapping_note: 'Added from the dependency check — required by an object already in scope.',
            created_by: user?.email ?? 'Unknown',
          })),
          { onConflict: 'subproject_id,source_ident', ignoreDuplicates: false },
        );
      if (error) throw error;

      const { error: scopeError } = await supabase
        .from('subproject_objects')
        .upsert(
          objects.map((o) => ({
            subproject_id: subprojectId, migration_object_id: o.id, in_scope: true,
          })),
          { onConflict: 'subproject_id,migration_object_id' },
        );
      if (scopeError) throw scopeError;
      return objects.length;
    },
    onSuccess: invalidate,
  });

  return { importRows, addStandard, removeStandard, update, confirm, unconfirm, adoptPrerequisites };
}

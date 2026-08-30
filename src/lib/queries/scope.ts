import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import type { MigrationObject, SubprojectObject } from '../../types/entities';

const toMigrationObject = (o: any): MigrationObject => ({
  id: o.id, guid: o.guid ?? undefined, objectId: o.object_id, technicalName: o.technical_name ?? undefined,
  description: o.description ?? undefined, category: o.category ?? undefined, approach: o.approach ?? undefined,
  component: o.component ?? undefined, class: o.class, programId: o.program_id,
  scontainer: o.scontainer ?? undefined, rcontainer: o.rcontainer ?? undefined,
  url: o.url ?? undefined, customFieldSupport: o.custom_field_support ?? undefined,
  analyzeSelection: o.analyze_selection ?? undefined, invalid: o.invalid ?? undefined,
});
const toSubprojectObject = (w: any): SubprojectObject => ({
  id: w.id, subprojectId: w.subproject_id, migrationObjectId: w.migration_object_id, inScope: w.in_scope,
  approach: w.approach ?? undefined, loadSeq: w.load_seq ?? undefined,
  consultant: w.consultant ?? undefined, etlDeveloper: w.etl_developer ?? undefined,
  waiverReason: w.waiver_reason ?? undefined, fmdId: w.fmd_id ?? undefined,
  mappingStatus: w.mapping_status ?? undefined, mappingNote: w.mapping_note ?? undefined,
});

/** The full SAP migration-object catalogue — programme-wide, readable by any authenticated member. */
/** `enabled` lets a component that is mounted but showing nothing (a dialog with no record open)
 * skip the fetch — the whole catalogue is a big read to make for a screen nobody is looking at. */
export function useMigrationObjects(enabled = true) {
  return useQuery({
    queryKey: ['migration-objects'],
    enabled,
    queryFn: async (): Promise<MigrationObject[]> => {
      const { data, error } = await supabase.from('migration_objects').select('*').order('object_id');
      if (error) throw error;
      return (data ?? []).map(toMigrationObject);
    },
    staleTime: 5 * 60_000,
  });
}

export function useSubprojectObjects(subprojectId?: string) {
  return useQuery({
    queryKey: ['subproject-objects', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<SubprojectObject[]> => {
      const { data, error } = await supabase.from('subproject_objects').select('*').eq('subproject_id', subprojectId!);
      if (error) throw error;
      return (data ?? []).map(toSubprojectObject);
    },
  });
}

/** Owner of one in-scope object, keyed `<subprojectId>::<migrationObjectId>`, across every
 * subproject the user can see. An FMD's owner is NOT its own setting — it's whoever owns the
 * migration object in the subproject the FMD belongs to, assigned during in-scope selection
 * (Scope > Migration Object). Keeping one source means an FMD can't disagree with the scope register
 * about who is responsible for the object. */
export interface ScopeAssignment { consultant?: string; etlDeveloper?: string }

/** Who is assigned to each in-scope object, program-wide, keyed by `scopeOwnerKey`.
 *
 * Returns BOTH roles: the FMD needs the consultant to decide who may publish, and shows the ETL
 * developer beside it because "who is building this" is the next question anyone asks. */
export function useScopeObjectOwners(enabled = true) {
  return useQuery({
    queryKey: ['scope-object-owners'],
    enabled,
    queryFn: async (): Promise<Map<string, ScopeAssignment>> => {
      const { data, error } = await supabase
        .from('subproject_objects').select('subproject_id, migration_object_id, consultant, etl_developer');
      if (error) throw error;
      return new Map((data ?? [])
        .filter((r: any) => r.consultant || r.etl_developer)
        .map((r: any) => [
          `${r.subproject_id}::${r.migration_object_id}`,
          { consultant: r.consultant ?? undefined, etlDeveloper: r.etl_developer ?? undefined },
        ]));
    },
  });
}

export const scopeOwnerKey = (subprojectId?: string, migrationObjectId?: string) =>
  subprojectId && migrationObjectId ? `${subprojectId}::${migrationObjectId}` : '';

export interface ObjectScopeUsage { subprojectId: string; subprojectName: string; projectCode?: string; programCode?: string }

/** Every subproject that has this object in scope, program-wide — used by "Generate FMD" to
 * decide Standard (not in scope anywhere) vs Custom (in scope somewhere), and to let the user
 * pick which subproject/project a Custom FMD is generated for when there's more than one. */
export function useObjectScopeUsage(migrationObjectId?: string) {
  return useQuery({
    queryKey: ['object-scope-usage', migrationObjectId],
    enabled: !!migrationObjectId,
    queryFn: async (): Promise<ObjectScopeUsage[]> => {
      const { data, error } = await supabase
        .from('subproject_objects')
        .select('subproject_id, subprojects(name, projects(code, programs(code)))')
        .eq('migration_object_id', migrationObjectId!).eq('in_scope', true);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        subprojectId: r.subproject_id, subprojectName: r.subprojects?.name ?? '—',
        projectCode: r.subprojects?.projects?.code as string | undefined,
        programCode: r.subprojects?.projects?.programs?.code as string | undefined,
      }));
    },
  });
}

/** Subprojects that have actually ASSIGNED this FMD — `subproject_objects.fmd_id`.
 *
 * Not the same question as "where is the object in scope", and confusing the two is how Where-Used
 * came to claim an FMD was used in a subproject that had never assigned it: the object was in scope
 * there, nothing more. The Assign dialog counted assignments and said "unassigned" for the same
 * document, so the two screens contradicted each other — and the dialog was the one telling the
 * truth. A scope entry is an opportunity to use an FMD; an assignment is using it. */
export function useFmdAssignments(fmdId?: string) {
  return useQuery({
    queryKey: ['fmd-assignments', fmdId],
    enabled: !!fmdId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('subproject_objects').select('subproject_id').eq('fmd_id', fmdId!);
      if (error) throw error;
      return [...new Set((data ?? []).map((r: any) => r.subproject_id as string))];
    },
  });
}

export interface AssignableFmd {
  id: string; name: string; displayId?: string; type: string;
  /** The migration object this FMD maps. It is the KEY the list matches on — an FMD is a candidate
   * for an in-scope object because it was written for that same object — so it is carried here and
   * shown on every row rather than left implicit. */
  objectIdent?: string;
  /** Where the document was authored. Not where it may be used — an assigned FMD is reusable. */
  originSubprojectId?: string;
  latestVersion?: string;
  /** How many subprojects already use it. 0 means written but never assigned anywhere. */
  usedIn: number;
}

/** Every FMD that exists for this migration object, whichever subproject wrote it.
 *
 * This is the list behind "Assign FMD". Reuse is the point: a Custom FMD for SIF_CUSTOMER_2 is a
 * deliverable somebody wrote once, and the next wave migrating customers should pick it up rather
 * than generate a second copy from the template and start drifting from the original. Generating is
 * the fallback for when this list is empty, not the default path.
 *
 * Flat queries and an in-memory join — a nested embed drops rows whenever RLS filters a level, and
 * an assignment list that silently omits the FMD you are looking for is worse than none. */
export function useAssignableFmds(migrationObjectId?: string, objectIdent?: string) {
  return useQuery({
    queryKey: ['assignable-fmds', migrationObjectId, objectIdent],
    enabled: !!migrationObjectId,
    queryFn: async (): Promise<AssignableFmd[]> => {
      const { data: fmds, error } = await supabase
        .from('fmds')
        .select('id, name, display_id, type, subproject_id')
        .eq('migration_object_id', migrationObjectId!)
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      const rows = fmds ?? [];
      if (rows.length === 0) return [];

      const ids = rows.map((f: any) => f.id);
      const [versionsRes, usageRes] = await Promise.all([
        supabase.from('fmd_versions').select('fmd_id, version, created_at').in('fmd_id', ids),
        supabase.from('subproject_objects').select('fmd_id').in('fmd_id', ids),
      ]);
      if (versionsRes.error) throw versionsRes.error;
      if (usageRes.error) throw usageRes.error;

      const newest = new Map<string, { version: string; at: string }>();
      for (const v of versionsRes.data ?? []) {
        const cur = newest.get((v as any).fmd_id);
        if (!cur || ((v as any).created_at ?? '') > cur.at) {
          newest.set((v as any).fmd_id, { version: (v as any).version, at: (v as any).created_at ?? '' });
        }
      }
      const uses = new Map<string, number>();
      for (const u of usageRes.data ?? []) {
        const id = (u as any).fmd_id as string;
        uses.set(id, (uses.get(id) ?? 0) + 1);
      }

      return rows.map((f: any) => ({
        id: f.id, name: f.name, displayId: f.display_id ?? undefined, type: f.type,
        objectIdent,
        originSubprojectId: f.subproject_id ?? undefined,
        latestVersion: newest.get(f.id)?.version,
        usedIn: uses.get(f.id) ?? 0,
      }));
    },
  });
}

export interface ObjectPrerequisite {
  requiresObjectId: string; requiresIdent: string; requiresDescription?: string; mandatory: boolean;
  requiresCategory?: string; requiresComponent?: string;
}

/** Prerequisite objects for a single migration object (from DMC_SIN_SCOBJSEQ), for the Library
 * object detail dialog's Details tab / dependency diagram. */
export function useObjectDependencies(migrationObjectId?: string) {
  return useQuery({
    queryKey: ['object-dependencies', migrationObjectId],
    enabled: !!migrationObjectId,
    queryFn: async (): Promise<ObjectPrerequisite[]> => {
      const { data, error } = await supabase
        .from('object_dependencies')
        .select('mandatory, req:migration_objects!object_dependencies_requires_object_id_fkey(id, object_id, description, category, component)')
        .eq('migration_object_id', migrationObjectId!);
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        requiresObjectId: d.req.id, requiresIdent: d.req.object_id, requiresDescription: d.req.description ?? undefined, mandatory: d.mandatory,
        requiresCategory: d.req.category ?? undefined, requiresComponent: d.req.component ?? undefined,
      }));
    },
  });
}

/** Idents (real DMC catalogue only) required by any in-scope object but not themselves in scope. */
export function useMissingPrerequisites(subprojectId?: string) {
  return useQuery({
    queryKey: ['missing-prereqs', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<{ object: string; requires: string }[]> => {
      const { data: subprojectObjs, error: e1 } = await supabase
        .from('subproject_objects').select('migration_object_id').eq('subproject_id', subprojectId!).eq('in_scope', true);
      if (e1) throw e1;
      const inScopeIds = (subprojectObjs ?? []).map((w) => w.migration_object_id);
      if (inScopeIds.length === 0) return [];
      const { data: deps, error: e2 } = await supabase
        .from('object_dependencies')
        .select('migration_object_id, requires_object_id, mo:migration_objects!object_dependencies_migration_object_id_fkey(object_id), req:migration_objects!object_dependencies_requires_object_id_fkey(object_id)')
        .in('migration_object_id', inScopeIds);
      if (e2) throw e2;
      const inScopeSet = new Set(inScopeIds);
      return (deps ?? [])
        .filter((d: any) => !inScopeSet.has(d.requires_object_id))
        .map((d: any) => ({ object: d.mo?.object_id ?? d.migration_object_id, requires: d.req?.object_id ?? d.requires_object_id }));
    },
  });
}

export interface DependencyCheckRow {
  objectId: string; objectIdent: string; objectName?: string; objectComponent?: string;
  requiresId: string; requiresIdent: string; requiresName?: string; requiresComponent?: string;
  mandatory: boolean;
  /** `In scope` — the prerequisite is already selected. `Missing` — it is not, and this load will
   * fail unless it is pulled in or the gap is deliberately accepted. */
  status: 'In scope' | 'Missing';
  /** The reason recorded against the dependent object for leaving prerequisites out. Object-grain,
   * from before waivers moved to the pair — kept readable, no longer written. */
  waiverReason?: string;
  /** This exact (object, prerequisite) pair has been accepted as deliberately out of scope. */
  waived?: boolean;
  waivedBy?: string;
  waivedReason?: string;
}

/** Every prerequisite of every in-scope object, resolved on both ends and marked in-scope or not.
 *
 * `useMissingPrerequisites` answers only half of this — the gaps — which is what a warning banner
 * needs. The wizard's Dependency Check step is a working screen rather than a warning: it has to
 * show the prerequisites that are fine too, or there is no way to tell a scope that has been
 * checked from one that has no dependencies at all. */
export function useDependencyCheck(subprojectId?: string) {
  return useQuery({
    queryKey: ['dependency-check', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<DependencyCheckRow[]> => {
      const { data: rows, error: e1 } = await supabase
        .from('subproject_objects')
        .select('migration_object_id, waiver_reason')
        .eq('subproject_id', subprojectId!).eq('in_scope', true);
      if (e1) throw e1;
      const inScopeIds = (rows ?? []).map((r: any) => r.migration_object_id as string);
      if (inScopeIds.length === 0) return [];
      const legacyWaivers = new Map((rows ?? []).map((r: any) => [r.migration_object_id, r.waiver_reason ?? undefined]));

      const { data: deps, error: e2 } = await supabase
        .from('object_dependencies')
        .select('migration_object_id, requires_object_id, mandatory, mo:migration_objects!object_dependencies_migration_object_id_fkey(object_id, description, component, category), req:migration_objects!object_dependencies_requires_object_id_fkey(object_id, description, component, category)')
        .in('migration_object_id', inScopeIds);
      if (e2) throw e2;

      // Pair-grain waivers (0044). Fetched alongside rather than joined, because the rows are few
      // and a left join here would multiply the dependency list by nothing useful.
      const { data: waivers, error: e3 } = await supabase
        .from('scope_waivers')
        .select('migration_object_id, requires_object_id, reason, waived_by')
        .eq('subproject_id', subprojectId!);
      if (e3) throw e3;
      const waivedBy = new Map((waivers ?? []).map((w: any) => [
        `${w.migration_object_id}::${w.requires_object_id}`,
        { reason: w.reason as string | null, by: w.waived_by as string | null },
      ]));

      const inScope = new Set(inScopeIds);
      return (deps ?? [])
        .map((d: any): DependencyCheckRow => ({
          objectId: d.migration_object_id,
          objectIdent: d.mo?.object_id ?? d.migration_object_id,
          objectName: d.mo?.description ?? undefined,
          objectComponent: d.mo?.component ?? undefined,
          requiresId: d.requires_object_id,
          requiresIdent: d.req?.object_id ?? d.requires_object_id,
          requiresName: d.req?.description ?? undefined,
          requiresComponent: d.req?.component ?? undefined,
          mandatory: !!d.mandatory,
          status: inScope.has(d.requires_object_id) ? 'In scope' : 'Missing',
          waiverReason: legacyWaivers.get(d.migration_object_id),
          waived: waivedBy.has(`${d.migration_object_id}::${d.requires_object_id}`),
          waivedReason: waivedBy.get(`${d.migration_object_id}::${d.requires_object_id}`)?.reason ?? undefined,
          waivedBy: waivedBy.get(`${d.migration_object_id}::${d.requires_object_id}`)?.by ?? undefined,
        }))
        .sort((a, b) => a.objectIdent.localeCompare(b.objectIdent) || a.requiresIdent.localeCompare(b.requiresIdent));
    },
  });
}

export interface ScopeDependency { objectId: string; requiresId: string; mandatory: boolean }

/** Dependency edges where BOTH ends are in scope — the ones load order actually has to respect.
 *
 * `useMissingPrerequisites` answers the opposite question (a prerequisite that isn't in scope at
 * all). Sequencing needs the edges that are: an object scheduled before something it requires is a
 * run that fails, and until now nothing in the app looked. */
export function useScopeDependencies(subprojectId?: string) {
  return useQuery({
    queryKey: ['scope-dependencies', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<ScopeDependency[]> => {
      const { data: rows, error: e1 } = await supabase
        .from('subproject_objects').select('migration_object_id').eq('subproject_id', subprojectId!).eq('in_scope', true);
      if (e1) throw e1;
      const inScopeIds = (rows ?? []).map((r) => r.migration_object_id as string);
      if (inScopeIds.length === 0) return [];
      const { data: deps, error: e2 } = await supabase
        .from('object_dependencies')
        .select('migration_object_id, requires_object_id, mandatory')
        .in('migration_object_id', inScopeIds);
      if (e2) throw e2;
      const inScope = new Set(inScopeIds);
      return (deps ?? [])
        .filter((d: any) => inScope.has(d.requires_object_id))
        .map((d: any) => ({ objectId: d.migration_object_id, requiresId: d.requires_object_id, mandatory: !!d.mandatory }));
    },
  });
}

export function useScopeMutations(subprojectId: string) {
  const queryClient = useQueryClient();
  // Resolved here rather than passed in by callers: otherwise every screen that waives a
  // prerequisite has to reach for the session itself, and the one that forgets writes an
  // anonymous waiver — which is the one field a waiver cannot do without.
  const { user } = useAuth();
  /** Changing what is in scope changes what the dependency check and the graph are about, so every
   * scope write has to clear all three — a stale check that still lists a prerequisite you just
   * pulled in is worse than no check. */
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['subproject-objects', subprojectId] });
    await queryClient.invalidateQueries({ queryKey: ['dependency-check', subprojectId] });
    await queryClient.invalidateQueries({ queryKey: ['scope-dependencies', subprojectId] });
    await queryClient.invalidateQueries({ queryKey: ['missing-prereqs', subprojectId] });
    // `setAssignee` writes consultant / etl_developer on this same table, and this cache is what
    // `useScopeObjectOwners` reads. Leaving it stale meant assigning yourself as an object's
    // consultant did not make you its owner anywhere it mattered: the FMD viewer kept Publish
    // disabled (canPublish reads isOwner from here) until the 30s staleTime expired or the page
    // was reloaded. Not keyed by subproject — the query fetches every subproject at once.
    await queryClient.invalidateQueries({ queryKey: ['scope-object-owners'] });
  };

  return {
    async setInScope(migrationObjectId: string, inScope: boolean) {
      const { error } = await supabase
        .from('subproject_objects')
        .upsert({ subproject_id: subprojectId, migration_object_id: migrationObjectId, in_scope: inScope }, { onConflict: 'subproject_id,migration_object_id' });
      if (error) throw error;
      await invalidate();
    },
    /** Puts many objects in or out of scope at once — the catalogue's select-all, and the
     * dependency check's "pull every missing prerequisite in". */
    async setInScopeBulk(migrationObjectIds: string[], inScope: boolean) {
      if (migrationObjectIds.length === 0) return;
      const { error } = await supabase
        .from('subproject_objects')
        .upsert(
          migrationObjectIds.map((id) => ({
            subproject_id: subprojectId, migration_object_id: id, in_scope: inScope,
          })),
          { onConflict: 'subproject_id,migration_object_id' },
        );
      if (error) throw error;
      await invalidate();
    },
    /** The Mapping step's verdict. A blank status clears it back to unreviewed. */
    async setMappingStatus(migrationObjectId: string, status: string | null, note?: string) {
      const { error } = await supabase
        .from('subproject_objects')
        .upsert(
          {
            subproject_id: subprojectId, migration_object_id: migrationObjectId, in_scope: true,
            mapping_status: status, mapping_note: note?.trim() || null,
          },
          { onConflict: 'subproject_id,migration_object_id' },
        );
      if (error) throw error;
      await invalidate();
    },
    /** Same verdict, applied to a selection — confirming forty already-checked objects one row at
     * a time is the reason people stop using a review step. */
    async setMappingStatusBulk(migrationObjectIds: string[], status: string | null) {
      if (migrationObjectIds.length === 0) return;
      const { error } = await supabase
        .from('subproject_objects')
        .upsert(
          migrationObjectIds.map((id) => ({
            subproject_id: subprojectId, migration_object_id: id, in_scope: true, mapping_status: status,
          })),
          { onConflict: 'subproject_id,migration_object_id' },
        );
      if (error) throw error;
      await invalidate();
    },
    // `setWaiverReason` was removed with 0044. `subproject_objects.waiver_reason` is still READ —
    // a reason recorded before the split is still true about that object — but nothing writes it
    // any more. Keeping a writer for the superseded grain would produce waivers the pair-grain
    // Dependency Check can neither show against the right prerequisite nor un-waive.
    /** Assigns one of the two roles. Blank clears it — an assignment nobody has made should read
     * as unassigned rather than as an empty string that sorts and filters like a name. */
    async setAssignee(migrationObjectId: string, role: 'consultant' | 'etlDeveloper', who: string) {
      const column = role === 'consultant' ? 'consultant' : 'etl_developer';
      const { error } = await supabase
        .from('subproject_objects')
        .upsert(
          { subproject_id: subprojectId, migration_object_id: migrationObjectId, [column]: who.trim() || null, in_scope: true },
          { onConflict: 'subproject_id,migration_object_id' },
        );
      if (error) throw error;
      await invalidate();
    },
    /** Points this subproject's object at an FMD, or clears it.
     *
     * The FMD is not moved or copied — many subprojects may reference the same row, which is what
     * makes a Custom FMD reusable. Un-assigning leaves the document alone; it only stops this
     * subproject using it. */
    async assignFmd(migrationObjectId: string, fmdId: string | null) {
      const { error } = await supabase
        .from('subproject_objects')
        .upsert(
          { subproject_id: subprojectId, migration_object_id: migrationObjectId, fmd_id: fmdId, in_scope: true },
          { onConflict: 'subproject_id,migration_object_id' },
        );
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['assignable-fmds', migrationObjectId] });
      await queryClient.invalidateQueries({ queryKey: ['fmd-assignments'] });
      // Where-used is derived from exactly this column, so an assignment that doesn't clear these
      // leaves the FMD's Where-used tab reporting the previous answer — which is the surface people
      // check to decide whether an FMD is safe to change.
      await queryClient.invalidateQueries({ queryKey: ['fmd-usage'] });
      await queryClient.invalidateQueries({ queryKey: ['object-scope-usage', migrationObjectId] });
      await invalidate();
    },
    /** Renumbers many objects in one round-trip.
     *
     * Auto-sequencing fifty objects one write at a time is fifty requests and fifty chances to end
     * up half-applied; a single upsert either lands or doesn't. */
    async setLoadSeqBulk(entries: { migrationObjectId: string; loadSeq: number }[]) {
      if (entries.length === 0) return;
      const { error } = await supabase
        .from('subproject_objects')
        .upsert(
          entries.map((e) => ({
            subproject_id: subprojectId, migration_object_id: e.migrationObjectId,
            load_seq: e.loadSeq, in_scope: true,
          })),
          { onConflict: 'subproject_id,migration_object_id' },
        );
      if (error) throw error;
      await invalidate();
    },
    /** Accepts one missing prerequisite as deliberate. Keyed on the PAIR, so an object with four
     * gaps can have three covered elsewhere and one still outstanding — which one column on the
     * object could never say. */
    async waivePrerequisite(migrationObjectId: string, requiresObjectId: string, reason: string) {
      const { error } = await supabase.from('scope_waivers').upsert({
        subproject_id: subprojectId,
        migration_object_id: migrationObjectId,
        requires_object_id: requiresObjectId,
        reason: reason.trim() || null,
        waived_by: user?.email ?? user?.id ?? null,
      }, { onConflict: 'subproject_id,migration_object_id,requires_object_id' });
      if (error) throw error;
      await invalidate();
    },
    async unwaivePrerequisite(migrationObjectId: string, requiresObjectId: string) {
      const { error } = await supabase.from('scope_waivers').delete()
        .eq('subproject_id', subprojectId)
        .eq('migration_object_id', migrationObjectId)
        .eq('requires_object_id', requiresObjectId);
      if (error) throw error;
      await invalidate();
    },
    async setScopeFinalized(finalized: boolean) {
      const { error } = await supabase.from('subprojects').update({ scope_finalized: finalized }).eq('id', subprojectId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['subproject', subprojectId] });
      await queryClient.invalidateQueries({ queryKey: ['subprojects'] });
    },
    async setLoadSeq(migrationObjectId: string, loadSeq: number) {
      const { error } = await supabase
        .from('subproject_objects')
        .upsert({ subproject_id: subprojectId, migration_object_id: migrationObjectId, load_seq: loadSeq, in_scope: true }, { onConflict: 'subproject_id,migration_object_id' });
      if (error) throw error;
      await invalidate();
    },
  };
}

import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';

export interface ReplicateSubprojectInput {
  /** The subproject being copied. Its project is the copy's project — a replica is a sibling wave,
   * not a wave somewhere else. */
  sourceSubprojectId: string;
  code: string;
  name: string;
  /** The plants the copy covers. Never the source's: a plant belongs to one subproject per project
   * (migration 0062), so a replica by definition covers different sites — that is the whole reason
   * to make one. */
  plantIds: string[];
}

export interface ReplicateSubprojectResult {
  subprojectId: string;
  objectsCopied: number;
  waiversCopied: number;
  fmdsReused: number;
}

/** Copies a subproject's SCOPE onto a new one covering different plants.
 *
 * The case this exists for: two sets of plants migrate the same objects the same way, and the only
 * real difference between their waves is which sites they cover. Rebuilding that scope by hand
 * means re-selecting forty objects, re-assigning every owner, re-deciding every waiver, and
 * re-generating FMDs that would come out identical — hours of work whose only possible outcome is
 * the copy you started with, plus whatever was mistyped along the way.
 *
 * ── What is copied, and what is deliberately not ──────────────────────────────────────────────
 *  · The subproject's own fields — dates, status, description. A replica plans like its source
 *    until someone says otherwise.
 *  · `subproject_objects` verbatim, INCLUDING `fmd_id`. That is what "reuse the FMD" means: the
 *    copy points at the same document rather than getting a duplicate of it. Two identical FMDs
 *    would be two things to maintain, and the second one would start drifting the first time
 *    anyone edited either.
 *  · `scope_waivers` — a waiver says "this prerequisite is deliberately out of scope", which is a
 *    decision about the same objects and stays true for the copy. Re-deciding each one by hand
 *    would be busywork with a wrong answer available.
 *  · NOT cycles. A cycle carries the dates of an actual load run; copying them would put another
 *    wave's mock-load window on a wave that has not been planned yet.
 *  · NOT `scope_candidates` — the wizard's working list, not part of a finished scope.
 *  · NOT plants, obviously: those are the input.
 *
 * ── Not a transaction ─────────────────────────────────────────────────────────────────────────
 * PostgREST has no cross-request transaction, so this is several writes in sequence. Ordered so a
 * failure leaves something a person can finish rather than something broken: the subproject first,
 * then plants, then scope. A failure partway leaves a real subproject with part of its scope, which
 * the normal screens can complete or delete — as against writing scope rows first and orphaning
 * them against a subproject that was never created.
 */
export function useReplicateSubproject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return {
    async replicate(input: ReplicateSubprojectInput): Promise<ReplicateSubprojectResult> {
      const { sourceSubprojectId, plantIds } = input;
      const code = input.code.trim();
      const name = input.name.trim();
      if (!code || !name) throw new Error('The copy needs a code and a name.');
      if (plantIds.length === 0) throw new Error('Choose at least one plant for the copy.');

      const who = user?.email ?? 'Unknown';

      const { data: source, error: sourceError } = await supabase
        .from('subprojects').select('*').eq('id', sourceSubprojectId).single();
      if (sourceError) throw sourceError;
      if (!source) throw new Error('Could not find the subproject to copy.');

      /* Everything except identity, placement and audit. Spread-then-delete rather than an explicit
         field list: a column added to subprojects later should be copied by default, because the
         failure mode of forgetting one is a replica that silently differs from its source, while
         the failure mode of copying one too many is visible and fixable. */
      const { id: _id, code: _code, name: _name, created_at: _ca, created_by: _cb,
        changed_at: _ma, changed_by: _mb, archived_at: _aa, archived_by: _ab, archived_via: _av,
        ...carried } = source as Record<string, any>;

      const { data: created, error: createError } = await supabase
        .from('subprojects')
        .insert({ ...carried, code, name, created_by: who, changed_by: who })
        .select('id').single();
      if (createError) throw createError;
      const subprojectId = created.id as string;

      // Plants next. 0062's trigger rejects a plant already held by a sibling — the error names the
      // subproject holding it, so a clash that slipped past the picker still reads as an answer.
      const { error: plantError } = await supabase.from('subproject_plants').insert(
        plantIds.map((plant_id) => ({ subproject_id: subprojectId, plant_id, assigned_by: who })),
      );
      if (plantError) throw plantError;

      const { data: objects, error: objectsError } = await supabase
        .from('subproject_objects').select('*').eq('subproject_id', sourceSubprojectId);
      if (objectsError) throw objectsError;

      const rows: Record<string, any>[] = (objects ?? []).map((o: Record<string, any>) => {
        const { id: _oid, subproject_id: _osp, ...rest } = o;
        return { ...rest, subproject_id: subprojectId };
      });
      if (rows.length > 0) {
        const { error } = await supabase.from('subproject_objects').insert(rows);
        if (error) throw error;
      }

      const { data: waivers, error: waiversError } = await supabase
        .from('scope_waivers').select('*').eq('subproject_id', sourceSubprojectId);
      if (waiversError) throw waiversError;

      const waiverRows = (waivers ?? []).map((w: Record<string, any>) => ({
        ...w, subproject_id: subprojectId, waived_by: w.waived_by ?? who,
      }));
      if (waiverRows.length > 0) {
        const { error } = await supabase.from('scope_waivers').insert(waiverRows);
        if (error) throw error;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hierarchy'] }),
        queryClient.invalidateQueries({ queryKey: ['subproject-plants'] }),
        queryClient.invalidateQueries({ queryKey: ['plants'] }),
        queryClient.invalidateQueries({ queryKey: ['subproject-objects'] }),
        queryClient.invalidateQueries({ queryKey: ['fmds-library'] }),
      ]);

      return {
        subprojectId,
        objectsCopied: rows.length,
        waiversCopied: waiverRows.length,
        // How many of the copied rows carry an FMD — the number worth reporting, because it is the
        // work that did NOT have to be redone.
        fmdsReused: rows.filter((r) => !!r.fmd_id).length,
      };
    },
  };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';

export interface Plant {
  id: string;
  programId: string;
  code: string;
  name: string;
  country?: string;
  city?: string;
  archivedAt?: string;
  archivedBy?: string;
  createdAt?: string;
  createdBy?: string;
  changedAt?: string;
  changedBy?: string;
}

/** A plant plus where it is used. `subprojectIds` is what the maintenance list counts and what
 * stops a plant being retired while a wave still covers it. */
export interface PlantRow extends Plant {
  subprojectIds: string[];
}

const toPlant = (r: any): Plant => ({
  id: r.id,
  programId: r.program_id,
  code: r.code,
  name: r.name,
  country: r.country ?? undefined,
  city: r.city ?? undefined,
  archivedAt: r.archived_at ?? undefined,
  archivedBy: r.archived_by ?? undefined,
  createdAt: r.created_at ?? undefined,
  createdBy: r.created_by ?? undefined,
  changedAt: r.changed_at ?? undefined,
  changedBy: r.changed_by ?? undefined,
});

/** Every plant the user can reach, with its subproject assignments.
 *
 * Two flat queries joined in memory rather than one nested embed. A PostgREST embed returns null
 * for the whole nested level as soon as RLS filters any part of it, which reads as "no assignments"
 * and is indistinguishable from the truth — the trap documented at length in hierarchy.ts. */
export function usePlants(programId?: string, includeArchived = false, enabled = true) {
  return useQuery({
    queryKey: ['plants', programId ?? '', includeArchived],
    enabled,
    queryFn: async (): Promise<PlantRow[]> => {
      let q = supabase.from('plants').select('*');
      if (programId) q = q.eq('program_id', programId);
      if (!includeArchived) q = q.is('archived_at', null);
      const { data, error } = await q.order('code');
      if (error) throw error;

      const plants = (data ?? []).map(toPlant);
      if (plants.length === 0) return [];

      const { data: links, error: linkError } = await supabase
        .from('subproject_plants')
        .select('subproject_id, plant_id')
        .in('plant_id', plants.map((p) => p.id));
      if (linkError) throw linkError;

      const bySubproject = new Map<string, string[]>();
      for (const l of links ?? []) {
        bySubproject.set(l.plant_id, [...(bySubproject.get(l.plant_id) ?? []), l.subproject_id]);
      }
      return plants.map((p) => ({ ...p, subprojectIds: bySubproject.get(p.id) ?? [] }));
    },
  });
}

/** Plant ids per subproject, for the whole tree at once.
 *
 * One query for every subproject rather than one per row: the hierarchy renders dozens of
 * subprojects and each needs its plant list, which is the shape that turns into a request storm if
 * it is fetched per node. */
export function useSubprojectPlants(enabled = true) {
  return useQuery({
    queryKey: ['subproject-plants'],
    enabled,
    queryFn: async (): Promise<Map<string, string[]>> => {
      const { data, error } = await supabase.from('subproject_plants').select('subproject_id, plant_id');
      if (error) throw error;
      const out = new Map<string, string[]>();
      for (const r of data ?? []) {
        out.set(r.subproject_id, [...(out.get(r.subproject_id) ?? []), r.plant_id]);
      }
      return out;
    },
  });
}

export interface PlantForm {
  code: string;
  name: string;
  country?: string;
  city?: string;
}

export function usePlantMutations(programId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const who = user?.email ?? 'Unknown';

  /** Every cache that reads either table. `hierarchy` is included because a subproject row shows
   * its plants — a rename that did not reach it would leave two different names for one site on
   * screen at the same time. */
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['plants'] });
    await queryClient.invalidateQueries({ queryKey: ['subproject-plants'] });
    await queryClient.invalidateQueries({ queryKey: ['hierarchy'] });
  };

  return {
    async create(form: PlantForm) {
      if (!programId) throw new Error('No program selected.');
      const { error } = await supabase.from('plants').insert({
        program_id: programId,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        country: form.country?.trim() || null,
        city: form.city?.trim() || null,
        created_by: who,
      });
      if (error) throw error;
      await invalidate();
    },

    async update(id: string, form: PlantForm) {
      const { error } = await supabase.from('plants').update({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        country: form.country?.trim() || null,
        city: form.city?.trim() || null,
        changed_by: who,
        changed_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },

    /** Retires a plant. Never a delete: a plant that was migrated is part of the record of what
     * happened, and the change log referencing a row that no longer exists is a dead end. The
     * partial unique index is on live rows only, so retiring frees the code for reuse. */
    async archive(id: string) {
      const { error } = await supabase.from('plants').update({
        archived_at: new Date().toISOString(), archived_by: who,
      }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },

    async restore(id: string) {
      const { error } = await supabase.from('plants')
        .update({ archived_at: null, archived_by: null }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },

    /** Replaces a subproject's plants wholesale.
     *
     * Diffed rather than delete-all-then-insert: rewriting every row would log a removal and an
     * addition for every plant that did not change, and the change log is the thing that makes
     * "who put this site in this wave" answerable. */
    async setSubprojectPlants(subprojectId: string, plantIds: string[]) {
      const { data: existing, error: readError } = await supabase
        .from('subproject_plants').select('plant_id').eq('subproject_id', subprojectId);
      if (readError) throw readError;

      const before = new Set((existing ?? []).map((r: any) => r.plant_id as string));
      const after = new Set(plantIds);
      const added = plantIds.filter((id) => !before.has(id));
      const removed = [...before].filter((id) => !after.has(id));

      if (added.length > 0) {
        const { error } = await supabase.from('subproject_plants').insert(
          added.map((plant_id) => ({ subproject_id: subprojectId, plant_id, assigned_by: who })),
        );
        if (error) throw error;
      }
      if (removed.length > 0) {
        const { error } = await supabase.from('subproject_plants')
          .delete().eq('subproject_id', subprojectId).in('plant_id', removed);
        if (error) throw error;
      }
      await invalidate();
    },
  };
}

/** The mutation hook wrapped for callers that want pending state. Kept separate so the plain object
 * above stays usable from anywhere without a component. */
export function usePlantSaveMutation(programId?: string) {
  const m = usePlantMutations(programId);
  return useMutation({
    mutationFn: async (args: { id?: string; form: PlantForm }) => (
      args.id ? m.update(args.id, args.form) : m.create(args.form)
    ),
  });
}

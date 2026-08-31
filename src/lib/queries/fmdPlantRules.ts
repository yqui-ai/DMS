import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';

/** One plant's override of a mapping row's rules.
 *
 * `transformationRule` and `technicalRule` are independently optional: a plant may differ only in
 * the business rule, only in the SQL, or in neither while still carrying a note explaining why it
 * was checked and found the same. Undefined means "no override — use the row's rule"; an empty
 * string is a real value meaning "this plant maps nothing here", and the two must not be conflated. */
export interface FmdPlantRule {
  id: string;
  fmdId: string;
  structureId: string;
  rowKey: string;
  plantId: string;
  transformationRule?: string;
  technicalRule?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  changedBy?: string;
  changedAt?: string;
}

const toRule = (r: any): FmdPlantRule => ({
  id: r.id, fmdId: r.fmd_id, structureId: r.structure_id, rowKey: r.row_key, plantId: r.plant_id,
  transformationRule: r.transformation_rule ?? undefined,
  technicalRule: r.technical_rule ?? undefined,
  note: r.note ?? undefined,
  createdBy: r.created_by, createdAt: r.created_at,
  changedBy: r.changed_by ?? undefined, changedAt: r.changed_at ?? undefined,
});

/** Every per-plant rule on one FMD.
 *
 * Fetched per FMD rather than per row, like the field notes: the dialog filters this down, the grid
 * needs a per-row count to draw its indicator, and a query per row-click would be slower and lose
 * the counts everywhere else. */
export function useFmdPlantRules(fmdId?: string) {
  return useQuery({
    queryKey: ['fmd-plant-rules', fmdId],
    enabled: !!fmdId,
    queryFn: async (): Promise<FmdPlantRule[]> => {
      const { data, error } = await supabase
        .from('fmd_plant_rules').select('*').eq('fmd_id', fmdId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toRule);
    },
  });
}

/** rowKey -> how many plants override that row. What the grid's indicator reads. */
export const plantRuleCountByRow = (rules: FmdPlantRule[], structureId: string): Map<string, number> => {
  const out = new Map<string, number>();
  for (const r of rules) {
    if (r.structureId !== structureId) continue;
    out.set(r.rowKey, (out.get(r.rowKey) ?? 0) + 1);
  }
  return out;
};

export function useFmdPlantRuleMutations(fmdId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['fmd-plant-rules', fmdId] });

  return {
    /** Creates or updates one plant's override for one row.
     *
     * Upserted on the unique key rather than read-then-write: two people opening the same row's
     * dialog would otherwise both see "no rule yet" and both insert, and the second would fail on
     * the constraint with an error about a duplicate key that means nothing to the person reading
     * it. */
    async save(
      structureId: string,
      rowKey: string,
      plantId: string,
      values: { transformationRule?: string; technicalRule?: string; note?: string },
    ): Promise<void> {
      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('fmd_plant_rules')
        .upsert({
          fmd_id: fmdId, structure_id: structureId, row_key: rowKey, plant_id: plantId,
          transformation_rule: values.transformationRule ?? null,
          technical_rule: values.technicalRule ?? null,
          note: values.note?.trim() || null,
          created_by: who, changed_by: who, changed_at: now,
        }, { onConflict: 'fmd_id,structure_id,row_key,plant_id' });
      if (error) throw error;
      await invalidate();
    },

    /** Removes an override, so the plant falls back to the row's own rule. Deleting is the ONLY way
     * to express that — clearing the fields would store empty strings, which mean "this plant maps
     * nothing", a different and much louder statement. */
    async clear(structureId: string, rowKey: string, plantId: string): Promise<void> {
      const { error } = await supabase
        .from('fmd_plant_rules').delete()
        .eq('fmd_id', fmdId).eq('structure_id', structureId)
        .eq('row_key', rowKey).eq('plant_id', plantId);
      if (error) throw error;
      await invalidate();
    },
  };
}

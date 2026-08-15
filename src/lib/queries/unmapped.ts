import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { UnmappedValue } from '../../types/entities';

const toUnmapped = (u: any): UnmappedValue => ({
  id: u.id, waveId: u.wave_id, setName: u.set_name, migrationObjectId: u.migration_object_id ?? undefined,
  field: u.field ?? undefined, value: u.value, occurrences: u.occurrences ?? 0, owner: u.owner ?? undefined,
  status: u.status, suggestion: u.suggestion ?? undefined,
});

export function useUnmappedValues(waveId?: string) {
  return useQuery({
    queryKey: ['unmapped-values', waveId],
    enabled: !!waveId,
    queryFn: async (): Promise<UnmappedValue[]> => {
      const { data, error } = await supabase.from('unmapped_values').select('*').eq('wave_id', waveId!).order('occurrences', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toUnmapped);
    },
  });
}

export function useUnmappedValueMutations(waveId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['unmapped-values', waveId] });
  return {
    async setStatus(id: string, status: UnmappedValue['status']) {
      const { error } = await supabase.from('unmapped_values').update({ status }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

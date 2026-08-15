import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { CheckTable, CheckTableRow } from '../../types/entities';

export function useCheckTables(subprojectId?: string) {
  return useQuery({
    queryKey: ['check-tables', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<CheckTable[]> => {
      const { data, error } = await supabase.from('check_tables').select('*').eq('subproject_id', subprojectId!).order('table_name');
      if (error) throw error;
      return (data ?? []).map((t) => ({
        id: t.id, subprojectId: t.subproject_id, tableName: t.table_name, domain: t.domain ?? undefined,
        field: t.field ?? undefined, usedBy: t.used_by ?? undefined, description: t.description ?? undefined,
        columns: t.columns ?? [],
      }));
    },
  });
}

export function useCheckTableRows(checkTableId?: string) {
  return useQuery({
    queryKey: ['check-table-rows', checkTableId],
    enabled: !!checkTableId,
    queryFn: async (): Promise<CheckTableRow[]> => {
      const { data, error } = await supabase.from('check_table_rows').select('*').eq('check_table_id', checkTableId!).order('seq');
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, checkTableId: r.check_table_id, seq: r.seq, values: r.values ?? [] }));
    },
  });
}

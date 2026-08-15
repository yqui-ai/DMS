import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { ExtractionJob, SelectionCriterion, SourceTable, StagingDb } from '../../types/entities';

const toSourceTable = (t: any): SourceTable => ({
  id: t.id, subprojectId: t.subproject_id, connectionId: t.connection_id, name: t.name, tier: t.tier, inScope: t.in_scope,
  records: t.records ?? undefined, expected: t.expected ?? undefined, status: t.status,
  extractedOn: t.extracted_on ?? undefined, executedBy: t.executed_by ?? undefined, durationS: t.duration_s ?? undefined,
  snapshot: t.snapshot ?? undefined, dqScore: t.dq_score ?? undefined, loadType: t.load_type ?? undefined,
});

export function useStagingDb(subprojectId?: string) {
  return useQuery({
    queryKey: ['staging-db', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<StagingDb | null> => {
      const { data, error } = await supabase.from('staging_db').select('*').eq('subproject_id', subprojectId!).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        subprojectId: data.subproject_id, engine: data.engine ?? undefined, host: data.host ?? undefined,
        schemaName: data.schema_name ?? undefined, retention: data.retention ?? undefined,
        owner: data.owner ?? undefined, lastIngestion: data.last_ingestion ?? undefined,
      };
    },
  });
}

export function useSourceTables(subprojectId?: string) {
  return useQuery({
    queryKey: ['source-tables', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<SourceTable[]> => {
      const { data, error } = await supabase.from('source_tables').select('*').eq('subproject_id', subprojectId!).order('name');
      if (error) throw error;
      return (data ?? []).map(toSourceTable);
    },
  });
}

export function useSelectionCriteria(subprojectId?: string) {
  return useQuery({
    queryKey: ['selection-criteria', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<SelectionCriterion[]> => {
      const { data, error } = await supabase.from('selection_criteria').select('*').eq('subproject_id', subprojectId!);
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id, subprojectId: c.subproject_id, connectionId: c.connection_id ?? undefined, tableName: c.table_name,
        mode: c.mode, field: c.field ?? undefined, condition: c.condition ?? undefined, value: c.value ?? undefined, scope: c.scope,
      }));
    },
  });
}

export function useSelectionCriteriaMutations(subprojectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['selection-criteria', subprojectId] });
  return {
    async create(c: { connectionId?: string; tableName: string; mode: 'Simple' | 'Complex'; field?: string; condition?: string; value?: string; scope: 'Table' | 'Cross-table' }) {
      const { error } = await supabase.from('selection_criteria').insert({
        subproject_id: subprojectId, connection_id: c.connectionId ?? null, table_name: c.tableName, mode: c.mode,
        field: c.field ?? null, condition: c.condition ?? null, value: c.value ?? null, scope: c.scope,
      });
      if (error) throw error;
      await invalidate();
    },
    async remove(id: string) {
      const { error } = await supabase.from('selection_criteria').delete().eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

export function useExtractionJobs(subprojectId?: string) {
  return useQuery({
    queryKey: ['extraction-jobs', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<ExtractionJob[]> => {
      const { data, error } = await supabase.from('extraction_jobs').select('*').eq('subproject_id', subprojectId!);
      if (error) throw error;
      return (data ?? []).map((j) => ({
        id: j.id, subprojectId: j.subproject_id, connectionId: j.connection_id, name: j.name, schedule: j.schedule ?? undefined,
        status: j.status, lastRun: j.last_run ?? undefined, groupIds: [],
      }));
    },
  });
}

export function useStagingRows(sourceTableId?: string) {
  return useQuery({
    queryKey: ['staging-rows', sourceTableId],
    enabled: !!sourceTableId,
    queryFn: async (): Promise<Record<string, string>[]> => {
      const { data, error } = await supabase.from('staging_rows').select('row_data').eq('source_table_id', sourceTableId!).order('seq').limit(8);
      if (error) throw error;
      return (data ?? []).map((r) => r.row_data as Record<string, string>);
    },
  });
}

export function useSourceTableMutations(subprojectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['source-tables', subprojectId] });
  return {
    async extract(id: string, executedBy: string) {
      const { error } = await supabase.from('source_tables').update({
        status: 'Extracted', extracted_on: new Date().toISOString(), executed_by: executedBy,
      }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
    async toggleScope(id: string, inScope: boolean) {
      const { error } = await supabase.from('source_tables').update({ in_scope: inScope }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

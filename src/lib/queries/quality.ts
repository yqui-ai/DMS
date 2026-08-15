import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { DqCheck, DqDimension, FalloutRecord, Reconciliation } from '../../types/entities';

export function useDqDimensions(subprojectId?: string) {
  return useQuery({
    queryKey: ['dq-dimensions', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<DqDimension[]> => {
      const { data, error } = await supabase.from('dq_dimensions').select('*').eq('subproject_id', subprojectId!);
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id, subprojectId: d.subproject_id, dimension: d.dimension, description: d.description ?? undefined,
        threshold: d.threshold ?? undefined, actual: d.actual ?? undefined,
      }));
    },
  });
}

export function useDqChecks(subprojectId: string | undefined, phase: 'pre-load' | 'post-load' | 'post-transform') {
  return useQuery({
    queryKey: ['dq-checks', subprojectId, phase],
    enabled: !!subprojectId,
    queryFn: async (): Promise<DqCheck[]> => {
      const { data, error } = await supabase.from('dq_checks').select('*').eq('subproject_id', subprojectId!).eq('phase', phase);
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id, subprojectId: c.subproject_id, phase: c.phase, code: c.code, migrationObjectId: c.migration_object_id ?? undefined,
        description: c.description ?? undefined, expected: c.expected ?? undefined, actual: c.actual ?? undefined, result: c.result ?? undefined,
      }));
    },
  });
}

export function useReconciliation(subprojectId?: string) {
  return useQuery({
    queryKey: ['reconciliation', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<Reconciliation[]> => {
      const { data, error } = await supabase.from('reconciliation').select('*, runs!inner(subproject_id)').eq('runs.subproject_id', subprojectId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id, runId: r.run_id, migrationObjectId: r.migration_object_id ?? undefined, srcCount: r.src_count ?? 0,
        tgtCount: r.tgt_count ?? 0, variance: r.variance ?? 0, signedOffBy: r.signed_off_by ?? undefined, signedOffAt: r.signed_off_at ?? undefined,
      }));
    },
  });
}

export function useFallout(subprojectId?: string) {
  return useQuery({
    queryKey: ['fallout', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<FalloutRecord[]> => {
      const { data, error } = await supabase.from('fallout_records').select('*, runs!inner(subproject_id)').eq('runs.subproject_id', subprojectId!).limit(200);
      if (error) throw error;
      return (data ?? []).map((f: any) => ({
        id: f.id, runId: f.run_id, ruleCode: f.rule_code ?? undefined, keyValue: f.key_value ?? undefined,
        reason: f.reason ?? undefined, payload: f.payload,
      }));
    },
  });
}

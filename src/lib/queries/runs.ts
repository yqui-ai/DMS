import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Run, RunLogEntry } from '../../types/entities';

const toRun = (r: any): Run => ({
  id: r.id, code: r.code, subprojectId: r.subproject_id, cycleId: r.cycle_id ?? undefined, etlObjectId: r.etl_object_id ?? undefined,
  migrationObjectId: r.migration_object_id ?? undefined, iteration: r.iteration ?? 1, mode: r.mode ?? undefined,
  env: r.env ?? undefined, target: r.target ?? undefined, approach: r.approach ?? undefined,
  fmdVersion: r.fmd_version ?? undefined, rulesVersion: r.rules_version ?? undefined, xrefVersion: r.xref_version ?? undefined,
  stagingSnapshot: r.staging_snapshot ?? undefined, startedAt: r.started_at ?? undefined, durationS: r.duration_s ?? undefined,
  runBy: r.run_by ?? undefined, srcCount: r.src_count ?? 0, tgtCount: r.tgt_count ?? 0, rejCount: r.rej_count ?? 0, status: r.status,
});

export function useRuns(subprojectId?: string) {
  return useQuery({
    queryKey: ['runs', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<Run[]> => {
      const { data, error } = await supabase.from('runs').select('*').eq('subproject_id', subprojectId!).order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toRun);
    },
  });
}

export function useRun(runId?: string) {
  return useQuery({
    queryKey: ['run', runId],
    enabled: !!runId,
    queryFn: async (): Promise<Run | null> => {
      const { data, error } = await supabase.from('runs').select('*').eq('id', runId!).maybeSingle();
      if (error) throw error;
      return data ? toRun(data) : null;
    },
  });
}

export function useRunLog(runId?: string) {
  return useQuery({
    queryKey: ['run-log', runId],
    enabled: !!runId,
    queryFn: async (): Promise<RunLogEntry[]> => {
      const { data, error } = await supabase.from('run_log').select('*').eq('run_id', runId!).order('seq');
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id, runId: l.run_id, seq: l.seq, stream: l.stream, objectName: l.object_name ?? undefined,
        objectType: l.object_type ?? undefined, state: l.state ?? undefined, rowCount: l.row_count ?? undefined,
        elapsedMs: l.elapsed_ms ?? undefined, line: l.line ?? undefined,
      }));
    },
  });
}

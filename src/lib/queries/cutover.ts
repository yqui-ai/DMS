import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { CutoverTask } from '../../types/entities';

const toTask = (t: any): CutoverTask => ({
  id: t.id, subprojectId: t.subproject_id, seq: t.seq ?? undefined, name: t.name, owner: t.owner ?? undefined,
  plannedStart: t.planned_start ?? undefined, plannedEnd: t.planned_end ?? undefined,
  dependsOn: t.depends_on ?? undefined, status: t.status,
});

export function useCutoverTasks(subprojectId?: string) {
  return useQuery({
    queryKey: ['cutover-tasks', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<CutoverTask[]> => {
      const { data, error } = await supabase.from('cutover_tasks').select('*').eq('subproject_id', subprojectId!).order('seq');
      if (error) throw error;
      return (data ?? []).map(toTask);
    },
  });
}

export function useCutoverMutations(subprojectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cutover-tasks', subprojectId] });
  return {
    async setStatus(id: string, status: CutoverTask['status']) {
      const { error } = await supabase.from('cutover_tasks').update({ status }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

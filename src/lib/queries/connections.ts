import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Connection } from '../../types/entities';

const toConnection = (c: any): Connection => ({
  id: c.id, programId: c.program_id, sid: c.sid, description: c.description, type: c.type,
  host: c.host ?? undefined, client: c.client ?? undefined, role: c.role, envs: c.envs ?? undefined, status: c.status,
});

export function useConnections(programId?: string) {
  return useQuery({
    queryKey: ['connections', programId],
    enabled: !!programId,
    queryFn: async (): Promise<Connection[]> => {
      const { data, error } = await supabase.from('connections').select('*').eq('program_id', programId!).order('sid');
      if (error) throw error;
      return (data ?? []).map(toConnection);
    },
  });
}

export function useConnectionMutations(programId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['connections', programId] });
  return {
    async setStatus(id: string, status: Connection['status']) {
      const { error } = await supabase.from('connections').update({ status }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

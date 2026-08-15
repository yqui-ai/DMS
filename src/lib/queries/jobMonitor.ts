import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { AuditEntry, Promotion } from '../../types/entities';

export function usePromotions(waveId?: string) {
  return useQuery({
    queryKey: ['promotions', waveId],
    enabled: !!waveId,
    queryFn: async (): Promise<Promotion[]> => {
      const { data, error } = await supabase.from('promotions').select('*').eq('wave_id', waveId!).order('requested_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id, waveId: p.wave_id, artefactType: p.artefact_type, artefactId: p.artefact_id ?? undefined,
        artefactName: p.artefact_name ?? undefined, fromEnv: p.from_env ?? undefined, toEnv: p.to_env ?? undefined,
        requestedBy: p.requested_by ?? undefined, requestedAt: p.requested_at ?? undefined, status: p.status,
      }));
    },
  });
}

export function usePromotionMutations(waveId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['promotions', waveId] });
  return {
    async setStatus(id: string, status: Promotion['status']) {
      const { error } = await supabase.from('promotions').update({ status }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

export function useAuditLog(waveId?: string) {
  return useQuery({
    queryKey: ['audit-log', waveId],
    enabled: !!waveId,
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data, error } = await supabase.from('audit_log').select('*').eq('wave_id', waveId!).order('at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id, projectId: a.project_id ?? undefined, waveId: a.wave_id ?? undefined, at: a.at, actor: a.actor ?? undefined,
        action: a.action, entity: a.entity ?? undefined, entityId: a.entity_id ?? undefined, before: a.before, after: a.after,
      }));
    },
  });
}

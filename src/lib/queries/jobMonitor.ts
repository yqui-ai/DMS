import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { AuditEntry, Promotion } from '../../types/entities';

export function usePromotions(subprojectId?: string) {
  return useQuery({
    queryKey: ['promotions', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<Promotion[]> => {
      const { data, error } = await supabase.from('promotions').select('*').eq('subproject_id', subprojectId!).order('requested_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id, subprojectId: p.subproject_id, artefactType: p.artefact_type, artefactId: p.artefact_id ?? undefined,
        artefactName: p.artefact_name ?? undefined, fromEnv: p.from_env ?? undefined, toEnv: p.to_env ?? undefined,
        requestedBy: p.requested_by ?? undefined, requestedAt: p.requested_at ?? undefined, status: p.status,
      }));
    },
  });
}

export function usePromotionMutations(subprojectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['promotions', subprojectId] });
  return {
    async setStatus(id: string, status: Promotion['status']) {
      const { error } = await supabase.from('promotions').update({ status }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

export function useAuditLog(subprojectId?: string) {
  return useQuery({
    queryKey: ['audit-log', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data, error } = await supabase.from('audit_log').select('*').eq('subproject_id', subprojectId!).order('at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id, programId: a.program_id ?? undefined, subprojectId: a.subproject_id ?? undefined, at: a.at, actor: a.actor ?? undefined,
        action: a.action, entity: a.entity ?? undefined, entityId: a.entity_id ?? undefined, before: a.before, after: a.after,
      }));
    },
  });
}

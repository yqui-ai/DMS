import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { AiProviderKey } from '../../types/entities';

const toKey = (k: any): AiProviderKey => ({
  id: k.id, projectId: k.project_id, provider: k.provider, label: k.label ?? undefined, endpoint: k.endpoint ?? undefined,
  keyMasked: k.key_masked ?? undefined, budget: k.budget ?? undefined, active: k.active, addedAt: k.added_at,
});

export function useAiProviderKeys(projectId?: string) {
  return useQuery({
    queryKey: ['ai-provider-keys', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<AiProviderKey[]> => {
      const { data, error } = await supabase.from('ai_provider_keys').select('*').eq('project_id', projectId!).order('added_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toKey);
    },
  });
}

export function useAiProviderKeyMutations(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ai-provider-keys', projectId] });
  return {
    async add(form: { provider: string; label?: string; endpoint?: string; key?: string; budget?: string }) {
      const { error } = await supabase.from('ai_provider_keys').insert({
        project_id: projectId, provider: form.provider, label: form.label || null, endpoint: form.endpoint || null,
        key_masked: form.key ? `••••${form.key.slice(-4)}` : null, budget: form.budget ? Number(form.budget) : null, active: true,
      });
      if (error) throw error;
      await invalidate();
    },
    async toggleActive(id: string, active: boolean) {
      const { error } = await supabase.from('ai_provider_keys').update({ active }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
    async remove(id: string) {
      const { error } = await supabase.from('ai_provider_keys').delete().eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { AiProviderKey } from '../../types/entities';

const toKey = (k: any): AiProviderKey => ({
  id: k.id, programId: k.program_id, provider: k.provider, label: k.label ?? undefined, endpoint: k.endpoint ?? undefined,
  keyMasked: k.key_masked ?? undefined, budget: k.budget ?? undefined, active: k.active, addedAt: k.added_at,
});

export function useAiProviderKeys(programId?: string) {
  return useQuery({
    queryKey: ['ai-provider-keys', programId],
    enabled: !!programId,
    queryFn: async (): Promise<AiProviderKey[]> => {
      const { data, error } = await supabase.from('ai_provider_keys').select('*').eq('program_id', programId!).order('added_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toKey);
    },
  });
}

export function useAiProviderKeyMutations(programId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ai-provider-keys', programId] });
  return {
    async add(form: { provider: string; label?: string; endpoint?: string; key?: string; budget?: string }) {
      const { error } = await supabase.from('ai_provider_keys').insert({
        program_id: programId, provider: form.provider, label: form.label || null, endpoint: form.endpoint || null,
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

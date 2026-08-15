import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import type { RoleId } from '../../types/entities';

/**
 * Resolves the current user's role for a given project (+ optional wave).
 * A membership with wave_id = null is programme-wide and applies to every wave in the project.
 * Falls back to 'guest' when signed out or no membership row matches.
 */
export function useCurrentRole(projectId?: string, waveId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['current-role', user?.id, projectId, waveId],
    enabled: !!user && !!projectId,
    queryFn: async (): Promise<RoleId> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('role_id, wave_id')
        .eq('user_id', user!.id)
        .eq('project_id', projectId!);
      if (error) throw error;
      const rows = data ?? [];
      const waveSpecific = waveId ? rows.find((r) => r.wave_id === waveId) : undefined;
      const programmeWide = rows.find((r) => r.wave_id === null);
      return (waveSpecific?.role_id ?? programmeWide?.role_id ?? 'guest') as RoleId;
    },
    placeholderData: 'guest' as RoleId,
  });
}

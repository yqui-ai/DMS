import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import type { RoleId } from '../../types/entities';

/**
 * Resolves the current user's role for a given programme (+ optional subproject).
 * A membership with subproject_id = null is programme-wide and applies to every subproject in the programme.
 * Falls back to 'guest' when signed out or no membership row matches.
 */
export function useCurrentRole(programId?: string, subprojectId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['current-role', user?.id, programId, subprojectId],
    enabled: !!user && !!programId,
    queryFn: async (): Promise<RoleId> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('role_id, subproject_id')
        .eq('user_id', user!.id)
        .eq('program_id', programId!);
      if (error) throw error;
      const rows = data ?? [];
      const subprojectSpecific = subprojectId ? rows.find((r) => r.subproject_id === subprojectId) : undefined;
      const programmeWide = rows.find((r) => r.subproject_id === null);
      return (subprojectSpecific?.role_id ?? programmeWide?.role_id ?? 'guest') as RoleId;
    },
    placeholderData: 'guest' as RoleId,
  });
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Role, RoleId, RoleScreen, ScreenKey } from '../../types/entities';

export function useRolesFull() {
  return useQuery({
    queryKey: ['roles-full'],
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase.from('roles').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, name: r.name, description: r.description ?? undefined, isStandard: r.is_standard }));
    },
    staleTime: 5 * 60_000,
  });
}

export function useRoleScreens() {
  return useQuery({
    queryKey: ['role-screens'],
    queryFn: async (): Promise<RoleScreen[]> => {
      const { data, error } = await supabase.from('role_screens').select('*');
      if (error) throw error;
      return (data ?? []).map((rs) => ({ roleId: rs.role_id, screenKey: rs.screen_key, canView: rs.can_view, canEdit: rs.can_edit }));
    },
  });
}

export function useRoleScreenMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['role-screens'] });

  return {
    async toggle(roleId: RoleId, screenKey: ScreenKey, canView: boolean) {
      if (canView) {
        const { error } = await supabase.from('role_screens').upsert(
          { role_id: roleId, screen_key: screenKey, can_view: true, can_edit: true },
          { onConflict: 'role_id,screen_key' },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase.from('role_screens').delete().eq('role_id', roleId).eq('screen_key', screenKey);
        if (error) throw error;
      }
      await invalidate();
    },
  };
}

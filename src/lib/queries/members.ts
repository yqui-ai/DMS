import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { RoleId } from '../../types/entities';

export interface ProjectMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  status: 'Active' | 'Invited' | 'Disabled';
  lastLogin?: string;
  roleId: RoleId;
  waveId: string | null;
}

export function useProjectMembers(projectId?: string) {
  return useQuery({
    queryKey: ['project-members', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectMember[]> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, role_id, wave_id, app_users(id, name, email, status, last_login)')
        .eq('project_id', projectId!);
      if (error) throw error;
      return (data ?? [])
        .filter((m: any) => m.app_users)
        .map((m: any) => ({
          membershipId: m.id, userId: m.app_users.id, name: m.app_users.name, email: m.app_users.email,
          status: m.app_users.status, lastLogin: m.app_users.last_login ?? undefined, roleId: m.role_id, waveId: m.wave_id,
        }));
    },
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async (): Promise<{ id: RoleId; name: string }[]> => {
      const { data, error } = await supabase.from('roles').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useMemberMutations(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });

  return {
    async addByEmail(email: string, roleId: RoleId) {
      const { data: user, error: e1 } = await supabase.from('app_users').select('id').eq('email', email).maybeSingle();
      if (e1) throw e1;
      if (!user) throw new Error(`No account found for ${email} — ask them to sign up first, then add them here.`);
      const { error: e2 } = await supabase
        .from('memberships')
        .insert({ user_id: user.id, project_id: projectId, wave_id: null, role_id: roleId });
      if (e2) throw e2;
      await invalidate();
    },
    async updateRole(membershipId: string, roleId: RoleId) {
      const { error } = await supabase.from('memberships').update({ role_id: roleId }).eq('id', membershipId);
      if (error) throw error;
      await invalidate();
    },
    async remove(membershipId: string) {
      const { error } = await supabase.from('memberships').delete().eq('id', membershipId);
      if (error) throw error;
      await invalidate();
    },
  };
}

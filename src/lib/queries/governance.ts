import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { ApprovalMatrixEntry, RoleId } from '../../types/entities';

export function useApprovalMatrix(projectId?: string) {
  return useQuery({
    queryKey: ['approval-matrix', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ApprovalMatrixEntry[]> => {
      const { data, error } = await supabase.from('approval_matrix').select('*').eq('project_id', projectId!).order('area');
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id, projectId: a.project_id, area: a.area, action: a.action,
        approvalRequired: a.approval_required, approverRoleId: a.approver_role_id ?? undefined,
      }));
    },
  });
}

export function useApprovalMutations(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['approval-matrix', projectId] });

  return {
    async update(id: string, patch: { approvalRequired?: boolean; approverRoleId?: RoleId | null }) {
      const payload: Record<string, unknown> = {};
      if (patch.approvalRequired !== undefined) payload.approval_required = patch.approvalRequired;
      if (patch.approverRoleId !== undefined) payload.approver_role_id = patch.approverRoleId;
      const { error } = await supabase.from('approval_matrix').update(payload).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

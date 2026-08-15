import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { ApprovalMatrixEntry, RoleId } from '../../types/entities';

export function useApprovalMatrix(programId?: string) {
  return useQuery({
    queryKey: ['approval-matrix', programId],
    enabled: !!programId,
    queryFn: async (): Promise<ApprovalMatrixEntry[]> => {
      const { data, error } = await supabase.from('approval_matrix').select('*').eq('program_id', programId!).order('area');
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id, programId: a.program_id, area: a.area, action: a.action,
        approvalRequired: a.approval_required, approverRoleId: a.approver_role_id ?? undefined,
      }));
    },
  });
}

export function useApprovalMutations(programId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['approval-matrix', programId] });

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

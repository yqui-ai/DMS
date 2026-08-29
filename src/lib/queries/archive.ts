import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import type { RoleId } from '../../types/entities';

/** What can be archived. Matches the check constraint on `archive_requests.entity_type` (0040) —
 * adding a value here without adding it there makes every insert of it fail at the database. */
export type ArchiveEntity = 'program' | 'project' | 'subproject' | 'cycle' | 'object' | 'fmd' | 'xref' | 'rule';

export const ENTITY_LABEL: Record<ArchiveEntity, string> = {
  program: 'Program', project: 'Project', subproject: 'Subproject', cycle: 'Cycle',
  object: 'Migration Object', fmd: 'Field Mapping', xref: 'Cross Reference', rule: 'Rule',
};

/** Fixed in the database too (`dms_archive_approver_roles`). Listed here only so the UI can show
 * who is still outstanding — never to decide anything. */
export const APPROVER_ROLES: RoleId[] = ['program_admin', 'data_governance_lead', 'cab'];

/** Hierarchy levels always need the three approvals. Everything else follows `approval_matrix`,
 * which the database is the authority on — this is the optimistic read used to word the dialog. */
export const ALWAYS_NEEDS_APPROVAL: ArchiveEntity[] = ['program', 'project', 'subproject', 'cycle'];

export interface ArchiveApproval {
  roleId: RoleId; approver?: string; decision?: 'Approved' | 'Rejected'; decidedAt?: string;
}

export interface ArchiveRequest {
  id: string;
  entityType: ArchiveEntity;
  entityId: string;
  entityLabel?: string;
  programId: string;
  reason?: string;
  requestedBy: string;
  requestedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  decidedAt?: string;
  approvals: ArchiveApproval[];
}

const toRequest = (r: any): ArchiveRequest => ({
  id: r.id,
  entityType: r.entity_type,
  entityId: r.entity_id,
  entityLabel: r.entity_label ?? undefined,
  programId: r.program_id,
  reason: r.reason ?? undefined,
  requestedBy: r.requested_by,
  requestedAt: r.requested_at,
  status: r.status,
  decidedAt: r.decided_at ?? undefined,
  approvals: (r.archive_approvals ?? []).map((a: any) => ({
    roleId: a.role_id, approver: a.approver ?? undefined,
    decision: a.decision ?? undefined, decidedAt: a.decided_at ?? undefined,
  })),
});

/** Every archive request the user can see, newest first. */
export function useArchiveRequests(status?: ArchiveRequest['status']) {
  return useQuery({
    queryKey: ['archive-requests', status ?? 'all'],
    queryFn: async (): Promise<ArchiveRequest[]> => {
      let q = supabase
        .from('archive_requests')
        .select('*, archive_approvals(role_id, approver, decision, decided_at)')
        .order('requested_at', { ascending: false });
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(toRequest);
    },
  });
}

/** The open request against one record, if any — so a row can show "Archive pending" rather than
 * offering to raise a second one the database would reject. */
export function usePendingArchive(entityType?: ArchiveEntity, entityId?: string) {
  return useQuery({
    queryKey: ['archive-pending', entityType ?? '', entityId ?? ''],
    enabled: !!entityType && !!entityId,
    queryFn: async (): Promise<ArchiveRequest | null> => {
      const { data, error } = await supabase
        .from('archive_requests')
        .select('*, archive_approvals(role_id, approver, decision, decided_at)')
        .eq('entity_type', entityType!).eq('entity_id', entityId!).eq('status', 'Pending')
        .maybeSingle();
      if (error) throw error;
      return data ? toRequest(data) : null;
    },
  });
}

export function useArchiveMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  /** An archive changes what every list contains, so this clears broadly rather than guessing. */
  const invalidate = async () => {
    await queryClient.invalidateQueries();
  };

  const request = useMutation({
    mutationFn: async (input: {
      entityType: ArchiveEntity; entityId: string; entityLabel: string;
      programId: string; reason?: string;
    }) => {
      const { data, error } = await supabase
        .from('archive_requests')
        .insert({
          entity_type: input.entityType,
          entity_id: input.entityId,
          entity_label: input.entityLabel,
          program_id: input.programId,
          reason: input.reason?.trim() || null,
          requested_by: user?.email ?? 'Unknown',
        })
        .select('id')
        .single();
      // 23505 is the partial unique index: one open request per record.
      if (error) {
        throw new Error(error.code === '23505'
          ? 'There is already an open archive request for this record.'
          : error.message);
      }
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  /** Records one role's decision. The database applies the archive once every required role has
   * approved — see the trigger in 0040. Nothing here decides that. */
  const decide = useMutation({
    mutationFn: async (input: { requestId: string; roleId: RoleId; decision: 'Approved' | 'Rejected' }) => {
      const { error } = await supabase
        .from('archive_approvals')
        .upsert({
          request_id: input.requestId,
          role_id: input.roleId,
          approver: user?.email ?? 'Unknown',
          decision: input.decision,
          decided_at: new Date().toISOString(),
        }, { onConflict: 'request_id,role_id' });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('archive_requests').update({ status: 'Cancelled', decided_at: new Date().toISOString() })
        .eq('id', requestId).eq('status', 'Pending');
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Reverses exactly what a request archived — its `archived_via` stamp — and nothing that was
   * archived separately. */
  const restore = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('dms_restore_archive', { p_request: requestId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { request, decide, cancel, restore };
}

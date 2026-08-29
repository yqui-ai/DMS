import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserPlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { PersonSelect } from '../../components/PersonSelect';
import { useToast } from '../../components/Toast';
import { APPROVER_ROLES } from '../../lib/queries/archive';
import { useAssignablePeople } from '../../lib/queries/people';
import type { RoleId } from '../../types/entities';

const roleName = (r: string) => r.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const ROLE_PURPOSE: Record<string, string> = {
  program_admin: 'Owns the program and its configuration.',
  data_governance_lead: 'Answers for the integrity of what gets migrated.',
  cab: 'Change Advisory Board — signs off on changes to agreed scope.',
};

interface Holder { membershipId: string; userId: string; name: string; email: string }

/** Who currently holds each approver role on this program, program-wide. Subproject-scoped
 * memberships are excluded: approving the archive of a program is a program-level act. */
function useProgramApprovers(programId?: string) {
  return useQuery({
    queryKey: ['program-approvers', programId],
    enabled: !!programId,
    queryFn: async (): Promise<Record<string, Holder[]>> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, role_id, app_users(id, name, email, status)')
        .eq('program_id', programId!)
        .is('subproject_id', null)
        .in('role_id', APPROVER_ROLES);
      if (error) throw error;
      const out: Record<string, Holder[]> = {};
      for (const m of (data ?? []) as any[]) {
        if (!m.app_users || m.app_users.status === 'Disabled') continue;
        out[m.role_id] = [...(out[m.role_id] ?? []), {
          membershipId: m.id, userId: m.app_users.id, name: m.app_users.name, email: m.app_users.email,
        }];
      }
      return out;
    },
  });
}

/** Who signs off when something in this program is archived.
 *
 * The three ROLES are fixed in the database (`dms_archive_approver_roles`) — a programme that can
 * reconfigure who approves the destruction of its own history has not got a control. What is set
 * here is who holds them, which is a membership, and it is worth doing at setup rather than
 * discovering at the first archive request that a role has nobody in it and nothing can proceed.
 *
 * A role may have several holders. The approval is recorded against the ROLE, so any one of them
 * can give it — which is what stops one person's holiday blocking the programme. */
export function ArchiveApproversTab({ programId }: { programId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: holders = {}, isLoading } = useProgramApprovers(programId);
  const [adding, setAdding] = useState<Record<string, string>>({});

  /** Anyone with a membership on this program is a candidate — granting the approver role is what
   * this screen does, so filtering to people who already hold it would make it a no-op. */
  const { data: people = [], isLoading: loadingPeople } = useAssignablePeople({ programId });

  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['program-approvers', programId] }),
    queryClient.invalidateQueries({ queryKey: ['my-memberships'] }),
    queryClient.invalidateQueries({ queryKey: ['assignable-people'] }),
  ]);

  const add = useMutation({
    mutationFn: async ({ roleId, name }: { roleId: RoleId; name: string }) => {
      const person = people.find((p) => p.name === name);
      if (!person) throw new Error('Pick someone from the list.');
      const { error } = await supabase.from('memberships').insert({
        user_id: person.userId, program_id: programId, subproject_id: null, role_id: roleId,
      });
      // 23505 is `unique (user_id, program_id, subproject_id, role_id)` — they already hold it.
      if (error) throw new Error(error.code === '23505' ? 'They already hold that role here.' : error.message);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase.from('memberships').delete().eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const gaps = useMemo(
    () => APPROVER_ROLES.filter((r) => (holders[r] ?? []).length === 0),
    [holders],
  );

  if (isLoading) return <p className="text-sm2 text-muted py-8 text-center">Loading…</p>;

  return (
    <div className="flex flex-col gap-4 max-w-[720px]">
      <p className="text-sm2 text-muted">
        Archiving a program, project, subproject or cycle needs all {APPROVER_ROLES.length} of these
        roles to approve. Any one holder of a role can give that role&apos;s approval.
      </p>

      {/* A role with nobody in it is not a stricter control — it is a request that can never be
          approved. Worth saying at setup rather than at the first archive. */}
      {gaps.length > 0 && (
        <div className="rounded bg-amber-bg px-3.5 py-2.5 text-2xs text-amber-ink">
          <span className="font-semibold">
            {gaps.length} approver role{gaps.length === 1 ? ' has' : 's have'} nobody assigned
          </span>{' '}
          — {gaps.map(roleName).join(', ')}. Until someone holds {gaps.length === 1 ? 'it' : 'them'},
          no archive request in this program can be approved.
        </div>
      )}

      {APPROVER_ROLES.map((role) => {
        const current = holders[role] ?? [];
        return (
          <section key={role} className="rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--line)] p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={15} className={current.length === 0 ? 'text-amber-ink' : 'text-green'} />
              <h3 className="text-sm2 font-bold text-text">{roleName(role)}</h3>
              <span className="text-2xs text-muted ml-auto tabular-nums">
                {current.length} {current.length === 1 ? 'holder' : 'holders'}
              </span>
            </div>
            <p className="text-2xs text-muted mb-3">{ROLE_PURPOSE[role]}</p>

            {current.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {current.map((h) => (
                  <span key={h.membershipId} className="inline-flex items-center gap-1.5 text-2xs bg-surface-2 rounded pl-2 pr-1 py-1">
                    <span className="font-semibold text-text">{h.name}</span>
                    <span className="text-muted">{h.email}</span>
                    <button
                      onClick={() => remove.mutate(h.membershipId, {
                        onError: (e: any) => toast.error(e?.message ?? 'Could not remove them.'),
                      })}
                      aria-label={`Remove ${h.name} from ${roleName(role)}`}
                      title={`Remove ${h.name}`}
                      className="text-muted hover:text-red p-0.5 rounded"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <PersonSelect
                  value={adding[role]}
                  onChange={(v) => setAdding((a) => ({ ...a, [role]: v }))}
                  people={people}
                  loading={loadingPeople}
                  placeholder="Add someone…"
                  emptyHint="Nobody has a membership on this program yet. Add members first."
                />
              </div>
              <Button
                variant="secondary" size="md"
                disabled={!adding[role] || add.isPending}
                onClick={() => add.mutate(
                  { roleId: role, name: adding[role] },
                  {
                    onSuccess: () => { setAdding((a) => ({ ...a, [role]: '' })); toast.success(`Added to ${roleName(role)}.`); },
                    onError: (e: any) => toast.error(e?.message ?? 'Could not add them.'),
                  },
                )}
              >
                <UserPlus size={14} /> Add
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

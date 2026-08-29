import { useMemo, useState } from 'react';
import { Archive, Check, Clock, Inbox, ShieldCheck, X } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { Segmented } from '../../components/Segmented';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { fmtDateTime } from '../../lib/format';
import {
  APPROVER_ROLES, ENTITY_LABEL, useArchiveMutations, useArchiveRequests,
  type ArchiveRequest,
} from '../../lib/queries/archive';
import { useMyMemberships } from '../../lib/queries/launchpad';
import type { RoleId } from '../../types/entities';

const roleName = (r: string) => r.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const FILTERS = [
  { value: 'mine' as const, label: 'Needs my approval' },
  { value: 'open' as const, label: 'All open' },
  { value: 'decided' as const, label: 'Decided' },
];
type Filter = typeof FILTERS[number]['value'];

/** Where an archive request actually gets decided.
 *
 * Requests were being raised with nowhere to approve them, so nothing could ever reach the three
 * signatures it needed — every archive sat Pending forever. This is the missing half.
 *
 * It opens on "Needs my approval", because the reason to come here is to be unblocked or to unblock
 * someone. The other two views exist for the question that follows: what is outstanding, and what
 * happened to the one I decided last week. */
export function ArchiveApprovalsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('mine');
  const { data: requests = [], isLoading } = useArchiveRequests();
  const { data: memberships = [] } = useMyMemberships();
  const { decide, cancel } = useArchiveMutations();

  /** Which approver roles the user holds, per program. RLS enforces the same thing on write — this
   * only decides what to render, so nobody is offered a button that would be rejected. */
  const myRolesByProgram = useMemo(() => {
    const m = new Map<string, RoleId[]>();
    for (const ms of memberships) {
      if (!APPROVER_ROLES.includes(ms.roleId)) continue;
      const existing = m.get(ms.programId) ?? [];
      if (!existing.includes(ms.roleId)) m.set(ms.programId, [...existing, ms.roleId]);
    }
    return m;
  }, [memberships]);

  /** Roles I hold on this request's program that have not yet recorded a decision. */
  const outstandingFor = (r: ArchiveRequest): RoleId[] => {
    const mine = myRolesByProgram.get(r.programId) ?? [];
    return mine.filter((role) => !r.approvals.some((a) => a.roleId === role && a.decision));
  };

  const shown = useMemo(() => requests.filter((r) => {
    if (filter === 'decided') return r.status !== 'Pending';
    if (filter === 'open') return r.status === 'Pending';
    return r.status === 'Pending' && outstandingFor(r).length > 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [requests, filter, myRolesByProgram]);

  const mineCount = requests.filter((r) => r.status === 'Pending' && outstandingFor(r).length > 0).length;

  const record = async (r: ArchiveRequest, roleId: RoleId, decision: 'Approved' | 'Rejected') => {
    try {
      await decide.mutateAsync({ requestId: r.id, roleId, decision });
      toast.success(decision === 'Rejected'
        ? 'Rejected. The request is closed.'
        : 'Approved. The archive applies once every role has approved.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not record that decision.');
    }
  };

  const withdraw = async (r: ArchiveRequest) => {
    try {
      await cancel.mutateAsync(r.id);
      toast.success('Request withdrawn.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not withdraw the request.');
    }
  };

  return (
    <div className="max-w-[900px] mx-auto w-full">
      <PageHeader
        title="Archive approvals"
        description={`Archiving a program, project, subproject or cycle needs all ${APPROVER_ROLES.length} approver roles to agree.`}
      />

      <div className="flex items-center gap-3 mb-4">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        {mineCount > 0 && <Tag variant="warn" size="sm">{mineCount} waiting on you</Tag>}
      </div>

      {isLoading ? (
        <p className="text-sm2 text-muted py-16 text-center">Loading…</p>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Inbox size={26} />}
          title={filter === 'mine' ? 'Nothing waiting on you' : filter === 'open' ? 'No open requests' : 'Nothing decided yet'}
          description={filter === 'mine'
            ? 'Archive requests that need a role you hold will appear here.'
            : 'Archive requests are raised from Migration Project.'}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              outstanding={outstandingFor(r)}
              busy={decide.isPending || cancel.isPending}
              onDecide={(role, d) => record(r, role, d)}
              onWithdraw={() => withdraw(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_VARIANT = {
  Pending: 'warn', Approved: 'success', Rejected: 'danger', Cancelled: 'neutral',
} as const;

function RequestCard({ request: r, outstanding, busy, onDecide, onWithdraw }: {
  request: ArchiveRequest;
  outstanding: RoleId[];
  busy: boolean;
  onDecide: (role: RoleId, decision: 'Approved' | 'Rejected') => void;
  onWithdraw: () => void;
}) {
  return (
    <section className="rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--line)] p-4">
      <div className="flex items-start gap-3 flex-wrap">
        <span className="w-8 h-8 rounded bg-surface-2 text-muted grid place-items-center shrink-0">
          <Archive size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-md font-bold text-text">{r.entityLabel ?? 'Untitled'}</span>
            <span className="text-2xs text-muted">{ENTITY_LABEL[r.entityType]}</span>
            <Tag variant={STATUS_VARIANT[r.status]} size="sm">{r.status}</Tag>
          </div>
          <p className="text-2xs text-muted mt-1">
            Requested by <span className="font-semibold text-text">{r.requestedBy}</span> · {fmtDateTime(r.requestedAt)}
          </p>
          {r.reason && <p className="text-sm2 text-text mt-1.5">“{r.reason}”</p>}
        </div>
      </div>

      {/* Every required role, decided or not — the point of a multi-approval is seeing who is left. */}
      <div className="flex flex-col gap-1 mt-3 pt-3 border-t border-line-soft">
        {APPROVER_ROLES.map((role) => {
          const decision = r.approvals.find((a) => a.roleId === role);
          const canDecide = r.status === 'Pending' && outstanding.includes(role);
          return (
            <div key={role} className="flex items-center gap-2.5 py-0.5">
              <span className="w-4 shrink-0 grid place-items-center">
                {decision?.decision === 'Approved' && <Check size={13} className="text-green" />}
                {decision?.decision === 'Rejected' && <X size={13} className="text-red" />}
                {!decision?.decision && <Clock size={12} className="text-muted" />}
              </span>
              <span className={clsx('text-sm2 w-[170px] shrink-0', decision?.decision ? 'text-text font-semibold' : 'text-muted')}>
                {roleName(role)}
              </span>
              <span className="text-2xs text-muted truncate flex-1">
                {decision?.decision
                  ? `${decision.decision} by ${decision.approver ?? '—'}${decision.decidedAt ? ` · ${fmtDateTime(decision.decidedAt)}` : ''}`
                  : 'Waiting'}
              </span>
              {canDecide && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="quiet" size="sm" disabled={busy} onClick={() => onDecide(role, 'Rejected')}>
                    Reject
                  </Button>
                  <Button variant="primary" size="sm" disabled={busy} onClick={() => onDecide(role, 'Approved')}>
                    <ShieldCheck size={13} /> Approve
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {r.status === 'Pending' && (
        <div className="flex items-center gap-2 mt-3">
          <p className="text-2xs text-muted">
            Nothing changes until all {APPROVER_ROLES.length} approve. One rejection closes the request.
          </p>
          <Button variant="quiet" size="sm" className="ml-auto" disabled={busy} onClick={onWithdraw}>
            Withdraw
          </Button>
        </div>
      )}
    </section>
  );
}

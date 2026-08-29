import { useEffect, useState } from 'react';
import { Archive, ShieldCheck } from 'lucide-react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Field, Input } from './Field';
import { useToast } from './Toast';
import {
  ALWAYS_NEEDS_APPROVAL, APPROVER_ROLES, ENTITY_LABEL, useArchiveMutations,
  type ArchiveEntity,
} from '../lib/queries/archive';

export interface ArchiveTarget {
  entityType: ArchiveEntity;
  entityId: string;
  /** What to call it in the dialog and in the request record. */
  entityLabel: string;
  programId: string;
  /** What else goes with it, in plain words — shown so nobody archives a program thinking it is
   * just one row. */
  cascadeNote?: string;
}

const roleName = (r: string) => r.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Raise a request to archive something.
 *
 * Deliberately not a confirm dialog. Archiving a program or a project needs three separate people
 * to agree, so this is the start of a process rather than the end of one, and the dialog says so
 * before you commit to it. */
export function ArchiveDialog({ target, onClose }: { target: ArchiveTarget | null; onClose: () => void }) {
  const toast = useToast();
  const { request } = useArchiveMutations();
  const [reason, setReason] = useState('');

  useEffect(() => { if (target) setReason(''); }, [target]);

  const needsApproval = target ? ALWAYS_NEEDS_APPROVAL.includes(target.entityType) : false;
  const label = target ? ENTITY_LABEL[target.entityType].toLowerCase() : '';

  const submit = async () => {
    if (!target) return;
    try {
      await request.mutateAsync({
        entityType: target.entityType,
        entityId: target.entityId,
        entityLabel: target.entityLabel,
        programId: target.programId,
        reason,
      });
      toast.success(needsApproval
        ? `Archive requested. It needs ${APPROVER_ROLES.length} approvals before it takes effect.`
        : `${ENTITY_LABEL[target.entityType]} archived.`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not raise the request.');
    }
  };

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={needsApproval ? `Request to archive ${label}` : `Archive ${label}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={request.isPending}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={request.isPending}>
            <Archive size={14} />
            {request.isPending ? 'Submitting…' : needsApproval ? 'Request archive' : 'Archive'}
          </Button>
        </>
      }
    >
      {target && (
        <div className="flex flex-col gap-3.5">
          <p className="text-sm2 text-text">
            Archive <strong>{target.entityLabel}</strong>?
          </p>

          {/* Archiving is not deleting, and saying so is what stops people treating this dialog as
              the dangerous one they must avoid. */}
          <p className="text-2xs text-muted">
            Nothing is deleted. It leaves the working lists, becomes read-only, and stays searchable
            and exportable. It can be restored.
          </p>

          {target.cascadeNote && (
            <div className="rounded bg-amber-bg px-3 py-2.5 text-2xs text-amber-ink">
              <span className="font-semibold">This takes everything under it too</span> — {target.cascadeNote}.
              Restoring brings the whole set back.
            </div>
          )}

          {needsApproval && (
            <div className="rounded bg-surface-2 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-2xs font-semibold text-text mb-1.5">
                <ShieldCheck size={13} /> Needs {APPROVER_ROLES.length} approvals
              </div>
              <ul className="text-2xs text-muted flex flex-col gap-0.5">
                {APPROVER_ROLES.map((r) => <li key={r}>{roleName(r)}</li>)}
              </ul>
              <p className="text-2xs text-muted mt-1.5">
                Nothing changes until all three approve. Any one rejection ends the request.
              </p>
            </div>
          )}

          <Field label="Reason" htmlFor="archive-reason" hint="Optional, but it is what the approvers read.">
            <Input
              id="archive-reason" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. superseded by Wave 2" autoFocus
            />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

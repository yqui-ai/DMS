import { useMemo, useState } from 'react';
import { Archive, RotateCcw } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { Toolbar } from '../../components/Toolbar';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { fmtDateTime } from '../../lib/format';
import {
  ENTITY_LABEL, useArchiveMutations, useArchiveRequests, type ArchiveRequest,
} from '../../lib/queries/archive';
import { adminProgramIds, useMyMemberships } from '../../lib/queries/launchpad';

/** Everything that has been archived, across every level, in one place.
 *
 * Each entry is the approved request that did it — which is also what restores it, because a
 * request stamps every row it touched (`archived_via`) and restoring reverses exactly that set.
 * Listing the records themselves instead would mean eight queries and no way to undo a cascade as
 * the single act it was.
 *
 * Restoring is Program Admin only, enforced in the database (migration 0042). The button is hidden
 * elsewhere, but the function is what actually decides. */
export function ArchivePage() {
  const toast = useToast();
  const { data: requests = [], isLoading } = useArchiveRequests();
  const { data: memberships = [] } = useMyMemberships();
  const { restore } = useArchiveMutations();

  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ArchiveRequest | null>(null);

  const adminOf = useMemo(() => new Set(adminProgramIds(memberships)), [memberships]);

  /** Only requests that actually archived something. Rejected and withdrawn ones never touched a
   * record — they belong in the approvals history, not in an archive. */
  const archived = useMemo(
    () => requests.filter((r) => r.status === 'Approved'),
    [requests],
  );

  const typeOptions = useMemo(
    () => [...new Set(archived.map((r) => ENTITY_LABEL[r.entityType]))].sort(),
    [archived],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return archived.filter((r) => (
      (!q || (r.entityLabel ?? '').toLowerCase().includes(q) || r.requestedBy.toLowerCase().includes(q)
        || (r.reason ?? '').toLowerCase().includes(q))
      && (types.length === 0 || types.includes(ENTITY_LABEL[r.entityType]))
    ));
  }, [archived, query, types]);

  const doRestore = async () => {
    if (!confirm) return;
    try {
      await restore.mutateAsync(confirm.id);
      toast.success(`${confirm.entityLabel ?? 'Record'} restored.`);
      setConfirm(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not restore it.');
    }
  };

  const hasFilters = !!query || types.length > 0;

  return (
    <div className="max-w-[900px] mx-auto w-full">
      <PageHeader
        title="Archive"
        description="Everything archived across your programs. Nothing here is deleted — it is read-only, still searchable, and can be restored."
      />

      <Toolbar
        search={{ value: query, onChange: setQuery, placeholder: 'Search by name, reason or who archived it…' }}
        onClearFilters={hasFilters ? () => { setQuery(''); setTypes([]); } : undefined}
        count={shown.length} noun="archived records"
      >
        {typeOptions.length > 1 && (
          <MultiSelectFilter label="Type" options={typeOptions} selected={types} onChange={setTypes} />
        )}
      </Toolbar>

      {isLoading ? (
        <p className="text-sm2 text-muted py-16 text-center">Loading…</p>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Archive size={26} />}
          title={hasFilters ? 'Nothing matches' : 'Nothing archived'}
          description={hasFilters
            ? 'No archived record matches the current search and filters.'
            : 'Records archived from Migration Project or the Library appear here.'}
        />
      ) : (
        <div className="rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--line)] divide-y divide-line-soft overflow-hidden">
          {shown.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-4 py-3">
              <span className="w-8 h-8 rounded bg-surface-2 text-muted grid place-items-center shrink-0 mt-0.5">
                <Archive size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm2 font-bold text-text">{r.entityLabel ?? 'Untitled'}</span>
                  <Tag variant="neutral" size="sm">{ENTITY_LABEL[r.entityType]}</Tag>
                </div>
                <p className="text-2xs text-muted mt-0.5">
                  Archived {r.decidedAt ? fmtDateTime(r.decidedAt) : ''} · requested by{' '}
                  <span className="font-semibold text-text">{r.requestedBy}</span>
                </p>
                {r.reason && <p className="text-2xs text-muted mt-0.5">“{r.reason}”</p>}
              </div>
              {adminOf.has(r.programId) && (
                <Button variant="quiet" size="sm" className="shrink-0" onClick={() => setConfirm(r)}>
                  <RotateCcw size={13} /> Restore
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title="Restore from archive"
        confirmLabel="Restore"
        busy={restore.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={doRestore}
        message={
          <>
            <p className="mb-2">
              Restore <strong>{confirm?.entityLabel}</strong> and everything archived with it?
            </p>
            <p className="text-muted">
              It returns to the working lists and becomes editable again. Only what this request
              archived comes back — anything archived separately stays archived.
            </p>
          </>
        }
      />
    </div>
  );
}

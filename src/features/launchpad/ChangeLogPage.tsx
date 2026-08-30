import { useMemo, useState } from 'react';
import { FilePlus2, FileX2, Pencil, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Toolbar } from '../../components/Toolbar';
import { Tag } from '../../components/Tag';
import { Dialog } from '../../components/Dialog';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { ListEmptyState } from '../../components/ListEmptyState';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { fmtDateTime } from '../../lib/format';
import {
  describeChange, entityLabel, fieldLabel, formatValue, isDocumentField, summariseChanges,
  useChangeLog, useEntityHistory,
  type ChangeEntry, type ChangeOp,
} from '../../lib/queries/changeLog';

const OP_META: Record<ChangeOp, { label: string; icon: typeof Pencil; className: string }> = {
  insert: { label: 'Created', icon: FilePlus2, className: 'text-green' },
  update: { label: 'Changed', icon: Pencil, className: 'text-blue' },
  delete: { label: 'Deleted', icon: FileX2, className: 'text-red' },
};

/** Everything that has changed in the system, newest first.
 *
 * History lived in three unrelated shapes before this — `fmd_versions.sheets.changeLog` for cell
 * edits, `archive_requests` for archiving, `created_by`/`changed_by` stamps on the hierarchy — and
 * none of them answered the question people actually ask, which is "what happened last week". Nor
 * did any of them cover deletes, scope changes, rules or XREF.
 *
 * The log is written by a database trigger (migration 0046), so coverage does not depend on anyone
 * remembering to call a logger, and it is append-only: there is a SELECT policy and deliberately no
 * INSERT or UPDATE policy. History that can be edited is not history.
 *
 * Every row shows the trigger's deterministic summary. **Summarise with AI** rewrites the wording
 * of what is on screen and nothing more — it is an enrichment, and the page is fully usable when it
 * is unavailable. */
export function ChangeLogPage() {
  const toast = useToast();
  const { data: entries = [], isLoading } = useChangeLog({ limit: 300 });

  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [open, setOpen] = useState<ChangeEntry | null>(null);
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [summarising, setSummarising] = useState(false);

  const kindOptions = useMemo(
    () => [...new Set(entries.map((e) => entityLabel(e.entity)))].sort(),
    [entries],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => (
      (kinds.length === 0 || kinds.includes(entityLabel(e.entity)))
      && (!q
        || (e.summary ?? '').toLowerCase().includes(q)
        || (aiSummaries[e.id] ?? '').toLowerCase().includes(q)
        || e.actor.toLowerCase().includes(q)
        || entityLabel(e.entity).toLowerCase().includes(q))
    ));
  }, [entries, query, kinds, aiSummaries]);

  /** Grouped by day. A flat list of 300 timestamps gives the eye nothing to hold on to, and "when"
   * is half of what anyone comes here for. */
  const days = useMemo(() => {
    const out = new Map<string, ChangeEntry[]>();
    for (const e of shown) {
      const day = new Date(e.at).toDateString();
      out.set(day, [...(out.get(day) ?? []), e]);
    }
    return [...out.entries()];
  }, [shown]);

  const runSummary = async () => {
    setSummarising(true);
    try {
      // Only what is on screen. Sending 300 entries to summarise a list nobody scrolled costs
      // tokens for text nobody reads.
      const next = await summariseChanges(shown.slice(0, 60));
      setAiSummaries((cur) => ({ ...cur, ...next }));
      const n = Object.keys(next).length;
      toast.success(n > 0 ? `${n} entries summarised.` : 'Nothing to summarise.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not reach the summariser. The log is unaffected.');
    } finally {
      setSummarising(false);
    }
  };

  const hasFilters = !!query || kinds.length > 0;
  const clear = () => { setQuery(''); setKinds([]); };

  return (
    <div className="max-w-[1120px] mx-auto w-full">
      {/* No back button. The breadcrumb above already goes to Migration Project, and no other
          screen reached the same way carries one — a second way back that only one screen has
          reads as a control specific to this page rather than as navigation. */}
      <PageHeader
        title="Change Log"
        description="Every change recorded across the system, newest first. Open one to see exactly which fields moved."
        actions={
          <Button variant="ai" onClick={runSummary} disabled={summarising || shown.length === 0}>
            <Sparkles size={14} /> {summarising ? 'Summarising…' : 'Summarise with AI'}
          </Button>
        }
      />

      <Toolbar
        search={{ value: query, onChange: setQuery, placeholder: 'Search changes, people, record types…' }}
        onClearFilters={hasFilters ? clear : undefined}
        count={shown.length} noun="changes"
      >
        {kindOptions.length > 1 && (
          <MultiSelectFilter label="Record" options={kindOptions} selected={kinds} onChange={setKinds} />
        )}
      </Toolbar>

      {!isLoading && entries.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          description="Changes are logged from the moment migration 0046 is applied. Anything done before that is not here."
        />
      ) : shown.length === 0 ? (
        <ListEmptyState noun="changes" filtered={hasFilters} description="No change matches." onClearFilters={clear} />
      ) : (
        <div className="flex flex-col gap-4">
          {days.map(([day, items]) => (
            <section key={day}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-2xs font-bold uppercase tracking-[.05em] text-muted">{day}</span>
                <span className="text-2xs text-muted tabular-nums">{items.length}</span>
              </div>
              <div className="rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--line)] divide-y divide-line-soft overflow-hidden">
                {items.map((e) => (
                  <Row key={e.id} entry={e} aiSummary={aiSummaries[e.id]} onOpen={() => setOpen(e)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ChangeDetailDialog entry={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Row({ entry: e, aiSummary, onOpen }: {
  entry: ChangeEntry; aiSummary?: string; onOpen: () => void;
}) {
  const meta = OP_META[e.op];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-3.5 py-2 text-left hover:bg-blue-pale"
    >
      <Icon size={14} className={clsx('shrink-0', meta.className)} />
      <Tag variant="neutral" size="sm" className="shrink-0 w-[128px] justify-center">{entityLabel(e.entity)}</Tag>
      <span className="min-w-0 flex-1">
        <span className="block text-sm2 text-text truncate">{aiSummary ?? describeChange(e)}</span>
        {/* When AI has rewritten the line, the recorded sentence stays visible underneath. The log
            is an audit trail; a generated sentence must never be the only version of it on screen. */}
        {aiSummary && e.summary && (
          <span className="block text-2xs text-muted truncate">{e.summary}</span>
        )}
      </span>
      {e.fields.length > 0 && (
        <span className="text-2xs text-muted shrink-0 tabular-nums">
          {e.fields.length} field{e.fields.length === 1 ? '' : 's'}
        </span>
      )}
      <span className="text-2xs text-muted shrink-0 w-[150px] truncate text-right" title={e.actor}>
        {e.actor.split('@')[0]}
      </span>
      <span className="text-2xs text-muted shrink-0 tabular-nums w-[62px] text-right">
        {new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
      </span>
    </button>
  );
}

/** One change in full, plus everything else that ever happened to the same record.
 *
 * The second half is the reason this dialog exists rather than an expanding row: an FMD changes far
 * more often than anything else in the system, and "what has happened to THIS document" is a
 * different question from "what happened today". */
function ChangeDetailDialog({ entry, onClose }: { entry: ChangeEntry | null; onClose: () => void }) {
  const { data: history = [] } = useEntityHistory(entry?.entity, entry?.entityId);
  if (!entry) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={describeChange(entry)}
      subtitle={`${entityLabel(entry.entity)} · ${entry.actor} · ${fmtDateTime(entry.at)}`}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col gap-4">
        <section>
          <div className="text-2xs font-bold uppercase tracking-[.05em] text-muted mb-1.5">
            What changed
          </div>
          {entry.fields.length === 0 ? (
            <p className="text-sm2 text-muted">
              {entry.op === 'insert' ? 'The record was created.' : 'The record was deleted.'} No
              field-level diff is kept for that — the record itself is the change.
            </p>
          ) : (
            <div className="rounded bg-surface shadow-[inset_0_0_0_1px_var(--line)] divide-y divide-line-soft overflow-hidden">
              {entry.fields.map((f) => (
                <div key={f.field} className="flex items-start gap-3 px-3 py-2">
                  <span className="w-[190px] shrink-0 text-2xs font-semibold text-text pt-0.5">
                    {fieldLabel(f.field)}
                  </span>
                  {/* A JSONB column holds a whole document — a draft's pending edits, an FMD's
                      sheets. Printing 400 characters of it buries every readable entry around it,
                      so it reports that it moved and sends you to the record's own screen, which is
                      built to show it. See the change-log-writing skill. */}
                  {isDocumentField(f.field) ? (
                    <span className="min-w-0 flex-1 text-sm2 text-muted">
                      Changed. Open the record to see the current contents — the log records that it
                      moved, not the document itself.
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 flex flex-col gap-0.5 text-sm2">
                      <span className="text-muted line-through decoration-1 break-words">{formatValue(f.from)}</span>
                      <span className="text-text font-semibold break-words">{formatValue(f.to)}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {history.length > 1 && (
          <section>
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-2xs font-bold uppercase tracking-[.05em] text-muted">
                Everything else to this record
              </span>
              <span className="text-2xs text-muted tabular-nums">{history.length - 1}</span>
            </div>
            <div className="rounded bg-surface shadow-[inset_0_0_0_1px_var(--line)] divide-y divide-line-soft overflow-hidden max-h-[38vh] overflow-y-auto">
              {history.filter((h) => h.id !== entry.id).map((h) => {
                const m = OP_META[h.op];
                const Icon = m.icon;
                return (
                  <div key={h.id} className="flex items-center gap-3 px-3 py-1.5">
                    <Icon size={13} className={clsx('shrink-0', m.className)} />
                    <span className="text-sm2 text-text truncate flex-1 min-w-0">{h.summary ?? m.label}</span>
                    <span className="text-2xs text-muted shrink-0 truncate w-[120px] text-right" title={h.actor}>
                      {h.actor.split('@')[0]}
                    </span>
                    <span className="text-2xs text-muted shrink-0 tabular-nums">{fmtDateTime(h.at)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}

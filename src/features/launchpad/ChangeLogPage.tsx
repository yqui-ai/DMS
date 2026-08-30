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
import { useHierarchy } from '../../lib/queries/hierarchy';
import {
  describeChange, entityLabel, fieldChangeShape, fieldLabel, formatValue, isDocumentField,
  summariseChanges, summaryCoversFields, useChangeLog, useEntityHistory,
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
  const [programIds, setProgramIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [subprojectIds, setSubprojectIds] = useState<string[]>([]);
  const [ops, setOps] = useState<string[]>([]);
  const [actors, setActors] = useState<string[]>([]);
  const [open, setOpen] = useState<ChangeEntry | null>(null);
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [summarising, setSummarising] = useState(false);

  /* The hierarchy, so the scope filters read as names rather than uuids — and so a PROJECT filter
     is possible at all. `change_log` carries `program_id` and `subproject_id` but no project: the
     trigger resolves the programme through the subproject and stops there. The level in between is
     derived here, from the subproject the entry already names. */
  const { data: programs = [] } = useHierarchy(true);

  const scope = useMemo(() => {
    const programName = new Map<string, string>();
    const projectName = new Map<string, string>();
    const subprojectName = new Map<string, string>();
    /** subproject id → its project id. The join `change_log` cannot make for itself. */
    const projectOfSubproject = new Map<string, string>();
    for (const pg of programs) {
      programName.set(pg.id, `${pg.code} · ${pg.name}`);
      for (const pj of pg.projects) {
        projectName.set(pj.id, `${pj.code} · ${pj.name}`);
        for (const sp of pj.subprojects) {
          subprojectName.set(sp.id, `${sp.code} · ${sp.name}`);
          projectOfSubproject.set(sp.id, pj.id);
        }
      }
    }
    return { programName, projectName, subprojectName, projectOfSubproject };
  }, [programs]);

  /** Entries whose subproject belongs to none — programme settings, roles, users, plants, the
   * Golden FMD. Without a value of its own, the only way to see them is to clear every filter,
   * which is exactly the "where did the settings changes go" question this filter answers. */
  const PROGRAM_WIDE = '__program_wide__';
  /** A subproject the log names but the hierarchy no longer contains, because it was deleted. The
   * log outlives the record on purpose — that is what append-only means — so its entries need
   * somewhere to sit. Every unresolvable id collapses to this one option rather than becoming a
   * row of identical "Unknown subproject" entries you cannot tell apart. */
  const GONE = '__deleted__';

  /** One entry's value for each facet, computed once so the filter and the option lists agree. */
  const facetsOf = (e: ChangeEntry) => {
    const projectId = e.subprojectId ? scope.projectOfSubproject.get(e.subprojectId) : undefined;
    return {
      program: e.programId ? (scope.programName.has(e.programId) ? e.programId : GONE) : undefined,
      project: e.subprojectId ? (projectId ?? GONE) : undefined,
      subproject: e.subprojectId
        ? (scope.subprojectName.has(e.subprojectId) ? e.subprojectId : GONE)
        : PROGRAM_WIDE,
      kind: entityLabel(e.entity),
      op: OP_META[e.op].label,
      actor: e.actor,
    };
  };

  /** Does one entry pass the current filters, optionally ignoring one of them?
   *
   * The `except` argument is what makes the filters co-dependent. A facet's own selection must not
   * narrow its own option list — otherwise choosing one programme would leave the Program dropdown
   * showing only that programme, with no way to see or pick another. Every OTHER filter does
   * narrow it, which is the behaviour being asked for. */
  const passes = (e: ChangeEntry, except?: 'program' | 'project' | 'subproject' | 'kind' | 'op' | 'actor') => {
    const f = facetsOf(e);
    const q = query.trim().toLowerCase();
    return (
      (except === 'kind' || kinds.length === 0 || kinds.includes(f.kind))
      && (except === 'program' || programIds.length === 0 || (!!f.program && programIds.includes(f.program)))
      && (except === 'project' || projectIds.length === 0 || (!!f.project && projectIds.includes(f.project)))
      && (except === 'subproject' || subprojectIds.length === 0 || subprojectIds.includes(f.subproject))
      && (except === 'op' || ops.length === 0 || ops.includes(f.op))
      && (except === 'actor' || actors.length === 0 || actors.includes(f.actor))
      && (!q
        || (e.summary ?? '').toLowerCase().includes(q)
        || (aiSummaries[e.id] ?? '').toLowerCase().includes(q)
        || e.actor.toLowerCase().includes(q)
        || entityLabel(e.entity).toLowerCase().includes(q))
    );
  };

  const shown = useMemo(
    () => entries.filter((e) => passes(e)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, query, kinds, programIds, projectIds, subprojectIds, ops, actors, aiSummaries, scope],
  );

  /** Options for one facet: the values still reachable given every OTHER filter.
   *
   * Anything currently selected is kept in the list even when it is no longer reachable — a
   * selection you cannot see is a selection you cannot undo, and the filter would look empty while
   * silently excluding everything. */
  const optionsFor = (
    facet: 'program' | 'project' | 'subproject' | 'kind' | 'op' | 'actor',
    selected: string[],
  ) => {
    const available = new Set<string>();
    for (const e of entries) {
      if (!passes(e, facet)) continue;
      const v = facetsOf(e)[facet];
      if (v) available.add(v);
    }
    for (const s of selected) available.add(s);
    return [...available];
  };

  const programOptions = useMemo(() => optionsFor('program', programIds), [entries, query, kinds, programIds, projectIds, subprojectIds, ops, actors, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const projectOptions = useMemo(() => optionsFor('project', projectIds), [entries, query, kinds, programIds, projectIds, subprojectIds, ops, actors, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const subprojectOptions = useMemo(() => optionsFor('subproject', subprojectIds), [entries, query, kinds, programIds, projectIds, subprojectIds, ops, actors, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const kindOptions = useMemo(() => optionsFor('kind', kinds).sort(), [entries, query, kinds, programIds, projectIds, subprojectIds, ops, actors, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const opOptions = useMemo(() => optionsFor('op', ops), [entries, query, kinds, programIds, projectIds, subprojectIds, ops, actors, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const actorOptions = useMemo(() => optionsFor('actor', actors).sort(), [entries, query, kinds, programIds, projectIds, subprojectIds, ops, actors, scope]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const hasFilters = !!query || kinds.length > 0 || programIds.length > 0
    || projectIds.length > 0 || subprojectIds.length > 0 || ops.length > 0 || actors.length > 0;
  const clear = () => {
    setQuery(''); setKinds([]); setProgramIds([]); setProjectIds([]);
    setSubprojectIds([]); setOps([]); setActors([]);
  };

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
        {/* Scope filters first and in hierarchy order, so the row reads the way the tree does.
            Each appears only when there is more than one thing to choose between — a filter with a
            single option is a control that cannot change anything. */}
        {programOptions.length > 1 && (
          <MultiSelectFilter
            label="Program" options={programOptions} selected={programIds} onChange={setProgramIds}
            formatOption={(id) => (id === GONE ? 'Deleted program' : scope.programName.get(id) ?? id)}
          />
        )}
        {projectOptions.length > 1 && (
          <MultiSelectFilter
            label="Project" options={projectOptions} selected={projectIds} onChange={setProjectIds}
            formatOption={(id) => (id === GONE ? 'Deleted project' : scope.projectName.get(id) ?? id)}
          />
        )}
        {subprojectOptions.length > 0 && (
          <MultiSelectFilter
            label="Subproject"
            /* PROGRAM_WIDE is offered alongside the real subprojects rather than as a separate
               control: "which subproject" and "the ones belonging to none" are the same question,
               and settings, roles, users, plants and the Golden FMD all live in that answer. */
            options={subprojectOptions}
            selected={subprojectIds} onChange={setSubprojectIds}
            formatOption={(id) => (
              id === PROGRAM_WIDE ? 'Program-wide (settings, users, plants)'
                : id === GONE ? 'Deleted subproject'
                  : scope.subprojectName.get(id) ?? id)}
          />
        )}
        {kindOptions.length > 1 && (
          <MultiSelectFilter label="Record" options={kindOptions} selected={kinds} onChange={setKinds} />
        )}
        {opOptions.length > 1 && (
          <MultiSelectFilter label="Action" options={opOptions} selected={ops} onChange={setOps} />
        )}
        {actorOptions.length > 1 && (
          <MultiSelectFilter
            label="Person" options={actorOptions} selected={actors} onChange={setActors}
            // The local part only. A column of identical @client.com is noise in a dropdown.
            formatOption={(a) => a.split('@')[0]}
          />
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
                <span className="text-2xs font-semibold uppercase tracking-[.06em] text-muted">
                  {new Date(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
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
  // Suppressed when the sentence already carries it — see summaryCoversFields. Repetition in a log
  // is worse than terseness: it doubles the reading for none of the information.
  const diff = summaryCoversFields(e) ? [] : e.fields;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-baseline gap-3 px-3.5 py-2 text-left hover:bg-blue-pale"
    >
      {/* Time first. This list is ordered by it and grouped by day, so it is the column the eye
          runs down — and it was in the far-right 62px, which is the least scannable place a
          primary key can sit. */}
      <span className="text-2xs text-muted tabular-nums shrink-0 w-[42px] pt-px">
        {new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
      </span>
      <Icon size={14} className={clsx('shrink-0 self-start mt-0.5', meta.className)} />
      {/* Auto width, not 128px centred. A fixed pill made "Plant" and "Archive request" occupy the
          same slab of the row and pushed every sentence to the same far-right start. */}
      <Tag variant="neutral" size="sm" className="shrink-0 self-start mt-px">{entityLabel(e.entity)}</Tag>

      <span className="min-w-0 flex-1">
        <span className="block text-sm2 text-text truncate">{aiSummary ?? describeChange(e)}</span>
        {/* When AI has rewritten the line, the recorded sentence stays visible underneath. The log
            is an audit trail; a generated sentence must never be the only version of it on screen. */}
        {aiSummary && e.summary && (
          <span className="block text-2xs text-muted truncate">{e.summary}</span>
        )}
        {diff.length > 0 && (
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 mt-0.5">
            {diff.slice(0, 3).map((f, i) => {
              const shape = fieldChangeShape(f.field, f.from, f.to);
              return (
                <span key={f.field} className="text-2xs inline-flex items-baseline gap-1 min-w-0">
                  {i > 0 && <span className="text-line-strong mr-1">·</span>}
                  <span className="text-muted shrink-0">{fieldLabel(f.field)}</span>
                  {shape.kind === 'word' ? (
                    <span className="text-text">{shape.word}</span>
                  ) : (
                    <>
                      <span className="text-muted line-through decoration-1 truncate max-w-[150px]">{shape.from}</span>
                      <span className="text-muted shrink-0">→</span>
                      <span className="text-text truncate max-w-[190px]">{shape.to}</span>
                    </>
                  )}
                </span>
              );
            })}
            {diff.length > 3 && (
              <span className="text-2xs text-muted">+{diff.length - 3} more</span>
            )}
          </span>
        )}
      </span>

      <span className="text-2xs text-muted shrink-0 max-w-[140px] truncate text-right" title={e.actor}>
        {e.actor.split('@')[0]}
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
                  ) : fieldChangeShape(f.field, f.from, f.to).kind === 'word' ? (
                    /* A reference. Its value is an id, which names nothing to a reader, so the
                       transition is the whole of what can be said here — the same rule the row
                       above uses, from the same helper, so the two cannot disagree. */
                    <span className="min-w-0 flex-1 text-sm2">
                      <span className="text-text">
                        {(fieldChangeShape(f.field, f.from, f.to) as { word: string }).word}
                      </span>
                      <span className="text-muted"> — the value is an internal reference, not something to show.</span>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 flex flex-col gap-0.5 text-sm2">
                      <span className="text-muted line-through decoration-1 break-words">{formatValue(f.from)}</span>
                      <span className="text-text break-words">{formatValue(f.to)}</span>
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

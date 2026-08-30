import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp, Info, ListPlus, Upload } from 'lucide-react';
import { Button } from '../../../components/Button';
import { Tag } from '../../../components/Tag';
import { Toolbar } from '../../../components/Toolbar';
import { MultiSelectFilter } from '../../../components/MultiSelectFilter';
import { ListEmptyState } from '../../../components/ListEmptyState';
import { Segmented } from '../../../components/Segmented';
import { Table, type Column } from '../../../components/Table';
import { LibraryObjectDialog } from '../../library/LibraryObjectDialog';
import { fmtApproach } from '../../../lib/format';
import { useToast } from '../../../components/Toast';
import {
  buildScopeTemplate, downloadScopeTemplate, parseScopeImport, suggestSapObject,
  type ScopeImportResult,
} from '../../../lib/scopeTemplate';
import { useScopeCandidateMutations, type ScopeCandidate } from '../../../lib/queries/scopeCandidates';
import type { MigrationObject } from '../../../types/entities';

export type ScopeSource = 'import' | 'standard';

/** Step 1 — build the object list.
 *
 * There are two ways in, and they are genuinely different situations rather than a preference. A
 * customer who already has a migration object list wants to bring it, keep their own names, and find
 * out what it maps to. A customer starting from nothing wants the SAP catalogue in front of them.
 * Forcing the first through a catalogue picker means retyping a list they already have; forcing the
 * second through a spreadsheet means authoring one they have no basis for. Both land in
 * `scope_candidates`, so nothing downstream cares which was used.
 *
 * **That choice is this step's empty state, not a step of its own.** It was briefly its own screen,
 * and the result was a page whose entire content was "your list was built by picking from the SAP
 * catalogue — continue in the next step": a click to be told something already decided. The question
 * is only open while the list is empty, so it is asked only then. Once objects exist the panel for
 * the chosen path is simply the screen, with a quiet line saying which path it is. */
export function SelectStep({
  source, objects, candidates, subprojectId, subprojectName, sourceLocked, onChooseSource,
}: {
  source: ScopeSource | null;
  objects: MigrationObject[];
  candidates: ScopeCandidate[];
  subprojectId: string;
  subprojectName?: string;
  /** A list already exists, so the path is settled and cannot be switched under it. */
  sourceLocked: boolean;
  onChooseSource: (source: ScopeSource) => void;
}) {
  if (!source) return <SourceChooser onChoose={onChooseSource} />;

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {source === 'import' ? (
        <ImportPanel
          objects={objects} candidates={candidates}
          subprojectId={subprojectId} subprojectName={subprojectName}
        />
      ) : (
        <StandardPanel objects={objects} candidates={candidates} subprojectId={subprojectId} />
      )}
      {/* Switching path is only offered while nothing has been added — after that it would mean
          discarding a list, which is not something a quiet link should do. */}
      {!sourceLocked && (
        <button
          type="button"
          onClick={() => onChooseSource(source === 'import' ? 'standard' : 'import')}
          className="text-2xs text-blue font-semibold self-start hover:underline shrink-0"
        >
          {source === 'import' ? 'Browse the SAP catalogue instead' : 'Import my own list instead'}
        </button>
      )}
    </div>
  );
}

function SourceChooser({ onChoose }: { onChoose: (source: ScopeSource) => void }) {
  return (
    <div className="max-w-[760px]">
      <p className="text-sm2 text-muted mb-4">
        How do you want to build this subproject’s object list? Either way, the next step ties every
        object to an SAP standard migration object.
      </p>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <OptionCard
          icon={<FileUp size={18} />}
          title="Import your own list"
          description="Upload the object list you already have, in your own naming. Custom objects can be flagged and parked."
          action="Import a list"
          onClick={() => onChoose('import')}
        />
        <OptionCard
          icon={<ListPlus size={18} />}
          title="Select from the SAP catalogue"
          description="Pick from the standard SAP migration objects. Already mapped, so the next step is only a confirmation."
          action="Browse the catalogue"
          onClick={() => onChoose('standard')}
        />
      </div>
    </div>
  );
}

function OptionCard({ icon, title, description, action, onClick }: {
  icon: React.ReactNode; title: string; description: string; action: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-lg bg-surface p-4 flex flex-col gap-2 transition-shadow shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-cardHover"
    >
      <span className="w-9 h-9 rounded bg-blue-light text-blue-deep grid place-items-center">{icon}</span>
      <span className="text-md font-bold text-text mt-1">{title}</span>
      <span className="text-sm2 text-muted leading-snug flex-1">{description}</span>
      <span className="text-2xs font-semibold text-blue mt-1">{action} →</span>
    </button>
  );
}

/* ───────────────────────────────────────────────────────────────────── option A: import */

function ImportPanel({ objects, candidates, subprojectId, subprojectName }: {
  objects: MigrationObject[];
  candidates: ScopeCandidate[];
  subprojectId: string;
  subprojectName?: string;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ScopeImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const { importRows } = useScopeCandidateMutations(subprojectId);

  const download = async () => {
    try {
      downloadScopeTemplate(await buildScopeTemplate(objects), subprojectName);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not build the template.');
    }
  };

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      setParsed(await parseScopeImport(file));
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not read that file.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!parsed) return;
    try {
      // Matched here rather than in step 2, so the mapping step opens with the easy rows already
      // filled in and only the real decisions left.
      const withSuggestions = parsed.rows.map((r) => ({ ...r, mappedObjectId: suggestSapObject(r, objects) }));
      await importRows.mutateAsync(withSuggestions);
      const matched = withSuggestions.filter((r) => r.mappedObjectId).length;
      toast.success(`${parsed.rows.length} objects imported — ${matched} matched to an SAP object automatically.`);
      setParsed(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not save the list.');
    }
  };

  const inScopeCount = parsed?.rows.filter((r) => r.inScope).length ?? 0;

  return (
    <div className="flex flex-col gap-4 max-w-[900px] flex-1 min-h-0 overflow-auto">
      <div className="flex items-start gap-3 rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--line)] p-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-sm2 font-bold text-text">Use the template</div>
          <p className="text-2xs text-muted mt-0.5">
            One row per object, in your own naming. It carries a second sheet listing every SAP
            standard object, so the optional SAP_OBJECT column can be filled without leaving the file.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={download}>
          <Download size={14} /> Download template
        </Button>
        <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload size={14} /> {busy ? 'Reading…' : 'Upload list'}
        </Button>
        <input
          ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
      </div>

      {parsed && (
        <div className="rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-surface-2 border-b border-line flex-wrap">
            <span className="text-sm2 font-bold text-text">
              {parsed.rows.length} object{parsed.rows.length === 1 ? '' : 's'} read
            </span>
            <span className="text-2xs text-muted">{inScopeCount} in scope</span>
            {parsed.skipped.length > 0 && (
              <span className="text-2xs text-amber-ink flex items-center gap-1">
                <AlertTriangle size={12} /> {parsed.skipped.length} skipped
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="quiet" size="sm" onClick={() => setParsed(null)}>Discard</Button>
              <Button variant="primary" size="sm" onClick={save} disabled={importRows.isPending || parsed.rows.length === 0}>
                {importRows.isPending ? 'Saving…' : `Import ${parsed.rows.length}`}
              </Button>
            </div>
          </div>

          {/* Skipped rows are named, with the row number and the reason. A count alone leaves you
              diffing spreadsheets to find out what did not come through. */}
          {parsed.skipped.length > 0 && (
            <div className="px-4 py-2.5 bg-amber-bg/50 border-b border-line-soft">
              <ul className="text-2xs text-amber-ink flex flex-col gap-0.5">
                {parsed.skipped.slice(0, 6).map((s, i) => (
                  <li key={i}>Row {s.row}: {s.reason}</li>
                ))}
                {parsed.skipped.length > 6 && <li>…and {parsed.skipped.length - 6} more</li>}
              </ul>
            </div>
          )}

          <div className="max-h-[42vh] overflow-auto divide-y divide-line-soft">
            {parsed.rows.map((r) => (
              <div key={r.sourceIdent} className="flex items-center gap-3 px-4 py-2">
                <span className="text-sm2 font-mono font-bold text-blue-deep shrink-0">{r.sourceIdent}</span>
                <span className="text-sm2 text-text truncate flex-1">{r.sourceName ?? r.sourceDescription ?? '—'}</span>
                {r.custom && <Tag variant="warn" size="sm">Custom</Tag>}
                {!r.inScope && <Tag variant="neutral" size="sm">Out of scope</Tag>}
                {r.suggestedSapIdent && (
                  <span className="text-2xs font-mono text-muted shrink-0">→ {r.suggestedSapIdent}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <CandidateSummary candidates={candidates} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── option B: catalogue */

/** The catalogue holds everything SAP publishes, including rows nobody migrates from a project.
 * Only SIF_* (SAP's standard migration objects) and Z* (this landscape's own) can be selected —
 * the rest is reference data that would pad the list without ever being picked. */
const isSelectable = (objectId: string) => /^(SIF|Z)/i.test(objectId.trim());

function StandardPanel({ objects, candidates, subprojectId }: {
  objects: MigrationObject[];
  candidates: ScopeCandidate[];
  subprojectId: string;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [components, setComponents] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  /** The object whose details are open, plus the chain walked to reach it.
   *
   * `LibraryObjectDialog` lets you click a prerequisite and travel to it. In the Library each hop
   * is a URL and Back is browser history; here there is no URL to push, so the hops are kept in
   * this stack instead. Without it the dialog would offer a Back button that unwound nothing. */
  const [detail, setDetail] = useState<MigrationObject | null>(null);
  const [detailTrail, setDetailTrail] = useState<MigrationObject[]>([]);
  /** With 300+ rows you lose track of what you have ticked, and the ticks are the whole output of
   * this step. */
  const [selectedOnly, setSelectedOnly] = useState(false);

  const openDetail = (o: MigrationObject) => { setDetailTrail([]); setDetail(o); };
  const goToRelated = (objectId: string) => {
    const next = objects.find((o) => o.id === objectId);
    if (!next || !detail) return;
    setDetailTrail((t) => [...t, detail]);
    setDetail(next);
  };
  const goBackDetail = () => {
    const previous = detailTrail[detailTrail.length - 1];
    if (!previous) return;
    setDetail(previous);
    setDetailTrail((t) => t.slice(0, -1));
  };
  const { addStandard, removeStandard } = useScopeCandidateMutations(subprojectId);

  const selectable = useMemo(
    () => objects.filter((o) => isSelectable(o.objectId)),
    [objects],
  );

  const chosen = useMemo(
    () => new Set(candidates.filter((c) => c.origin === 'standard').map((c) => c.sourceIdent)),
    [candidates],
  );

  const componentOptions = useMemo(
    () => [...new Set(selectable.map((o) => o.component).filter((c): c is string => !!c))].sort(),
    [selectable],
  );
  const categoryOptions = useMemo(
    () => [...new Set(selectable.map((o) => o.category as string | undefined).filter((c): c is string => !!c))].sort(),
    [selectable],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return selectable.filter((o) => (
      (!q || o.objectId.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q))
      && (components.length === 0 || (!!o.component && components.includes(o.component)))
      && (categories.length === 0 || (!!o.category && categories.includes(o.category as string)))
      && (!selectedOnly || chosen.has(o.objectId))
    ));
  }, [selectable, query, components, categories, selectedOnly, chosen]);

  const toggle = async (o: MigrationObject) => {
    try {
      if (chosen.has(o.objectId)) await removeStandard.mutateAsync([o.objectId]);
      else await addStandard.mutateAsync([{ id: o.id, objectId: o.objectId, description: o.description }]);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update the selection.');
    }
  };

  const allFilteredChosen = filtered.length > 0 && filtered.every((o) => chosen.has(o.objectId));
  const toggleAll = async () => {
    try {
      if (allFilteredChosen) {
        await removeStandard.mutateAsync(filtered.map((o) => o.objectId));
      } else {
        await addStandard.mutateAsync(
          filtered
            .filter((o) => !chosen.has(o.objectId))
            .map((o) => ({ id: o.id, objectId: o.objectId, description: o.description })),
        );
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update the selection.');
    }
  };

  const hasFilters = !!query || components.length > 0 || categories.length > 0 || selectedOnly;
  const clear = () => {
    setQuery(''); setComponents([]); setCategories([]); setSelectedOnly(false);
  };

  // The same columns as Library > Migration Object, so the catalogue reads the same wherever you
  // meet it — only the leading checkbox differs, because here it means "migrate this".
  const columns: Column<MigrationObject>[] = [
    {
      key: 'select', width: 36,
      header: (
        <input
          type="checkbox" checked={allFilteredChosen} onChange={toggleAll}
          onClick={(e) => e.stopPropagation()}
          className="w-3.5 h-3.5 accent-[var(--blue)]"
          aria-label="Select every object shown"
        />
      ),
      render: (o) => (
        <input
          type="checkbox" checked={chosen.has(o.objectId)} onChange={() => toggle(o)}
          onClick={(e) => e.stopPropagation()}
          className="w-3.5 h-3.5 accent-[var(--blue)]"
          aria-label={'Include ' + o.objectId}
        />
      ),
    },
    // No 'Deprecated' tag, and no filter on `invalid`. That column is SAP's own DMC_COBJ.INVALID
    // flag, and 324 of the 331 catalogue rows carry it — a signal 98% of rows share discriminates
    // nothing, and filtering on it hid every real SIF_ object while leaving seven Z* ones.
    { key: 'objectId', header: 'Object ID', width: 210, render: (o) => <span className="font-mono">{o.objectId}</span>, sortValue: (o) => o.objectId },
    { key: 'description', header: 'Description', render: (o) => o.description ?? '—', sortValue: (o) => o.description },
    { key: 'category', header: 'Object Type', render: (o) => o.category ?? '—', sortValue: (o) => o.category },
    { key: 'approach', header: 'Approach', render: (o) => fmtApproach(o.approach ?? '') || '—', sortValue: (o) => o.approach },
    { key: 'component', header: 'Component', width: 120, render: (o) => o.component ?? '—', sortValue: (o) => o.component },
    {
      key: 'details', header: '', width: 40,
      render: (o) => (
        // An icon, not a labelled button. Repeated down 300 rows the word 'Details' became the
        // most-repeated thing on the screen while carrying no per-row information.
        <button
          type="button"
          onClick={() => openDetail(o)}
          title={`Open ${o.objectId} details`}
          aria-label={`Open ${o.objectId} details`}
          className="w-7 h-7 grid place-items-center rounded text-muted hover:bg-surface-2 hover:text-text transition-colors"
        >
          <Info size={14} />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <Toolbar
        spacing="none"
        search={{ value: query, onChange: setQuery, placeholder: 'Search the SAP catalogue…' }}
        onClearFilters={hasFilters ? clear : undefined}
        count={filtered.length} noun="objects" selectedCount={chosen.size}
        actions={
          // Reviewing what you have picked before moving on is a distinct VIEW, not a filter — it
          // was a checkbox among the facets, which is where nobody looks for 'show me my answer'.
          chosen.size > 0 ? (
            <Segmented
              value={selectedOnly ? 'selected' : 'all'}
              onChange={(v) => setSelectedOnly(v === 'selected')}
              options={[
                { value: 'all', label: 'Catalogue', title: 'Every object you can choose from' },
                {
                  value: 'selected',
                  label: (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> Selected
                      <span className="tabular-nums">{chosen.size}</span>
                    </span>
                  ),
                  title: 'Review what goes to the mapping step',
                },
              ]}
            />
          ) : undefined
        }
      >
        {componentOptions.length > 1 && (
          <MultiSelectFilter label="Component" options={componentOptions} selected={components} onChange={setComponents} />
        )}
        {categoryOptions.length > 1 && (
          <MultiSelectFilter label="Object Type" options={categoryOptions} selected={categories} onChange={setCategories} />
        )}
      </Toolbar>

      {filtered.length === 0 ? (
        <ListEmptyState
          noun="objects" filtered={hasFilters}
          description="This program's catalogue has no SIF_ or Z objects yet."
          onClearFilters={clear}
        />
      ) : (
        // Deliberately no `onRowClick`: the checkbox includes an object and Details opens it, so a
        // third meaning for clicking the row would be ambiguous with both.
        <Table columns={columns} rows={filtered} rowKey={(o) => o.id} pageSize={25} emptyMessage="Loading…" fill />
      )}

      {/* The SAME dialog as Library > Migration Object — details, structures, dependencies and
          the Standard FMD — rather than a second, thinner viewer of the same record. */}
      <LibraryObjectDialog
        object={detail}
        onClose={() => { setDetail(null); setDetailTrail([]); }}
        onSelectObject={goToRelated}
        onBack={goBackDetail}
        // Reading the object to decide whether to migrate it, not authoring a document from it.
        allowGenerateFmd={false}
        // Deliberately NOT scope-restricted, unlike the register and the ERD tab. This is the step
        // where the scope is being decided, and the prerequisites you most need to see are exactly
        // the ones that are not in it yet — hiding them would hide the reason to add them.
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────── shared */

function CandidateSummary({ candidates }: { candidates: ScopeCandidate[] }) {
  if (candidates.length === 0) return null;
  const inScope = candidates.filter((c) => c.inScope).length;
  const custom = candidates.filter((c) => c.custom).length;
  return (
    <div className="flex items-center gap-2.5 text-sm2 text-text">
      <CheckCircle2 size={15} className="text-green shrink-0" />
      <span>
        <span className="font-bold tabular-nums">{candidates.length}</span> object
        {candidates.length === 1 ? '' : 's'} in this list · <span className="tabular-nums">{inScope}</span> in scope
        {custom > 0 && <> · <span className="tabular-nums">{custom}</span> custom</>}
      </span>
      <span className="text-2xs text-muted">Re-uploading a corrected file updates these rather than duplicating them.</span>
    </div>
  );
}

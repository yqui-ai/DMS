import { By, Fact, Group } from './versionFacts';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { History, Pencil, Sparkles } from 'lucide-react';
import { Pane } from '../../../components/Pane';
import { Tag } from '../../../components/Tag';
import { Select } from '../../../components/Select';
import { MultiSelectFilter } from '../../../components/MultiSelectFilter';
import { ToolbarSearch } from '../../../components/ToolbarSearch';
import { fmtDateTime } from '../../../lib/format';
import { REVIEW_POINT_CATEGORIES } from '../../../lib/reviewPointCategories';
import { rowKey } from '../../../lib/rowDiff';
import { ReviewPointThread } from '../ReviewPointThread';
import { DRAFT_VERSION } from '../../../lib/queries/fmds';
import { findingKey } from '../../../lib/queries/mappingReview';
import type { LibraryFmdRow } from '../../../lib/queries/fmds';
import type { FmdFieldNote, FmdVersion, GoldenFmdStructure, GovState, MappingReview, MappingReviewFinding } from '../../../types/entities';

const STATE_VARIANT: Record<GovState, 'neutral' | 'warn' | 'accent' | 'danger'> = { Draft: 'neutral', 'In Review': 'warn', Approved: 'accent', Rejected: 'danger' };

/** The selected version's audit trail, the AI's findings, and the review points people wrote —
 * three panes read together.
 *
 * Owns every filter on this screen. Those used to live beside the field-view and draft state in one
 * scope, which is what made a shared reset effect risky; a filter here can no longer reach anything
 * outside this tab. The selected REVIEW stays with the parent, because it also decides which
 * findings highlight cells over on the mapping grid. */
export function FmdReviewTab({
  fmd, selected, owner, etlDeveloper, objectIdent, isCustomFmd, isGenerated, reviewing,
  reviews, activeReview, onSelectReview,
  fieldNotes, onReply, onToggleResolved, onGoToFinding, onGoToNote, onToggleAddressed,

}: {
  fmd: LibraryFmdRow;
  selected?: FmdVersion;
  owner?: string;
  /** Shown beside the consultant — "who is building this" is the next question anyone asks. */
  etlDeveloper?: string;
  /** The migration object this FMD maps, resolved by the caller from the catalogue it holds. */
  objectIdent?: string;
  isCustomFmd: boolean;
  isGenerated: boolean;
  reviewing: boolean;
  reviews: MappingReview[];
  activeReview?: MappingReview;
  onSelectReview: (id: string | null) => void;
  fieldNotes: FmdFieldNote[];
  onReply: (parent: FmdFieldNote, body: string) => Promise<void>;
  onToggleResolved: (noteId: string, resolved: boolean) => Promise<void>;
  onGoToFinding: (f: MappingReviewFinding) => void;
  /** Opens the field a review point was written against. */
  onGoToNote: (n: FmdFieldNote) => void;
  /** Marks a finding as fixed-in-draft, or clears it. Undefined while a review or publish is
   * running, since both rewrite the same `sheets` this writes into. */
  onToggleAddressed?: (key: string, addressed: boolean) => Promise<void>;
  goldenStructure?: GoldenFmdStructure;
  goldenVersionId?: string;
  goldenVersionLabel?: string;
}) {
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [structureFilter, setStructureFilter] = useState<string[]>([]);
  const [fieldFilter, setFieldFilter] = useState<string[]>([]);
  const [findingSearch, setFindingSearch] = useState('');
  /** Closed points are HIDDEN by default, not collapsed. On an FMD with a long review history the
   * done items are the majority, and a list of mostly-settled work buries what's outstanding. */
  const [showClosedPoints, setShowClosedPoints] = useState(false);
  /** Findings marked fixed-in-draft are hidden by default, the same way closed review points are:
   * what's left is the work still outstanding. */
  const [showAddressed, setShowAddressed] = useState(false);

  // Filters describe one version's findings, so switching version clears them rather than leaving a
  // filter applied to a list it was never chosen for.
  useEffect(() => {
    setSeverityFilter([]); setStructureFilter([]); setFieldFilter([]); setFindingSearch('');
  }, [selected?.id]);

  const allFindings = activeReview?.findings ?? [];
  const addressedCount = allFindings.filter((f) => f.addressed).length;
  /** Findings on an inherited review whose exact cell the draft has since touched. */
  const editedFindingCount = allFindings.filter((f) => f.editedInDraft && !f.addressed).length;
  const errorCount = allFindings.filter((f) => f.severity === 'error').length;
  const warningCount = allFindings.length - errorCount;
  const structureOptions = useMemo(() => [...new Set(allFindings.map((f) => f.structureIdent))], [activeReview]);
  const fieldOptions = useMemo(() => [...new Set(allFindings.map((f) => f.field).filter((f): f is string => !!f))], [activeReview]);
  /** Keyed against the FULL list, because findingKey() falls back to array position for findings
   * saved before ids existed — keying off the filtered list would hand the same finding a different
   * key every time a filter changed. */
  const filteredFindings = useMemo(() => {
    const q = findingSearch.trim().toLowerCase();
    return allFindings
      .map((f, i) => ({ f, key: findingKey(f, i) }))
      .filter(({ f }) => {
        if (!showAddressed && f.addressed) return false;
        if (severityFilter.length > 0 && !severityFilter.includes(f.severity)) return false;
        if (structureFilter.length > 0 && !structureFilter.includes(f.structureIdent)) return false;
        if (fieldFilter.length > 0 && !(f.field && fieldFilter.includes(f.field))) return false;
        if (!q) return true;
        return [f.structureIdent, f.field, f.srcField, f.tgtField, f.issue].some((v) => v?.toLowerCase().includes(q));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReview, severityFilter, structureFilter, fieldFilter, findingSearch, showAddressed]);
  const findingFiltersActive = severityFilter.length > 0 || structureFilter.length > 0 || fieldFilter.length > 0 || findingSearch !== '';

  // Notes are stored against (structureId, rowKey) and are version-independent, so they're resolved
  // against whichever version is on screen to recover a readable field label. A note whose row no
  // longer exists still shows — with its raw row key — because "the row this was written about is
  // gone" is itself worth seeing.
  const resolvedNotes = useMemo(() => {
    const tables = selected?.sheets.generatedTables ?? [];
    const labelByKey = new Map<string, { structureIdent: string; label: string }>();
    for (const t of tables) {
      t.rows.forEach((r, i) => {
        labelByKey.set(`${t.structureId}::${rowKey(r, i)}`, {
          structureIdent: t.structureIdent,
          label: r.SRC_FIELD || r.TGT_FIELD || `Row ${i + 1}`,
        });
      });
    }
    // Top-level points only — replies render inside their parent's thread, not as list entries.
    return fieldNotes.filter((n) => !n.parentId && (showClosedPoints || !n.resolved)).map((n) => {
      const hit = labelByKey.get(`${n.structureId}::${n.rowKey}`);
      return { note: n, structureIdent: hit?.structureIdent, label: hit?.label ?? n.rowKey, orphaned: !hit };
    });
  }, [fieldNotes, selected, showClosedPoints]);
  const closedPointCount = fieldNotes.filter((n) => !n.parentId && n.resolved).length;

  return (
    <>
      <div className="h-full flex gap-4 min-h-0">
        {/* Left: which version you're looking at (picked in the header dropdown) and its
            audit trail. Right: the two kinds of review side by side — the AI's findings and
            the points people wrote — since they're read together, not either/or. */}
        <VersionDetailsPane
          fmd={fmd} selected={selected} owner={owner} etlDeveloper={etlDeveloper} objectIdent={objectIdent}
          className={clsx('shrink-0', isCustomFmd ? 'w-[300px]' : 'flex-1 min-w-0')}
        />
        {isCustomFmd && (
        <>
        <Pane
          title="Auto review (AI)" className="flex-1 min-w-0" bodyClassName="p-3 flex flex-col gap-2.5"
          actions={allFindings.length > 0 ? (
            <>
              {errorCount > 0 && <Tag variant="danger" size="sm">{errorCount} error{errorCount === 1 ? '' : 's'}</Tag>}
              {warningCount > 0 && <Tag variant="warn" size="sm">{warningCount} warning{warningCount === 1 ? '' : 's'}</Tag>}
              {addressedCount > 0 && (
                <button
                  onClick={() => setShowAddressed((v) => !v)}
                  className="text-2xs font-semibold text-blue hover:underline ml-auto shrink-0"
                >
                  {addressedCount} addressed · {showAddressed ? 'Hide' : 'Show'}
                </button>
              )}
            </>
          ) : undefined}
        >
          {!selected ? (
            <p className="text-sm2 text-muted">Select a version to review.</p>
          ) : !isGenerated ? (
            <p className="text-sm2 text-muted py-8 text-center">This version has no generated mapping data to review.</p>
          ) : reviewing ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Sparkles size={26} className="text-violet-deep animate-pulse" />
              <p className="text-sm2 font-semibold text-text">Reviewing mapping…</p>
              <p className="text-2xs text-muted">Checking completeness and mapping-type rules for every row. This can take a while for a large FMD.</p>
            </div>
          ) : !activeReview ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-sm2 text-muted">
                {selected.version === DRAFT_VERSION
                  ? 'The version this draft sits on has not been reviewed.'
                  : "This version hasn't been reviewed yet."}
              </p>
              <p className="text-2xs text-muted">Click "Review Mapping" above to check it against the mapping rule policy.</p>
            </div>
          ) : (
            <>
              {/* An inherited review is the previous run, shown against edited content. Saying so
                  once at the top is what lets the findings below be read as a worklist rather than
                  as a verdict on what is currently on screen. */}
              {activeReview.inheritedFrom && (
                <div className="flex items-start gap-2 rounded bg-surface-2 px-2.5 py-2 shrink-0">
                  <History size={13} className="text-muted shrink-0 mt-0.5" />
                  <p className="text-2xs text-muted">
                    Carried over from{' '}
                    <span className="font-mono font-semibold text-text">{activeReview.inheritedFrom.version}</span>
                    {' '}— this draft has not been reviewed.
                    {editedFindingCount > 0 && (
                      <> <span className="font-semibold text-text">{editedFindingCount}</span> of these
                        {' '}{allFindings.length} findings point at a cell the draft has since changed.</>
                    )}
                    {' '}Publish, then review again for a fresh verdict.
                  </p>
                </div>
              )}
              {/* Each fact once. The run picker already carries the date and the pane header already
                  counts the findings, so the prose says only who — and the picker's options drop the
                  finding count they were repeating. */}
              <div className="flex items-center justify-between gap-3 shrink-0 flex-wrap">
                <p className="text-2xs text-muted">
                  Reviewed by <span className="font-semibold text-text">{activeReview.reviewedBy}</span>
                  {reviews.length === 1 && <> · {fmtDateTime(activeReview.reviewedAt)}</>}
                </p>
                {reviews.length > 1 && (
                  <Select
                    value={activeReview.id ?? ''} onChange={(e) => onSelectReview(e.target.value || null)}
                    size="sm"
                  >
                    {reviews.map((r, i) => (
                      <option key={r.id ?? i} value={r.id ?? ''}>
                        Run {i + 1} of {reviews.length} · {fmtDateTime(r.reviewedAt)}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
              {allFindings.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <ToolbarSearch value={findingSearch} onChange={setFindingSearch} placeholder="Search field, structure, issue…" />
                  <MultiSelectFilter label="Type" options={['error', 'warning']} selected={severityFilter} onChange={setSeverityFilter} />
                  {/* A filter over a single value can only ever return everything or nothing. */}
                  {structureOptions.length > 1 && (
                    <MultiSelectFilter label="Structure" options={structureOptions} selected={structureFilter} onChange={setStructureFilter} />
                  )}
                  <MultiSelectFilter label="Field" options={fieldOptions} selected={fieldFilter} onChange={setFieldFilter} />
                </div>
              )}
              {allFindings.length === 0 ? (
                <p className="text-sm2 font-semibold text-green py-8 text-center">✓ No issues found — every row complies with the mapping rule policy.</p>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto flex flex-col">
                  {filteredFindings.length === 0 && (
                    <p className="text-sm2 text-muted py-8 text-center">
                      {findingFiltersActive ? 'No findings match these filters.' : 'No findings.'}
                    </p>
                  )}
                  {/* A div, not a button: it now contains its own button, and nesting those is
                      invalid. tabIndex keeps Enter working as the keyboard equivalent of the
                      double-click. */}
                  {filteredFindings.map(({ f, key }) => (
                    <div
                      key={key}
                      tabIndex={0}
                      onDoubleClick={() => onGoToFinding(f)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onGoToFinding(f); }}
                      title="Double-click to open this field"
                      className={clsx(
                        'flex items-start gap-2.5 p-2.5 border-b border-line-soft last:border-b-0 shrink-0 text-left hover:bg-blue-pale w-full',
                        f.addressed && 'opacity-60',
                      )}
                    >
                      {/* One letter, fixed width. "error" and "warning" are different lengths, so
                          every row below the first started at a different x — the severity is a
                          two-state flag and doesn't need to be spelled out on all of them. */}
                      <Tag
                        variant={f.severity === 'error' ? 'danger' : 'warn'} size="sm"
                        className="shrink-0 mt-0.5 w-[18px] px-0 justify-center font-bold"
                        title={f.severity}
                      >
                        {f.severity === 'error' ? 'E' : 'W'}
                      </Tag>
                      <div className="text-sm2 min-w-0 flex-1">
                        <span className="text-muted">
                          {/* Named only when the review spans more than one — otherwise it's the
                              same word on every row, which identifies nothing. */}
                          {structureOptions.length > 1 && <span className="font-mono font-bold text-text">{f.structureIdent}</span>}
                          {structureOptions.length > 1 && (f.field || f.srcField || f.tgtField) && ' · '}
                          {f.field}
                          {f.field && (f.srcField || f.tgtField) && ' · '}
                          {f.srcField || f.tgtField}
                        </span>
                        <div className={clsx('text-text', f.addressed && 'line-through decoration-1')}>{f.issue}</div>
                        {f.addressed && (
                          <div className="text-2xs text-muted mt-0.5">
                            Fixed in draft by {f.addressed.by} · {fmtDateTime(f.addressed.at)}
                          </div>
                        )}
                        {/* Deliberately not "fixed": an edit to the cell is a fact, whether it
                            resolves the finding is a judgement, and `addressed` is where someone
                            makes that judgement. */}
                        {f.editedInDraft && !f.addressed && (
                          <div className="text-2xs text-blue mt-0.5 flex items-center gap-1">
                            <Pencil size={10} /> This cell has been edited in the draft
                          </div>
                        )}
                      </div>
                      {onToggleAddressed && (
                        <button
                          onClick={() => onToggleAddressed(key, !f.addressed)}
                          className="text-2xs font-semibold text-blue hover:underline shrink-0 mt-0.5"
                          title={f.addressed
                            ? 'Put this finding back on the outstanding list'
                            : 'You have fixed this in the draft — it stays marked until the version is reviewed again'}
                        >
                          {f.addressed ? 'Reopen' : 'Mark fixed'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Pane>

        <Pane
          title="Review points" className="flex-1 min-w-0"
          actions={
            <>
              <ReviewPointInsights notes={fieldNotes} />
              {closedPointCount > 0 && (
                <button
                  onClick={() => setShowClosedPoints((v) => !v)}
                  className="text-2xs font-semibold text-blue hover:underline ml-auto shrink-0"
                >
                  {/* Same shape as the Auto review pane's addressed toggle beside it: count,
                      then the verb. Two panes side by side reading "Show 8 closed" and
                      "12 addressed · Hide" made the same control look like two. */}
                  {closedPointCount} closed · {showClosedPoints ? 'Hide' : 'Show'}
                </button>
              )}
            </>
          }
        >
          <ReviewPointsList
            notes={resolvedNotes} allNotes={fieldNotes} hasClosed={closedPointCount > 0 && !showClosedPoints}
            onReply={onReply} onToggleResolved={onToggleResolved} onGoToNote={onGoToNote}
          />
        </Pane>
        </>
        )}
      </div>
    </>
  );
}

function ReviewPointInsights({ notes }: { notes: FmdFieldNote[] }) {
  const points = notes.filter((n) => !n.parentId);
  if (points.length === 0) return null;
  const open = points.filter((n) => !n.resolved);
  const resolved = points.length - open.length;
  const openByCategory = REVIEW_POINT_CATEGORIES
    .map((c) => ({ cat: c, n: open.filter((p) => p.tag === c.key).length }))
    .filter((x) => x.n > 0);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {openByCategory.map(({ cat, n }) => (
        <Tag key={cat.key} variant={cat.variant} title={`${n} open ${cat.label.toLowerCase()}`}>{n} {cat.label}</Tag>
      ))}
      {openByCategory.length === 0 && open.length === 0 && <Tag variant="accent">All closed</Tag>}
      {resolved > 0 && <span className="text-2xs text-muted">{resolved} closed</span>}
      <span className="text-2xs text-muted">· {points.length} total</span>
    </div>
  );
}

/** Every manually-written review point on this FMD, across all its fields — the counterpart to the
 * AI's findings in the same tab, and the in-app equivalent of the comments column in an Excel FMD.
 * Notes belong to the FMD rather than to one version, so this list is deliberately NOT filtered by
 * the selected version; only the field label is resolved against it. */
function ReviewPointsList({ notes, allNotes, hasClosed, onReply, onToggleResolved, onGoToNote }: {
  notes: { note: FmdFieldNote; structureIdent?: string; label: string; orphaned: boolean }[];
  /** Unfiltered list, so a point's replies are found regardless of how the parent list is shown —
   * and at any depth, since the thread walks it to build its own tree. */
  allNotes: FmdFieldNote[];
  /** Whether closed points exist but are filtered out — changes "nothing here" into "nothing left". */
  hasClosed: boolean;
  onReply: (parent: FmdFieldNote, body: string) => Promise<void>;
  onToggleResolved: (noteId: string, resolved: boolean) => Promise<void>;
  onGoToNote: (n: FmdFieldNote) => void;
}) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm2 text-muted">{hasClosed ? 'Nothing outstanding.' : 'No review points yet.'}</p>
        <p className="text-2xs text-muted">
          {hasClosed
            ? 'Closed points are hidden — use "Show closed" above to see them.'
            : 'Open a field from the Field Mapping tab and add a review point against it.'}
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto flex flex-col">
      {notes.map(({ note: n, structureIdent, label, orphaned }) => (
        <ReviewPointThread
          key={n.id} point={n} allNotes={allNotes}
          onReply={onReply} onToggleResolved={onToggleResolved} collapsible
          onOpenField={orphaned ? undefined : () => onGoToNote(n)}
          meta={
            <div className="flex items-center gap-1.5 flex-wrap text-sm2">
              {structureIdent && <span className="font-mono font-bold">{structureIdent}</span>}
              <span className={clsx('font-mono text-muted', orphaned && 'italic')}>· {label}</span>
              {orphaned && <Tag variant="neutral">not in this version</Tag>}
            </div>
          }
        />
      ))}
    </div>
  );
}


/** Who/when/state/comment for the selected version, plus which Golden/Reference version it was
 * built from. Lives on the Versions tab, beside the review panes for Custom FMDs and full-width for
 * everything else) rather than next to the mapping data, so the Field Mapping tab is nothing but
 * the mapping itself. */
function VersionDetailsPane({ fmd, selected, owner, etlDeveloper, objectIdent, className }: {
  fmd: LibraryFmdRow; selected?: FmdVersion; owner?: string; etlDeveloper?: string;
  objectIdent?: string; className?: string;
}) {
  /** The comment with its bullet list stripped when the change log already carries the detail.
   *
   * Publishing no longer writes those bullets, but versions released before that still hold them,
   * and re-rendering history is not an option — so they are dropped at read time instead. Only
   * `- ` lines go: a comment somebody typed by hand survives intact, which is the whole reason
   * this filters rather than hiding the block outright whenever a log exists. */
  const hasLog = (selected?.sheets.changeLog?.length ?? 0) > 0;
  const commentText = (() => {
    const raw = selected?.comment?.trim();
    if (!raw) return '';
    if (!hasLog) return raw;
    return raw
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('- '))
      .join('\n')
      .replace(/:\s*$/, '.')
      .trim();
  })();

  return (
    <Pane title="Version details" className={className} bodyClassName="p-3.5">
      <div>
      {selected ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            {/* The draft's "version" IS the word Draft, so the state tag beside it would say it twice. */}
            {selected.version !== DRAFT_VERSION && (
              <span className="font-mono font-bold text-sm2 text-blue-deep w-fit bg-blue-pale px-2 py-0.5 rounded">{selected.version}</span>
            )}
            <Tag variant={STATE_VARIANT[selected.state]}>{selected.state}</Tag>
          </div>

          {/* Everyone who touched this, in ONE group. "Edited by" and "FMD created by" were split
              across a rule as though they were different kinds of fact; they are the same kind —
              a person and a date — and reading them together is how you answer "who has had this". */}
          <Group>
            {/* Custom FMDs only. Ownership is `subproject_objects.owner` — it is assigned when the
                object is put in scope for a subproject, so only a document that HAS a subproject can
                have one. A Standard or Golden FMD is programme-wide: it has no scope entry, so
                "Not assigned in scope" read as a gap somebody should go and fill, when in fact the
                field does not apply to that kind of document at all. */}
            {fmd.type === 'Custom' && (
              <Fact label="Consultant">
                {owner ? <span className="font-semibold break-all">{owner}</span> : <span className="text-muted">Not assigned in scope</span>}
              </Fact>
            )}
            {etlDeveloper && <Fact label="ETL developer"><span className="font-semibold break-all">{etlDeveloper}</span></Fact>}
            <Fact label="Modified by"><By who={selected.createdBy} at={selected.createdAt} /></Fact>
            {selected.approvedBy && (
              <Fact label="Approved by"><By who={selected.approvedBy} at={selected.approvedAt} /></Fact>
            )}
            {fmd.createdBy && <Fact label="Created by"><By who={fmd.createdBy} at={fmd.createdAt} /></Fact>}
            {/* No "Last modified" row. It reported the FMD's newest edit while "Modified by" above
                reports the selected version's — so on the version you are almost always reading,
                the newest one, they are the same person and the same act stated twice. Which
                version was touched last is what the version selector and the Versions list are
                for. */}
          </Group>

          {/* Stable attributes of the document rather than of this release. Class and Reference used
              to be columns in the Field Mapping list; Golden/Reference alignment moved the other way,
              to the Health check tab, because it is a fact about the FMD and not about the version
              you happen to be reading. */}
          <Group>
            {/* The object this document maps, stated on the document itself.
                It is not decoration: assignment matches an in-scope migration object to the FMDs
                written for that object, so this ident is the key the Assign FMD list searches on.
                A version detail pane that showed Class and Reference but not WHICH OBJECT the
                mapping is for was missing the one field the rest of the flow keys on. */}
            <Fact label="Object">
              {objectIdent
                ? <span className="font-mono font-semibold">{objectIdent}</span>
                : <span className="text-muted">Not tied to an object</span>}
            </Fact>
            <Fact label="Class">{fmd.class}</Fact>
            <Fact label="Reference">{fmd.reference}</Fact>
            {!!selected.sheets.generatedTables?.length && (
              <Fact label={selected.sheets.generatedTables.length === 1 ? 'Structure' : 'Structures'}>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {selected.sheets.generatedTables.map((t) => (
                    <Tag key={t.structureId} variant="table" title={t.structureDescription}>{t.structureIdent}</Tag>
                  ))}
                </span>
              </Fact>
            )}
          </Group>

          {/* Full width, not in the label column: a change log runs to several lines and a 74px
              indent would cost a third of the width it needs. */}
          {!!commentText && (
            <div className="border-t border-line pt-2.5">
              <div className="text-2xs font-bold uppercase tracking-[.05em] text-muted mb-1">Comment</div>
              <p className="text-sm2 whitespace-pre-wrap break-words">{commentText}</p>
            </div>
          )}

          {/* The comment says WHY this version exists, in one line. This is the complete record of
              WHAT changed, kept on the version itself, so a released version can still answer 'who
              changed this field, and when'. The two must never say the same thing twice. */}
          {(selected.sheets.changeLog?.length ?? 0) > 0 && (
            <div className="border-t border-line pt-2.5">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-2xs font-bold uppercase tracking-[.05em] text-muted">Change log</span>
                <span className="text-2xs text-muted tabular-nums">{selected.sheets.changeLog!.length}</span>
              </div>
              <div className="flex flex-col gap-1.5 max-h-[220px] overflow-auto">
                {selected.sheets.changeLog!.map((c) => (
                  <div key={c.id} className="text-2xs">
                    <div className="text-muted">
                      {c.structureIdent ? `${c.structureIdent} · ` : ''}{c.rowLabel} ·{' '}
                      <span className="font-mono font-semibold text-text">{c.field}</span>
                    </div>
                    {/* Muted → emphasised, not red → green. Those are the app's error and success
                        colours; spending them on every row of an ordinary edit list makes a dozen
                        routine changes read as six failures and six wins. Matches the Draft tab. */}
                    <div className="flex items-baseline gap-1 flex-wrap">
                      <span className="text-muted line-through decoration-1">{c.from || '—'}</span>
                      <span className="text-muted">→</span>
                      <span className="text-text font-semibold">{c.to || '—'}</span>
                    </div>
                    <div className="text-muted">{c.by} · {fmtDateTime(c.at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm2 text-muted">Select a version to see its details.</p>
      )}
      </div>
    </Pane>
  );
}

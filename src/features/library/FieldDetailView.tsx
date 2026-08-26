import { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from '../../components/Select';
import { ReviewPointThread } from './ReviewPointThread';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { useUnsavedGate } from '../../components/useUnsavedGate';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Segmented';
import clsx from 'clsx';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pencil, Search, Send, Sparkles, X } from 'lucide-react';
import { Tag } from '../../components/Tag';
import { colorByKey } from '../../lib/goldenFmdColors';
import { REVIEW_POINT_CATEGORIES, isActionable } from '../../lib/reviewPointCategories';
import { classifyTransform, optionsOf, requiresSql, valueTypeError, MAPPING_TYPE_VALUES } from '../../lib/mappingRulePolicy';
import { useGenerateTechnicalRule, type TechnicalRuleResult } from '../../lib/queries/technicalRule';
import type { FmdFieldNote, GeneratedColumn, GeneratedTable, GoldenFieldKind } from '../../types/entities';
import type { ReviewCellFinding } from './GeneratedFmdTableView';

const HIGHLIGHT_BG = { error: '#fecaca', warning: '#fed7aa' };
/** Free-text paragraph fields — given the full card width instead of a half-width column, the same
 * split GeneratedFmdTableView makes with FIELD_MAX_WIDTH. */
const WIDE_FIELDS = new Set(['TRANSFORMATION_RULE', 'TECHNICAL_RULE', 'SRC_FIELD_DESC', 'TGT_FIELD_DESC', 'COMMENTS']);
/** Rendered monospaced in both read and edit mode — these hold code, not prose. */
const MONO_FIELDS = new Set(['TECHNICAL_RULE']);
/** Short enum fields that shouldn't stretch across a grid column. */
const NARROW_FIELDS = new Set(['MAPPING_TYPE']);

/** Golden sections in column order, each carrying its own palette entry — the field-level view
 * groups a row's values under the same sections the table renders as colored header bands, so the
 * two views read as the same document in two shapes rather than two unrelated screens. */
function sectionGroups(columns: GeneratedColumn[]): { sectionName: string; color: string; cols: GeneratedColumn[] }[] {
  const groups: { sectionName: string; color: string; cols: GeneratedColumn[] }[] = [];
  for (const c of columns) {
    const last = groups[groups.length - 1];
    if (last && last.sectionName === c.sectionName) last.cols.push(c);
    else groups.push({ sectionName: c.sectionName, color: c.color, cols: [c] });
  }
  return groups;
}

/** One cell's value. Read mode renders plain text; edit mode renders a control. Which mode it's in
 * is decided by the SECTION, not by clicking the value — a single click quietly turning a document
 * into a form is how people change data they only meant to read. Enter commits (Shift+Enter for a
 * newline in the wide fields), Escape reverts, blur commits. */
function EditableValue({ value, wide, mono, options, kind, editing, onSave, onDirtyChange, isCancelling }: {
  value: string; wide?: boolean;
  /** SQL and other code render monospaced in BOTH modes — a statement set in the body face is
   * harder to scan and stops looking like something you'd run. */
  mono?: boolean;
  /** A fixed value set becomes a select rather than a free-text box — typing an enum by hand
   * invites typos the policy then has to reject. Declared per column in the GOLDEN TEMPLATE now;
   * MAPPING_TYPE's four values used to be the only list, hardcoded here, so no other column could
   * ever have one without a code change. */
  options?: readonly string[];
  /** What the column accepts. Decides the editor and rejects a value that doesn't fit. */
  kind?: GoldenFieldKind;
  editing: boolean; onSave: (next: string) => Promise<void>;
  /** Checked at commit time. Clicking Cancel blurs whichever input has focus, and blur is what
   * commits — so without this the field you were typing in saved itself on the way out, and then
   * raced the revert to decide which value won. */
  isCancelling?: () => boolean;
  /** Reports typed-but-not-yet-committed text upward.
   *
   * A cell commits on blur, so I first assumed there was nothing here to lose — but a rule you are
   * halfway through typing has not blurred yet, and navigating away takes it with you. The draft
   * lives in this component's own state, so the only way the guard can know about it is if this
   * says so. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value); }, [value, editing]);
  useEffect(() => {
    onDirtyChange?.(editing && draft !== value);
    // Leaving edit mode or unmounting can't leave a stale "dirty" behind.
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, value, editing]);

  const [typeError, setTypeError] = useState<string | null>(null);

  const commit = async (next = draft) => {
    if (isCancelling?.()) { setDraft(value); return; }
    if (next === value) return;
    // Caught at the point of typing rather than at the next review: the value never reaches the
    // draft, so there is nothing to find later and nothing to undo.
    const problem = valueTypeError({ field: '', sectionName: '', color: '', kind, options: options ? [...options] : undefined }, next);
    if (problem) { setTypeError(problem); setDraft(value); return; }
    setTypeError(null);
    setSaving(true);
    try { await onSave(next); } finally { setSaving(false); }
  };

  if (!editing) {
    return (
      <div className={clsx('text-sm2 text-text whitespace-pre-wrap break-words', mono && 'font-mono', saving && 'opacity-50')}>
        {value || <span className="text-muted font-sans">—</span>}
      </div>
    );
  }
  if (options) {
    return (
      <>
        <Select
          size="sm" value={value} className="w-full"
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
        >
          {/* Blank stays reachable so a value can be taken back out; whether it's ALLOWED to be
              blank is the completeness check's business, not the dropdown's. */}
          <option value="">—</option>
          {/* A value already in the cell that isn't on the list stays selectable, so opening the
              editor can't silently rewrite it — the review is what flags it. */}
          {value && !options.includes(value) && <option value={value}>{value}</option>}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        {typeError && <p className="text-2xs text-red mt-1">{typeError}</p>}
      </>
    );
  }
  if (kind === 'boolean') {
    const on = /^(x|y|yes|true|1)$/i.test(value.trim());
    return (
      <label className="flex items-center gap-2 text-sm2">
        <input
          type="checkbox" checked={on} className="w-3.5 h-3.5 accent-[var(--blue)]"
          onChange={(e) => { const next = e.target.checked ? 'X' : ''; setDraft(next); commit(next); }}
        />
        <span className="text-muted">{on ? 'Yes' : 'No'}</span>
      </label>
    );
  }
  const shared = {
    value: draft,
    ...(kind === 'integer' || kind === 'decimal' ? { type: 'number', step: kind === 'integer' ? 1 : 'any' } : {}),
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: () => commit(),
    className: clsx('w-full text-sm2 bg-surface border border-line-strong focus:border-blue rounded-[6px] px-1.5 py-1', mono && 'font-mono'),
  };
  return wide ? (
    <textarea
      {...shared} rows={4}
      // Enter inserts a newline. It used to commit — so a transformation rule you were partway
      // through writing saved itself mid-sentence, opened a draft, and raised a toast over the
      // box you were typing in. Cmd/Ctrl+Enter is the deliberate save; so is clicking away.
      onKeyDown={(e) => {
        if (e.key === 'Escape') setDraft(value);
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
      }}
    />
  ) : (
    <input
      {...shared}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setDraft(value);
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

const rowLabelOf = (row: Record<string, string> | undefined, i: number) =>
  row?.SRC_FIELD || row?.TGT_FIELD || `Row ${i + 1}`;

/** One field mapping, one screen — the field-level alternative to the dense table, reached by
 * drilling into a row. A migration object can have several sender structures, so the structure
 * picker lives here too: the left panel switches structure and field without going back to the
 * table, and prev/next walks the rows of whichever structure is showing. Everything on screen
 * belongs to the version selected in the dialog header; changing that version closes this view.
 * Deliberately mirrors the shape a future in-app FMD editor needs (one field's full record laid
 * out for editing) even though nothing here is editable yet. */
export function FieldDetailView({
  columns, tables, structureId, rowIndex, onOpen, onBack, onDirtyChange, backLabel = 'Back to table',
  findings, notes, canAddNote, onAddNote, onReply, onToggleResolved, canEdit = false, onSaveField,
}: {
  columns: GeneratedColumn[];
  /** Every structure on this version — the picker's options, not just the open one. */
  tables: GeneratedTable[];
  structureId: string; rowIndex: number;
  /** Jump to any (structure, row) — used by the field list, the structure picker and prev/next. */
  onOpen: (structureId: string, rowIndex: number) => void;
  onBack: () => void;
  /** Reports typed-but-uncommitted work upward, so the FMD dialog can guard its own tab strip and
   * close button — neither of which is a route change, so no navigation API can see them. */
  onDirtyChange?: (dirty: boolean) => void;
  /** What Back returns to. Arriving from a review point means the table isn't where you came from,
   * and a button naming the wrong destination is worse than no button. */
  backLabel?: string;
  /** field -> finding, already resolved to this specific row by the caller. */
  findings?: Map<string, ReviewCellFinding>;
  /** Every note for this row (already filtered by structureId+rowKey by the caller). */
  notes: FmdFieldNote[];
  canAddNote: boolean;
  onAddNote: (tag: string, body: string) => Promise<void>;
  /** Replying is what makes a review point a conversation. It was missing here, so a point raised
   * on a field could only be answered from the other tab. */
  onReply: (parent: FmdFieldNote, body: string) => Promise<void>;
  onToggleResolved: (noteId: string, resolved: boolean) => Promise<void>;
  /** Cell editing. Open to anyone today; the intended end state is owner-only, which is a one-line
   * change at the call site because the gate already lives there rather than in here. */
  canEdit?: boolean;
  onSaveField?: (structureId: string, rowIndex: number, field: string, value: string) => Promise<void>;
}) {
  const [listOpen, setListOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(true);
  const [fieldSearch, setFieldSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [draftTag, setDraftTag] = useState<string>('todo');
  const [posting, setPosting] = useState(false);
  /** One section at a time — editing the whole record at once turns the panel into a wall of inputs
   * and loses the layout that makes it readable in the first place. */
  const [editingSection, setEditingSection] = useState<string | null>(null);
  /** The section's values as they were when editing started.
   *
   * Fields commit on blur, so by the time you decide against a change it is already saved — Cancel
   * can only mean "put it back". Keeping the starting values is what lets it. They're still only
   * draft edits either way: nothing here touches a published version. */
  const [sectionSnapshot, setSectionSnapshot] = useState<Record<string, string> | null>(null);

  /** The AI draft is PROPOSED, never written straight into the row — a generated rule that is
   * subtly wrong is much harder to catch once it looks like something a person typed. */
  const [sqlDraft, setSqlDraft] = useState<TechnicalRuleResult | null>(null);
  /** Which fields have text typed but not committed. A Set rather than a boolean because several
   * cells in a section can be part-typed at once, and each reports independently. */
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  /** Set on mousedown — before the blur that a click on Cancel causes — and cleared once the
   * revert has finished. A ref rather than state because the blur handler reads it in the same tick
   * the click sets it, and a state update would not have landed yet. */
  const cancellingRef = useRef(false);
  const hasUnsaved = dirtyFields.size > 0 || !!sqlDraft;
  useEffect(() => { onDirtyChange?.(hasUnsaved); }, [hasUnsaved, onDirtyChange]);
  // Moving to another field, another structure, or back to the table all destroy the same work as
  // leaving the screen does — they just aren't navigation, so they have to ask for themselves.
  const { gate, dialog: gateDialog } = useUnsavedGate(hasUnsaved, 'Your edits to this field');
  const markDirty = (field: string, dirty: boolean) => setDirtyFields((cur) => {
    if (cur.has(field) === dirty) return cur;
    const next = new Set(cur);
    if (dirty) next.add(field); else next.delete(field);
    return next;
  });
  const [generating, setGenerating] = useState(false);
  const { generate: generateSql } = useGenerateTechnicalRule();

  useEffect(() => { setEditingSection(null); setSectionSnapshot(null); setSqlDraft(null); }, [structureId, rowIndex]);

  const table = tables.find((t) => t.structureId === structureId) ?? tables[0];
  const rows = table?.rows ?? [];
  const row = rows[rowIndex] ?? {};
  const groups = useMemo(() => sectionGroups(columns), [columns]);
  const transformComplexity = classifyTransform(row.TECHNICAL_RULE ?? '');
  const filteredRows = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    const indexed = rows.map((r, i) => ({ r, i }));
    if (!q) return indexed;
    return indexed.filter(({ r, i }) => rowLabelOf(r, i).toLowerCase().includes(q) || (r.TGT_FIELD ?? '').toLowerCase().includes(q));
  }, [rows, fieldSearch]);
  const openTodos = notes.filter((n) => isActionable(n.tag) && !n.resolved && !n.parentId).length;
  // `notes` is every note on this row, replies included. Split them so a reply appears under the
  // point it answers instead of alongside it.
  const topLevelNotes = useMemo(() => notes.filter((n) => !n.parentId), [notes]);


  const runGenerateSql = async () => {
    setGenerating(true);
    setSqlDraft(null);
    try {
      setSqlDraft(await generateSql(row, table));
    } catch (err: any) {
      setSqlDraft({ ok: false, reason: err?.message ?? 'Could not reach the AI.' });
    } finally {
      setGenerating(false);
    }
  };

  const submitNote = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await onAddNote(draftTag, draft.trim());
      setDraft('');
    } finally {
      setPosting(false);
    }
  };

  if (!table) return <p className="text-sm2 text-muted py-8 text-center">No structure data on this version.</p>;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Uncommitted cell text, or an AI-drafted rule nobody has accepted yet. Both are real work
          that only exists in this component until someone commits it. */}
      <UnsavedChangesGuard
        when={hasUnsaved}
        what={sqlDraft && dirtyFields.size === 0 ? 'The drafted SQL' : 'Your edits to this field'}
      />
      {gateDialog}
      <div className="flex items-center gap-2.5 mb-2.5 shrink-0 flex-wrap">
        {/* The only way out of this view, so it's a real button rather than the 10.5px muted link
            it used to be — at that weight people arriving from a review point couldn't find the way
            back to it. Escape is taken: it closes the whole dialog. */}
        <Button variant="secondary" size="sm" onClick={gate(onBack)}>
          <ChevronLeft size={14} /> {backLabel}
        </Button>
        <Tag variant="table">{table.structureIdent}</Tag>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-2xs text-muted tabular-nums">Field {rowIndex + 1} of {rows.length}</span>
          <button onClick={gate(() => onOpen(structureId, Math.max(0, rowIndex - 1)))} disabled={rowIndex === 0} aria-label="Previous field" className="p-1.5 rounded hover:bg-blue-pale disabled:opacity-30 text-muted hover:text-blue">
            <ChevronLeft size={15} />
          </button>
          <button onClick={gate(() => onOpen(structureId, Math.min(rows.length - 1, rowIndex + 1)))} disabled={rowIndex >= rows.length - 1} aria-label="Next field" className="p-1.5 rounded hover:bg-blue-pale disabled:opacity-30 text-muted hover:text-blue">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-2.5">
        {listOpen ? (
          <div className="w-[250px] shrink-0 flex flex-col rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-line shrink-0">
              <span className="text-2xs font-bold uppercase tracking-[.04em] text-muted">Structure</span>
              <button onClick={() => setListOpen(false)} className="text-muted hover:text-text" aria-label="Collapse field list"><PanelLeftClose size={14} /></button>
            </div>
            <div className="px-2.5 py-2 border-b border-line shrink-0 flex flex-col gap-2">
              {/* A migration object can send several structures — switching here jumps to that
                  structure's first field rather than keeping a row index that may not exist in it. */}
              {/* Not `mono`: the option is an identifier plus a description and a count, and the
                  code face applied to the whole string set the prose in monospace too. */}
              <Select
                value={table.structureId} onChange={(e) => gate(() => onOpen(e.target.value, 0))()}
                className="w-full"
              >
                {tables.map((t) => (
                  <option key={t.structureId} value={t.structureId}>
                    {t.structureIdent}{t.structureDescription ? ` — ${t.structureDescription}` : ''} ({t.rows.length})
                  </option>
                ))}
              </Select>
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} placeholder="Find a field…"
                  className="w-full text-sm2 pl-6 pr-2 py-1.5 rounded-[8px] border border-line-strong bg-surface"
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {filteredRows.length === 0 && <p className="text-sm2 text-muted p-3 text-center">No fields match.</p>}
              {filteredRows.map(({ r, i }) => (
                <button
                  key={i} onClick={() => onOpen(structureId, i)}
                  className={clsx('w-full text-left px-2.5 py-1.5 border-b border-line last:border-b-0', i === rowIndex ? 'bg-blue-pale' : 'hover:bg-surface-2')}
                >
                  <div className={clsx('text-sm2 font-mono truncate', i === rowIndex ? 'text-blue-deep font-semibold' : 'text-text')}>{rowLabelOf(r, i)}</div>
                  {r.TGT_FIELD && <div className="text-sm2 text-muted font-mono truncate">→ {r.TGT_FIELD}</div>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button onClick={() => setListOpen(true)} className="shrink-0 self-start p-1.5 rounded hover:bg-blue-pale text-muted hover:text-blue" aria-label="Expand field list">
            <PanelLeftOpen size={16} />
          </button>
        )}

        <div className="flex-1 min-w-0 min-h-0 overflow-auto flex flex-col gap-2.5 pr-0.5">
          {groups.map((g) => {
            const c = colorByKey(g.color);
            return (
              <div key={g.sectionName} className="rounded-lg overflow-hidden shrink-0" style={{ boxShadow: `inset 0 0 0 1px ${c.border}` }}>
                <div className="px-3 py-1.5 text-2xs font-bold uppercase tracking-[.05em] flex items-center gap-2" style={{ backgroundColor: c.bg, color: c.text }}>
                  <span>{g.sectionName}</span>
                  {/* Only offered while this section is being edited, and only where the policy
                      actually wants SQL — a "generate" button on a COPY row would be inviting
                      someone to overwrite a correct notation rule with a statement. */}
                  {canEdit && onSaveField && (
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                      {editingSection === g.sectionName
                        && g.cols.some((col) => col.field === 'TECHNICAL_RULE')
                        && requiresSql(row.MAPPING_TYPE ?? '') && (
                        <Button
                          variant="ai" size="sm" onClick={runGenerateSql} disabled={generating}
                          title="Draft the SQL from the transformation rule"
                        >
                          <Sparkles size={13} /> {generating ? 'Drafting…' : 'Generate SQL'}
                        </Button>
                      )}
                      {editingSection === g.sectionName ? (
                        <>
                          <button
                            onClick={async () => {
                              const snapshot = sectionSnapshot;
                              setEditingSection(null); setSectionSnapshot(null); setSqlDraft(null);
                              setDirtyFields(new Set());
                              try {
                                if (!snapshot || !onSaveField) return;
                                // Every field in the snapshot, unconditionally. The previous version
                                // compared against `row` from this render's closure, which is the
                                // value from BEFORE any edit in this session — so the field just
                                // changed looked unchanged and was skipped, which is precisely the
                                // one that needed reverting. A write that matches what is already
                                // stored costs nothing: saveField drops a change whose from equals
                                // its to.
                                for (const [field, before] of Object.entries(snapshot)) {
                                  await onSaveField(table.structureId, rowIndex, field, before);
                                }
                              } finally {
                                cancellingRef.current = false;
                              }
                            }}
                            onMouseDown={() => { cancellingRef.current = true; }}
                            title="Discard this section's changes"
                            aria-label="Discard this section's changes"
                            className="p-0.5 rounded hover:bg-black/10"
                            style={{ color: c.text }}
                          >
                            <X size={13} />
                          </button>
                          <button
                            onClick={() => { setEditingSection(null); setSectionSnapshot(null); setSqlDraft(null); }}
                            title="Done editing this section"
                            aria-label="Done editing this section"
                            className="p-0.5 rounded hover:bg-black/10"
                            style={{ color: c.text }}
                          >
                            <Check size={13} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setSectionSnapshot(Object.fromEntries(g.cols.map((col) => [col.field, row[col.field] ?? ''])));
                            setEditingSection(g.sectionName);
                          }}
                          title="Edit this section"
                          aria-label="Edit this section"
                          className="p-0.5 rounded hover:bg-black/10"
                          style={{ color: c.text }}
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* The AI draft lands here as a PROPOSAL, above the fields it would change.
                    A refusal is displayed just as prominently as a success — being told the
                    requirement is too vague is the useful answer, not a failure to route around. */}
                {sqlDraft && editingSection === g.sectionName && g.cols.some((col) => col.field === 'TECHNICAL_RULE') && (
                  <div className={clsx('mx-3 mt-3 rounded-[8px] p-2.5', sqlDraft.ok ? 'bg-blue-pale' : 'bg-amber-bg')}>
                    {sqlDraft.ok ? (
                      <>
                        <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1">Suggested SQL</div>
                        <pre className="text-sm2 text-text whitespace-pre-wrap break-words font-mono mb-1.5">{sqlDraft.sql}</pre>
                        {sqlDraft.notes && <p className="text-2xs text-muted mb-1.5">{sqlDraft.notes}</p>}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary" size="sm"
                            onClick={async () => {
                              await onSaveField!(table.structureId, rowIndex, 'TECHNICAL_RULE', sqlDraft.sql);
                              setSqlDraft(null);
                            }}
                          >
                            Use this
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setSqlDraft(null)}>Discard</Button>
                          <span className="text-2xs text-muted ml-auto">Check it against the requirement before accepting.</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 mb-1">
                          <AlertTriangle size={13} className="text-amber-ink shrink-0" />
                          <span className="text-2xs font-bold uppercase tracking-[.04em] text-amber-ink">Rule isn't specific enough</span>
                        </div>
                        <p className="text-sm2 text-text mb-1.5">{sqlDraft.reason}</p>
                        <Button variant="ghost" size="sm" onClick={() => setSqlDraft(null)}>Dismiss</Button>
                      </>
                    )}
                  </div>
                )}
                <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-3">
                  {g.cols.map((col) => {
                    const finding = findings?.get(col.field);
                    return (
                      <div
                        key={col.field}
                        className={clsx(
                          'rounded-[6px]',
                          WIDE_FIELDS.has(col.field) && 'col-span-2',
                          NARROW_FIELDS.has(col.field) && 'max-w-[220px]',
                          finding && 'px-2 py-1.5 -mx-0.5',
                        )}
                        style={finding ? { backgroundColor: HIGHLIGHT_BG[finding.severity] } : undefined}
                        title={finding?.issue}
                      >
                        <div className="text-2xs font-bold uppercase tracking-[.03em] mb-0.5 flex items-center gap-1.5" style={{ color: finding ? undefined : c.text }}>
                          {col.field}
                          {/* Derived, never stored — see classifyTransform. Shown beside MAPPING_TYPE
                              rather than as its own field so it can't be mistaken for something
                              someone typed and might now be stale. */}
                          {col.field === 'MAPPING_TYPE' && row.MAPPING_TYPE?.trim().toUpperCase() === 'TRANSFORM' && (
                            <Tag variant={transformComplexity === 'Complex' ? 'warn' : 'neutral'} size="sm" title="Derived from the technical rule">
                              {transformComplexity}
                            </Tag>
                          )}
                        </div>
                        <EditableValue
                          value={row[col.field] ?? ''} wide={col.kind === 'longText' || WIDE_FIELDS.has(col.field)}
                          mono={MONO_FIELDS.has(col.field)}
                          kind={col.kind}
                          // The template's list wins; MAPPING_TYPE keeps its built-in one so a
                          // template that predates value lists still restricts the field that
                          // always needed it.
                          options={col.options?.length ? optionsOf(col) : col.field === 'MAPPING_TYPE' ? MAPPING_TYPE_VALUES : undefined}
                          editing={editingSection === g.sectionName}
                          onSave={(next) => onSaveField!(table.structureId, rowIndex, col.field, next)}
                          onDirtyChange={(d) => markDirty(col.field, d)}
                          isCancelling={() => cancellingRef.current}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {reviewOpen ? (
          <div className="w-[300px] shrink-0 flex flex-col rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-line shrink-0">
              <span className="text-2xs font-bold uppercase tracking-[.04em] text-muted">Review points</span>
              <div className="flex items-center gap-1.5">
                {openTodos > 0 && <Tag variant="warn">{openTodos} open</Tag>}
                <button onClick={() => setReviewOpen(false)} className="text-muted hover:text-text" aria-label="Collapse review points"><PanelRightClose size={14} /></button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-2 p-2.5">
              {findings && findings.size > 0 && (
                <div className="flex flex-col gap-1.5">
                  {[...findings.entries()].map(([field, f]) => (
                    <div key={field} className="rounded-[8px] p-2" style={{ backgroundColor: HIGHLIGHT_BG[f.severity] }}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Tag variant={f.severity === 'error' ? 'danger' : 'warn'}>{f.severity}</Tag>
                        <span className="text-2xs font-mono font-bold text-text">{field}</span>
                      </div>
                      <p className="text-sm2 text-text">{f.issue}</p>
                    </div>
                  ))}
                </div>
              )}
              {notes.length === 0 && (!findings || findings.size === 0) && (
                <p className="text-sm2 text-muted text-center py-6">No review points on this field yet.</p>
              )}
              {/* The same ReviewPointThread the Versions & Review tab renders, in `compact`.
                  This panel used to hand-roll its own version of a review point, and the copy had
                  drifted: no Done/Archived tag (so a closed point was only dimmed), no reply
                  thread, and a smaller body face. Worse, `notes` carries replies as well as
                  points, so every reply rendered here as a top-level point of its own. */}
              {topLevelNotes.map((n) => (
                <ReviewPointThread
                  key={n.id} point={n} allNotes={notes} compact
                  onReply={onReply} onToggleResolved={onToggleResolved}
                />
              ))}
            </div>
            <div className="border-t border-line p-2.5 shrink-0">
              {canAddNote ? (
                <div className="flex flex-col gap-1.5">
                  <Segmented
                    options={REVIEW_POINT_CATEGORIES.map((c) => ({ value: c.key, label: c.label, title: c.hint }))}
                    value={draftTag as (typeof REVIEW_POINT_CATEGORIES)[number]['key']}
                    onChange={(v) => setDraftTag(v)}
                  />
                  <div className="flex items-end gap-1.5">
                    <textarea
                      value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Add a review point…"
                      className="flex-1 text-sm2 bg-surface border border-line-strong rounded-[8px] px-2 py-1.5 resize-none"
                    />
                    <Button variant="primary" size="sm" onClick={submitNote} disabled={posting || !draft.trim()} aria-label="Post note">
                      <Send size={13} />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm2 text-muted text-center">Only this FMD's owner can add notes.</p>
              )}
            </div>
          </div>
        ) : (
          <button onClick={() => setReviewOpen(true)} className="shrink-0 self-start p-1.5 rounded hover:bg-blue-pale text-muted hover:text-blue" aria-label="Expand review points">
            <PanelRightOpen size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

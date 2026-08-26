import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../components/Select';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Segmented';
import clsx from 'clsx';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pencil, Search, Send, Sparkles } from 'lucide-react';
import { Tag } from '../../components/Tag';
import { colorByKey } from '../../lib/goldenFmdColors';
import { fmtDateTime } from '../../lib/format';
import { REVIEW_POINT_CATEGORIES, reviewPointCategory, isActionable } from '../../lib/reviewPointCategories';
import { classifyTransform, requiresSql, MAPPING_TYPE_VALUES } from '../../lib/mappingRulePolicy';
import { useGenerateTechnicalRule, type TechnicalRuleResult } from '../../lib/queries/technicalRule';
import type { FmdFieldNote, GeneratedColumn, GeneratedTable } from '../../types/entities';
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
function EditableValue({ value, wide, mono, options, editing, onSave }: {
  value: string; wide?: boolean;
  /** SQL and other code render monospaced in BOTH modes — a statement set in the body face is
   * harder to scan and stops looking like something you'd run. */
  mono?: boolean;
  /** A fixed value set (MAPPING_TYPE) becomes a select rather than a free-text box. Typing a
   * four-value enum by hand invites typos the policy then has to reject. */
  options?: readonly string[];
  editing: boolean; onSave: (next: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value); }, [value, editing]);

  const commit = async (next = draft) => {
    if (next === value) return;
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
      <Select
        size="sm" value={value} className="w-full"
        onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
      >
        {!options.includes(value) && <option value={value}>{value || '(not set)'}</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    );
  }
  const shared = {
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: () => commit(),
    className: clsx('w-full text-sm2 bg-surface border border-line-strong focus:border-blue rounded-[6px] px-1.5 py-1', mono && 'font-mono'),
  };
  return wide ? (
    <textarea
      {...shared} rows={4}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setDraft(value);
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
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
  columns, tables, structureId, rowIndex, onOpen, onBack,
  findings, notes, canAddNote, onAddNote, onToggleResolved, canEdit = false, onSaveField,
}: {
  columns: GeneratedColumn[];
  /** Every structure on this version — the picker's options, not just the open one. */
  tables: GeneratedTable[];
  structureId: string; rowIndex: number;
  /** Jump to any (structure, row) — used by the field list, the structure picker and prev/next. */
  onOpen: (structureId: string, rowIndex: number) => void;
  onBack: () => void;
  /** field -> finding, already resolved to this specific row by the caller. */
  findings?: Map<string, ReviewCellFinding>;
  /** Every note for this row (already filtered by structureId+rowKey by the caller). */
  notes: FmdFieldNote[];
  canAddNote: boolean;
  onAddNote: (tag: string, body: string) => Promise<void>;
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

  /** The AI draft is PROPOSED, never written straight into the row — a generated rule that is
   * subtly wrong is much harder to catch once it looks like something a person typed. */
  const [sqlDraft, setSqlDraft] = useState<TechnicalRuleResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const { generate: generateSql } = useGenerateTechnicalRule();

  useEffect(() => { setEditingSection(null); setSqlDraft(null); }, [structureId, rowIndex]);

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
  const openTodos = notes.filter((n) => isActionable(n.tag) && !n.resolved).length;

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
      <div className="flex items-center gap-2.5 mb-2.5 shrink-0 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1 text-2xs font-semibold text-muted hover:text-text px-2 py-1 rounded hover:bg-blue-pale">
          <ChevronLeft size={13} /> Back to table
        </button>
        <Tag variant="table">{table.structureIdent}</Tag>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-2xs text-muted tabular-nums">Field {rowIndex + 1} of {rows.length}</span>
          <button onClick={() => onOpen(structureId, Math.max(0, rowIndex - 1))} disabled={rowIndex === 0} aria-label="Previous field" className="p-1.5 rounded hover:bg-blue-pale disabled:opacity-30 text-muted hover:text-blue">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => onOpen(structureId, Math.min(rows.length - 1, rowIndex + 1))} disabled={rowIndex >= rows.length - 1} aria-label="Next field" className="p-1.5 rounded hover:bg-blue-pale disabled:opacity-30 text-muted hover:text-blue">
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
              <Select
                value={table.structureId} onChange={(e) => onOpen(e.target.value, 0)}
                className="w-full" mono
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
                      <button
                        onClick={() => setEditingSection((cur) => (cur === g.sectionName ? null : g.sectionName))}
                        title={editingSection === g.sectionName ? 'Done editing this section' : 'Edit this section'}
                        aria-label={editingSection === g.sectionName ? 'Done editing this section' : 'Edit this section'}
                        className="p-0.5 rounded hover:bg-black/10"
                        style={{ color: c.text }}
                      >
                        {editingSection === g.sectionName ? <Check size={13} /> : <Pencil size={12} />}
                      </button>
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
                          value={row[col.field] ?? ''} wide={WIDE_FIELDS.has(col.field)}
                          mono={MONO_FIELDS.has(col.field)}
                          options={col.field === 'MAPPING_TYPE' ? MAPPING_TYPE_VALUES : undefined}
                          editing={editingSection === g.sectionName}
                          onSave={(next) => onSaveField!(table.structureId, rowIndex, col.field, next)}
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
                <p className="text-sm2 text-muted text-center py-6">No review points or notes on this field yet.</p>
              )}
              {notes.map((n) => {
                const cat = reviewPointCategory(n.tag);
                return (
                  <div key={n.id} className={clsx('rounded-[8px] shadow-[inset_0_0_0_1px_var(--line)] p-2', n.resolved && 'opacity-50')}>
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <Tag variant={cat.variant}>{cat.label}</Tag>
                      {n.field && <Tag variant="column">{n.field}</Tag>}
                      <span className="text-2xs text-muted ml-auto shrink-0">{fmtDateTime(n.createdAt)}</span>
                    </div>
                    <p className="text-2xs text-text whitespace-pre-wrap mb-1">{n.body}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xs text-muted truncate">{n.createdBy}</span>
                      <button onClick={() => onToggleResolved(n.id, !n.resolved)} className="text-2xs font-semibold text-blue hover:underline ml-auto shrink-0">
                        {n.resolved ? 'Reopen' : cat.actionable ? 'Mark done' : 'Archive'}
                      </button>
                    </div>
                  </div>
                );
              })}
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
                      value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Add a note…"
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

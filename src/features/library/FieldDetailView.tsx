import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ListTodo, MessageSquare, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, Send } from 'lucide-react';
import { Tag } from '../../components/Tag';
import { colorByKey } from '../../lib/goldenFmdColors';
import { fmtDateTime } from '../../lib/format';
import type { FmdFieldNote, GeneratedColumn, GeneratedTable } from '../../types/entities';
import type { ReviewCellFinding } from './GeneratedFmdTableView';

const HIGHLIGHT_BG = { error: '#fecaca', warning: '#fed7aa' };
/** Free-text paragraph fields — given the full card width instead of a half-width column, the same
 * split GeneratedFmdTableView makes with FIELD_MAX_WIDTH. */
const WIDE_FIELDS = new Set(['TRANSFORMATION_RULE', 'TECHNICAL_RULE', 'SRC_FIELD_DESC', 'TGT_FIELD_DESC', 'COMMENTS']);

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
  findings, notes, canAddNote, onAddNote, onToggleResolved,
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
  onAddNote: (tag: 'note' | 'todo', body: string) => Promise<void>;
  onToggleResolved: (noteId: string, resolved: boolean) => Promise<void>;
}) {
  const [listOpen, setListOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(true);
  const [fieldSearch, setFieldSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [draftTag, setDraftTag] = useState<'note' | 'todo'>('note');
  const [posting, setPosting] = useState(false);

  const table = tables.find((t) => t.structureId === structureId) ?? tables[0];
  const rows = table?.rows ?? [];
  const row = rows[rowIndex] ?? {};
  const groups = useMemo(() => sectionGroups(columns), [columns]);
  const filteredRows = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    const indexed = rows.map((r, i) => ({ r, i }));
    if (!q) return indexed;
    return indexed.filter(({ r, i }) => rowLabelOf(r, i).toLowerCase().includes(q) || (r.TGT_FIELD ?? '').toLowerCase().includes(q));
  }, [rows, fieldSearch]);
  const openTodos = notes.filter((n) => n.tag === 'todo' && !n.resolved).length;

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

  if (!table) return <p className="text-sm text-muted py-8 text-center">No structure data on this version.</p>;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2.5 mb-2.5 shrink-0 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1 text-2xs font-semibold text-muted hover:text-text px-2 py-1 rounded hover:bg-blue-pale">
          <ChevronLeft size={13} /> Back to table
        </button>
        <Tag variant="table">{table.structureIdent}</Tag>
        <span className="text-md font-mono font-bold text-text">{rowLabelOf(row, rowIndex)}</span>
        {row.TGT_FIELD && row.SRC_FIELD && (
          <span className="text-2xs text-muted">→ <span className="font-mono font-semibold text-text">{row.TGT_FIELD}</span></span>
        )}
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
              <select
                value={table.structureId} onChange={(e) => onOpen(e.target.value, 0)}
                className="w-full text-sm2 font-mono px-2 py-1.5 rounded-[8px] border border-[#d6dbe2] bg-surface"
              >
                {tables.map((t) => (
                  <option key={t.structureId} value={t.structureId}>
                    {t.structureIdent}{t.structureDescription ? ` — ${t.structureDescription}` : ''} ({t.rows.length})
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} placeholder="Find a field…"
                  className="w-full text-2xs pl-6 pr-2 py-1.5 rounded-[8px] border border-[#d6dbe2] bg-surface"
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {filteredRows.length === 0 && <p className="text-2xs text-muted p-3 text-center">No fields match.</p>}
              {filteredRows.map(({ r, i }) => (
                <button
                  key={i} onClick={() => onOpen(structureId, i)}
                  className={clsx('w-full text-left px-2.5 py-1.5 border-b border-line last:border-b-0', i === rowIndex ? 'bg-blue-pale' : 'hover:bg-surface-2')}
                >
                  <div className={clsx('text-2xs font-mono truncate', i === rowIndex ? 'text-blue-deep font-bold' : 'text-text')}>{rowLabelOf(r, i)}</div>
                  {r.TGT_FIELD && <div className="text-2xs text-muted font-mono truncate">→ {r.TGT_FIELD}</div>}
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
                <div className="px-3 py-1.5 text-2xs font-bold uppercase tracking-[.05em]" style={{ backgroundColor: c.bg, color: c.text }}>
                  {g.sectionName}
                </div>
                <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-3">
                  {g.cols.map((col) => {
                    const finding = findings?.get(col.field);
                    return (
                      <div
                        key={col.field}
                        className={clsx('rounded-[6px]', WIDE_FIELDS.has(col.field) && 'col-span-2', finding && 'px-2 py-1.5 -mx-0.5')}
                        style={finding ? { backgroundColor: HIGHLIGHT_BG[finding.severity] } : undefined}
                        title={finding?.issue}
                      >
                        <div className="text-2xs font-bold uppercase tracking-[.03em] mb-0.5" style={{ color: finding ? undefined : c.text }}>
                          {col.field}
                        </div>
                        <div className="text-sm2 text-text whitespace-pre-wrap break-words">{row[col.field] || <span className="text-muted">—</span>}</div>
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
                      <p className="text-2xs text-text">{f.issue}</p>
                    </div>
                  ))}
                </div>
              )}
              {notes.length === 0 && (!findings || findings.size === 0) && (
                <p className="text-2xs text-muted text-center py-6">No review points or notes on this field yet.</p>
              )}
              {notes.map((n) => (
                <div key={n.id} className={clsx('rounded-[8px] shadow-[inset_0_0_0_1px_var(--line)] p-2', n.resolved && 'opacity-50')}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {n.tag === 'todo' ? <ListTodo size={11} className="text-amber-ink shrink-0" /> : <MessageSquare size={11} className="text-muted shrink-0" />}
                    <span className="text-2xs font-bold text-text truncate">{n.createdBy}</span>
                    <span className="text-2xs text-muted ml-auto shrink-0">{fmtDateTime(n.createdAt)}</span>
                  </div>
                  <p className="text-2xs text-text whitespace-pre-wrap mb-1.5">{n.body}</p>
                  {n.tag === 'todo' && (
                    <button onClick={() => onToggleResolved(n.id, !n.resolved)} className="text-2xs font-semibold text-blue hover:underline">
                      {n.resolved ? 'Reopen' : 'Mark done'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-line p-2.5 shrink-0">
              {canAddNote ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1">
                    <button onClick={() => setDraftTag('note')} className={clsx('flex-1 text-2xs font-semibold py-1 rounded', draftTag === 'note' ? 'bg-blue text-white' : 'bg-surface-2 text-muted')}>Note</button>
                    <button onClick={() => setDraftTag('todo')} className={clsx('flex-1 text-2xs font-semibold py-1 rounded', draftTag === 'todo' ? 'bg-blue text-white' : 'bg-surface-2 text-muted')}>To-do</button>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <textarea
                      value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Add a note…"
                      className="flex-1 text-2xs bg-surface border border-[#d6dbe2] rounded-[8px] px-2 py-1.5 resize-none"
                    />
                    <button onClick={submitNote} disabled={posting || !draft.trim()} aria-label="Post note" className="shrink-0 p-1.5 rounded-[8px] bg-blue text-white disabled:opacity-40">
                      <Send size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-2xs text-muted text-center">Only this FMD's owner can add notes.</p>
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

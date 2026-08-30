import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, ChevronLeft, ChevronRight, Columns3, Maximize2, Pencil, Type } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { useDismiss } from '../../components/useDismiss';
import { Button } from '../../components/Button';
import { optionsOf, valueTypeError } from '../../lib/mappingRulePolicy';
import { colorByKey } from '../../lib/goldenFmdColors';
import { rowKey } from '../../lib/rowDiff';
import type { GeneratedColumn, GeneratedTable } from '../../types/entities';

/** These fields carry free-text paragraphs, not short codes — capped width + wrapping so one long
 * rule/description doesn't stretch the whole table sideways; every other field stays a tight
 * single line. */
const FIELD_MAX_WIDTH: Record<string, number> = {
  TRANSFORMATION_RULE: 600, TECHNICAL_RULE: 600,
  SRC_FIELD_DESC: 400, TGT_FIELD_DESC: 400,
};

/** Floor on a column's width, so a cell cannot shrink below what its value needs.
 *
 * Only matters while EDITING, and that is exactly when it was wrong. A read-only cell is text: the
 * table sizes the column to it and `whitespace-nowrap` keeps it on one line. An editing cell is an
 * `<input>` at `w-full`, which has no intrinsic width to contribute — so the column collapsed to
 * whatever the header needed and the value inside was clipped mid-word. `BANKS` in a `SRC_FIELD`
 * column showed as `BANKS` with the expand affordance sitting on top of it.
 *
 * A floor rather than a fixed width: the column still grows for a long value, it just cannot fall
 * below a size that fits a normal one. And a floor rather than sizing the input to its content,
 * which would make every column jump as you type.
 *
 * TRANSFORMATION_RULE and TECHNICAL_RULE are deliberately absent. Their content is unbounded — a
 * technical rule can be a paragraph of SQL — so they wrap inside FIELD_MAX_WIDTH instead; giving
 * them a generous floor as well would push every column after them off the screen. */
const DEFAULT_MIN_WIDTH = 128;
const FIELD_MIN_WIDTH: Record<string, number> = {
  // SAP field and table names run to 30 characters.
  SRC_FIELD: 176, TGT_FIELD: 176, LOAD_FIELD: 176,
  SRC_TABLE: 152, TGT_TABLE: 152, LOAD_TABLE: 152,
  SRC_CHECK_TABLE: 168, TGT_CHECK_TABLE: 168,
  SRC_SYSTEM: 140, TGT_SYSTEM: 140,
  // Descriptions wrap (they carry a FIELD_MAX_WIDTH), but still need room to be worth reading.
  SRC_FIELD_DESC: 260, TGT_FIELD_DESC: 260,
  // Selects: the widest option plus the browser's arrow, which is not part of the text.
  // Both spellings: the Golden template ships this one with a space, and a programme that renames
  // it to the underscored form should not silently lose its width.
  MIGRATION_IN_SCOPE: 150, FIELD_CLASS: 150, 'FIELD CLASS': 150, MAPPING_TYPE: 168, LOAD_APPROACH: 168,
  SRC_FIELD_MANDATORY: 168, TGT_FIELD_MANDATORY: 168,
  SRC_FIELD_DATATYPE: 150, TGT_FIELD_DATATYPE: 150,
};

/** The floor for one column, or undefined for the free-text rules that must stay capped. */
const minWidthFor = (field: string): number | undefined =>
  field in FIELD_MAX_WIDTH && !(field in FIELD_MIN_WIDTH)
    ? undefined
    : FIELD_MIN_WIDTH[field] ?? DEFAULT_MIN_WIDTH;
const CHANGED_BG = '#fef9c3';
const REVIEW_ERROR_BG = '#fecaca';
const REVIEW_WARNING_BG = '#fed7aa';

function IconPopoverButton({ icon, label, active, children }: { icon: ReactNode; label: string; active?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)} aria-label={label}
        className={clsx('flex items-center justify-center w-8 h-8 rounded', active ? 'text-blue bg-blue-pale' : 'text-muted hover:text-blue hover:bg-blue-pale')}
      >
        {icon}
      </button>
      {open && <div className="absolute left-0 mt-1 min-w-[280px] bg-surface rounded shadow-cardHover p-3 z-20">{children}</div>}
    </div>
  );
}

/** Groups consecutive same-section columns into merged header-band spans, so the section a field
 * came from ("Source Section", "Mapping Section", ...) shows above the field-name row — matching
 * the Excel export's two-row header. */
function sectionRuns(columns: GeneratedColumn[]): { sectionName: string; color: string; span: number }[] {
  const runs: { sectionName: string; color: string; span: number }[] = [];
  for (const c of columns) {
    const last = runs[runs.length - 1];
    if (last && last.sectionName === c.sectionName) last.span += 1;
    else runs.push({ sectionName: c.sectionName, color: c.color, span: 1 });
  }
  return runs;
}

/** The excel-style grid for a Standard/Custom FMD generated from the Golden FMD — one tab per
 * source structure (arrow-paged, no scrollbar), a merged color band above the field-name header
 * row, and no filler for columns that were never populated. Shared by the plain Standard viewer
 * and the Custom FMD's version-history viewer. Export/download lives one level up, in the dialog's
 * tab bar, since it applies to the whole FMD version, not just this table. */
export interface ReviewCellFinding { severity: 'error' | 'warning'; issue: string }

/** Which columns the expanded editor applies to: free text only. Everything else is either a
 * fixed choice or a single token, and neither gains anything from a full-height textarea. */
const isExpandable = (column: GeneratedColumn) => !column.kind || column.kind === 'text' || column.kind === 'longText';

/** The full contents of one cell, in a dialog.
 *
 * A grid row is one line tall, so a transformation rule of five sentences is a cell you can type
 * into but never read — you scroll a 200px input with the keyboard to check what you wrote. This is
 * the same value with room to see it. Double-click is the way in, since single-click has to stay
 * free for moving between cells. */
function CellEditorDialog({ open, column, value, structureIdent, rowLabel, onSave, onClose }: {
  open: boolean;
  column?: GeneratedColumn;
  value: string;
  /** Which structure and which row — a full-screen dialog covers the grid that gave the cell its
   * context, so without these you are editing a value with no idea which of thirty rows it is. */
  structureIdent?: string;
  rowLabel?: string;
  onSave: (next: string) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(value); setError(null); }, [value, open]);

  const save = async () => {
    const problem = valueTypeError(column, draft);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try { await onSave(draft); onClose(); } finally { setSaving(false); }
  };

  return (
    <Dialog
      open={open} onClose={onClose} size="lg"
      title={column?.field ?? 'Cell'}
      subtitle={[structureIdent, rowLabel, column?.description].filter(Boolean).join('  ·  ') || undefined}
      unsavedWarning={draft !== value ? 'This cell has unsaved changes.' : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving || draft === value}>
            {saving ? 'Saving…' : 'Save to draft'}
          </Button>
        </>
      }
    >
      <UnsavedChangesGuard when={open && draft !== value} what="This cell" />
      <div className="flex flex-col gap-2">
        <textarea
          value={draft} onChange={(e) => { setDraft(e.target.value); setError(null); }} rows={16} autoFocus
          className={clsx(
            'w-full text-sm2 font-mono bg-surface border rounded px-3 py-2.5 resize-y',
            error ? 'border-red' : 'border-line-strong focus:border-blue',
          )}
        />
        {error && <p className="text-2xs text-red">{error}</p>}
        <p className="text-2xs text-muted">
          Saving puts this in the draft — nothing is published until you publish the version.
        </p>
      </div>
    </Dialog>
  );
}

/** One cell in edit mode.
 *
 * A real input per cell rather than a single roving editor, so Tab moves between cells the way the
 * browser already knows how to and commit-on-blur falls out of that for free — which is what "like
 * Excel" actually means in practice. Escape puts the original value back.
 *
 * The column's declared kind picks the control, so a value list is a dropdown here exactly as it is
 * in the field-level view, and a bad value is refused at the keystroke rather than found later by
 * the review. */
function GridCell({ column, value, onSave }: {
  column: GeneratedColumn;
  value: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(value); setError(null); }, [value]);

  const commit = async (next: string) => {
    if (next === value) return;
    const problem = valueTypeError(column, next);
    if (problem) { setError(problem); setDraft(value); return; }
    setError(null);
    await onSave(next);
  };

  const base = 'w-full bg-transparent px-1 py-0.5 text-sm2 rounded-xs focus:outline-none focus:bg-surface focus:shadow-[inset_0_0_0_2px_var(--blue)]';

  const listed = optionsOf(column);
  if (column.kind === 'select' && listed.length) {
    return (
      <select
        value={value}
        onChange={(e) => commit(e.target.value)}
        className={clsx(base, 'cursor-pointer')}
        title={error ?? undefined}
      >
        <option value="">—</option>
        {value && !listed.includes(value) && <option value={value}>{value}</option>}
        {listed.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (column.kind === 'boolean') {
    const on = /^(x|y|yes|true|1)$/i.test(value.trim());
    return (
      <input
        type="checkbox" checked={on}
        onChange={(e) => commit(e.target.checked ? 'X' : '')}
        className="w-3.5 h-3.5 accent-[var(--blue)]"
      />
    );
  }
  return (
    <input
      value={draft}
      {...(column.kind === 'integer' || column.kind === 'decimal'
        ? { type: 'number' as const, step: column.kind === 'integer' ? 1 : 'any' }
        : {})}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { setDraft(value); setError(null); (e.target as HTMLInputElement).blur(); }
        // Enter commits and stays put; Tab commits and moves on, which the browser does for us.
        if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
      }}
      title={error ?? undefined}
      className={clsx(base, error && 'shadow-[inset_0_0_0_2px_var(--red)]')}
    />
  );
}

export function GeneratedFmdTableView({ columns, tables, changedCellsByTable, reviewFindingsByTable, onOpenField, onAddReviewPoint, reviewPointCellsByTable, canEdit = false, onSaveField }: {
  columns: GeneratedColumn[]; tables: GeneratedTable[];
  /** structureId -> rowKey -> changed field names, vs. the previous version — yellow-highlights
   * exactly the cells that changed since then. Undefined/absent means "nothing to compare against
   * (first version)", not "nothing changed". */
  changedCellsByTable?: Map<string, Map<string, Set<string>>>;
  /** structureId -> rowKey -> field -> Mapping Review finding — red/orange-highlights the exact
   * cell a review flagged, with the finding text as a hover tooltip. Takes visual priority over
   * the "changed" yellow when both apply to the same cell. */
  reviewFindingsByTable?: Map<string, Map<string, Map<string, ReviewCellFinding>>>;
  /** Double-clicking a row opens the field-level drill-down for it (its index within the active
   * table's own row order, not the sorted display order). Double-click rather than a per-row icon
   * button: the button cost a whole leading column on every row to expose an action people use
   * occasionally, on a grid that is already very wide. */
  onOpenField?: (structureId: string, rowIndex: number) => void;
  /** Whether inline editing may be switched on — the same gate as the field-level view's per-section
   * pencil: the newest content of a Custom FMD, by someone allowed to change it. */
  canEdit?: boolean;
  /** Saves one cell. Every save lands in the draft; editing never publishes anything. */
  onSaveField?: (structureId: string, rowIndex: number, field: string, value: string) => Promise<void>;
  /** When provided, right-clicking a cell raises a review point against that exact cell — the
   * in-app stand-in for commenting on a cell in the Excel FMD. Right-click rather than a hover
   * affordance because every cell would otherwise need one, on a grid that is already dense. */
  onAddReviewPoint?: (structureId: string, rowIndex: number, field: string) => void;
  /** structureId -> rowKey -> fields that already carry a review point, for the corner marker. */
  reviewPointCellsByTable?: Map<string, Map<string, Set<string>>>;
}) {
  const [activeTableId, setActiveTableId] = useState<string | null>(tables[0]?.structureId ?? null);
  const [tabLabelMode, setTabLabelMode] = useState<'ident' | 'description'>('ident');
  const [sortField, setSortField] = useState<string | null>(null);
  /** Measured height of the section band, used as the field-name row's sticky offset so the two
   * stay welded together while scrolling. Observed rather than computed: the band's height depends
   * on the type scale and the browser's own rounding, and a hardcoded guess showed a strip of page
   * between the rows. */
  const bandRef = useRef<HTMLTableRowElement>(null);
  const [bandHeight, setBandHeight] = useState(0);
  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    const measure = () => setBandHeight(el.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  /** Off by default, exactly like the field-level view's sections. A grid you can change by clicking
   * into it is a grid you can change by accident, so the mode makes the intent explicit and leaves
   * read-only as the resting state. */
  const [editing, setEditing] = useState(false);
  /** Which cell is open in the expanded editor, by row index and field. */
  const [expandedCell, setExpandedCell] = useState<{ rowIndex: number; field: string } | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  /** Identity of the DOCUMENT, not of the array holding it.
   *
   * This effect resets the view when you open a different FMD. It used to depend on `tables`, which
   * is rebuilt from the version's JSON on every fetch — so saving a single cell produced a new array
   * with identical contents, the effect fired, and the open structure tab snapped back to the first
   * one. Editing three fields in S_ROLES meant being thrown back to S_CUST_GEN three times.
   *
   * The set of structure ids is stable across edits and changes only when a genuinely different
   * document (or one with different structures) is loaded, which is exactly when a reset is wanted. */
  const structureKey = tables.map((t) => t.structureId).join('|');

  useEffect(() => {
    // Keep the open tab if it still exists — switching version keeps you where you were reading.
    setActiveTableId((cur) => (
      cur && tables.some((t) => t.structureId === cur) ? cur : tables[0]?.structureId ?? null
    ));
    setSortField(null); setSortDir('asc'); setHiddenColumns(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  const updateTabScrollState = () => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };
  useEffect(() => { updateTabScrollState(); }, [tables]);
  const scrollTabs = (dir: 'left' | 'right') => {
    tabsRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' });
    setTimeout(updateTabScrollState, 300);
  };

  const activeTable = tables.find((t) => t.structureId === activeTableId) ?? tables[0];
  const visibleColumns = useMemo(() => columns.filter((c) => !hiddenColumns.has(c.field)), [columns, hiddenColumns]);
  const runs = useMemo(() => sectionRuns(visibleColumns), [visibleColumns]);
  /** All columns grouped by section — for the field picker, which must list hidden fields too and
   * so can't reuse the visible-only `runs`. */
  const columnGroups = useMemo(() => {
    const groups: { sectionName: string; color: string; cols: GeneratedColumn[] }[] = [];
    for (const c of columns) {
      const last = groups[groups.length - 1];
      if (last && last.sectionName === c.sectionName) last.cols.push(c);
      else groups.push({ sectionName: c.sectionName, color: c.color, cols: [c] });
    }
    return groups;
  }, [columns]);
  const changedCells = changedCellsByTable?.get(activeTable?.structureId ?? '');
  const reviewFindings = reviewFindingsByTable?.get(activeTable?.structureId ?? '');
  const reviewPointCells = reviewPointCellsByTable?.get(activeTable?.structureId ?? '');
  const processedRows = useMemo(() => {
    let rows = activeTable?.rows ?? [];
    if (sortField) {
      rows = [...rows].sort((a, b) => {
        const cmp = (a[sortField] ?? '').localeCompare(b[sortField] ?? '');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [activeTable, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField !== field) { setSortField(field); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortField(null); setSortDir('asc'); }
  };
  /** Whole-section toggle. Hiding everything would leave a grid with no columns and no obvious way
   * back, so the last visible section refuses to hide — the picker is still reachable, but an empty
   * table is never a state you can reach by accident. */
  const toggleSection = (fields: string[], allShown: boolean) => setHiddenColumns((s) => {
    const next = new Set(s);
    if (!allShown) { fields.forEach((f) => next.delete(f)); return next; }
    const wouldHideAll = columns.every((c) => fields.includes(c.field) || next.has(c.field));
    if (wouldHideAll) return s;
    fields.forEach((f) => next.add(f));
    return next;
  });
  const toggleColumn = (field: string) => setHiddenColumns((s) => {
    const next = new Set(s);
    if (next.has(field)) next.delete(field); else next.add(field);
    return next;
  });

  if (!activeTable) return <p className="text-sm2 text-muted py-8 text-center">No structure data on this version.</p>;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sort/columns controls, structure tabs and the tab-label toggle share ONE row. They used to
          occupy two stacked bands — the first nearly empty (two small icons at one end, a text link
          at the other) — which, above the section band and the field-name header, put five strips of
          chrome between the top of the dialog and the first row of data. */}
      <div className="flex items-center gap-1 border-b border-line mb-2 shrink-0">
        {/* Pencil to enter, CHECK to finish — the same pair the field-level view and the scope
            register use, so "this is being edited" reads the same everywhere in the app. It was an
            eye here, which meant "view" rather than "done" and made this the one edit toggle whose
            exit icon differed. Editing is a mode you enter, not a property of clicking; every save
            lands in the draft, so nothing publishes. */}
        {canEdit && onSaveField && (
          <button
            onClick={() => setEditing((v) => !v)}
            aria-label={editing ? 'Finish editing cells' : 'Edit cells'}
            aria-pressed={editing}
            title={editing
              ? 'Done. Your changes are already saved to the draft.'
              : 'Edit cells directly in the grid. Tab moves on and saves, Escape undoes the cell.'}
            className={clsx(
              'flex items-center justify-center w-8 h-8 rounded',
              editing ? 'text-blue bg-blue-pale' : 'text-muted hover:text-blue hover:bg-blue-pale',
            )}
          >
            {editing ? <Check size={15} /> : <Pencil size={14} />}
          </button>
        )}
        <IconPopoverButton icon={<Columns3 size={15} />} label="Fields to show" active={hiddenColumns.size > 0}>
          {/* Grouped by Golden section, matching the grid's own colour bands — a flat list of
              twenty-plus SRC_/TGT_/LOAD_ fields gives no way to find one except by reading every
              line, and no way to say "just the source side" in one action. */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xs font-bold uppercase tracking-[.04em] text-muted">Show fields</span>
            {hiddenColumns.size > 0 && (
              <button onClick={() => setHiddenColumns(new Set())} className="text-2xs font-semibold text-blue hover:underline ml-auto">
                Show all
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-auto flex flex-col gap-2 -mx-1 px-1">
            {columnGroups.map((g) => {
              const sc = colorByKey(g.color);
              const shown = g.cols.filter((c) => !hiddenColumns.has(c.field)).length;
              return (
                <div key={g.sectionName}>
                  {/* The section header is itself a checkbox: all-on when every field shows, and
                      toggling it flips the whole section rather than making you click each field. */}
                  <label
                    className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-2xs font-bold uppercase tracking-[.04em] sticky top-0"
                    style={{ backgroundColor: sc.bg, color: sc.text }}
                  >
                    <input
                      type="checkbox" className="w-3.5 h-3.5 accent-[var(--blue)]"
                      checked={shown === g.cols.length}
                      ref={(el) => { if (el) el.indeterminate = shown > 0 && shown < g.cols.length; }}
                      onChange={() => toggleSection(g.cols.map((c) => c.field), shown === g.cols.length)}
                    />
                    <span className="truncate">{g.sectionName}</span>
                    <span className="ml-auto font-normal normal-case tracking-normal">{shown}/{g.cols.length}</span>
                  </label>
                  <div className="flex flex-col gap-0.5 mt-0.5 pl-2">
                    {g.cols.map((c) => (
                      <label key={c.field} className="flex items-center gap-2 text-sm2 cursor-pointer py-0.5 hover:bg-surface-2 rounded px-1">
                        <input
                          type="checkbox" checked={!hiddenColumns.has(c.field)} onChange={() => toggleColumn(c.field)}
                          className="w-3.5 h-3.5 accent-[var(--blue)] shrink-0"
                        />
                        <span className="font-mono truncate">{c.field}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </IconPopoverButton>
        {tables.length > 1 && (
          <>
            {/* Grouped with sort/columns: all three change how the grid is displayed, so they read
                as one control cluster rather than one stranded at the far end of the tab strip. */}
            <button
              onClick={() => setTabLabelMode((m) => (m === 'ident' ? 'description' : 'ident'))}
              title={tabLabelMode === 'ident' ? 'Show structure names' : 'Show structure IDs'}
              aria-label={tabLabelMode === 'ident' ? 'Show structure names' : 'Show structure IDs'}
              className={clsx('flex items-center justify-center w-8 h-8 rounded shrink-0',
                tabLabelMode === 'description' ? 'text-blue bg-blue-pale' : 'text-muted hover:text-blue hover:bg-blue-pale')}
            >
              <Type size={15} />
            </button>
            <div className="w-px h-5 bg-line shrink-0 mx-1" aria-hidden />
            {canScrollLeft && (
              <button onClick={() => scrollTabs('left')} className="shrink-0 p-1 text-muted hover:text-blue" aria-label="Scroll tabs left">
                <ChevronLeft size={16} />
              </button>
            )}
            {/* `self-stretch items-end -mb-px` is what puts the active underline ON the toolbar's
                bottom border instead of floating above it.
                The tabs sat in an `items-center` wrapper, so they were centred against a row made
                taller by the 32px icon buttons beside them — and their own `-mb-px` was clipped by
                this wrapper's `overflow-hidden` before it could reach the row's border. The result
                was a tab that looked lifted, with a hairline gap under it. The overhang moves to
                the wrapper, which nothing clips; the tabs keep a plain `border-b-2` inside it. */}
            <div
              ref={tabsRef}
              onScroll={updateTabScrollState}
              className="flex items-end self-stretch -mb-px gap-1 flex-1 min-w-0 overflow-hidden"
            >
              {tables.map((t) => (
                <button
                  key={t.structureId} onClick={() => setActiveTableId(t.structureId)}
                  title={t.structureDescription || t.structureIdent}
                  className={clsx('px-2.5 py-1.5 text-sm2 border-b-2 whitespace-nowrap shrink-0', t.structureId === activeTable.structureId ? 'border-blue text-blue font-semibold' : 'border-transparent text-muted hover:text-text')}
                >
                  {tabLabelMode === 'ident' ? t.structureIdent : (t.structureDescription || t.structureIdent)}
                </button>
              ))}
            </div>
            {canScrollRight && (
              <button onClick={() => scrollTabs('right')} className="shrink-0 p-1 text-muted hover:text-blue" aria-label="Scroll tabs right">
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {/* border-separate + border-spacing-0 (NOT border-collapse): two stacked sticky <tr>s
            render with a visible white seam between them under border-collapse — a browser quirk
            with sticky table rows, not a real gap in the markup. border-separate removes it; the
            per-row divider moves from <tr> (unreliable under border-separate) onto each <td>.

            The field-name row's sticky offset is MEASURED from the band above it rather than
            hardcoded. A guessed 29px against a band that actually rendered ~26 left a strip of
            page showing between them the moment you scrolled — and any change to the band's
            padding, the type scale or the browser's rounding would have re-opened it. */}
        <table className="border-separate border-spacing-0 text-sm2">
          <thead>
            <tr ref={bandRef}>
              {runs.map((run, i) => (
                <th
                  key={i} colSpan={run.span}
                  className="text-2xs font-bold uppercase tracking-[.05em] px-2.5 py-1.5 sticky top-0 text-center whitespace-nowrap"
                  style={{ backgroundColor: colorByKey(run.color).band, color: colorByKey(run.color).bandText }}
                >
                  {run.sectionName}
                </th>
              ))}
            </tr>
            <tr>
              {visibleColumns.map((c) => (
                <th
                  key={c.field} onClick={() => toggleSort(c.field)}
                  className="text-2xs font-bold uppercase tracking-[.04em] text-text px-2.5 py-2 sticky text-center whitespace-nowrap cursor-pointer select-none z-[2]"
                  // The floor goes on the header as well as the cells: a table sizes a column from
                  // every cell in it, and a minimum set only on the body rows loses to a header that
                  // has already been measured.
                  style={{ backgroundColor: colorByKey(c.color).bg, top: bandHeight, minWidth: minWidthFor(c.field) }}
                >
                  {c.field}{sortField === c.field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processedRows.length === 0 && (
              <tr><td colSpan={visibleColumns.length} className="px-2.5 py-6 text-center text-muted text-sm2">No rows.</td></tr>
            )}
            {processedRows.map((row, i) => {
              const rk = rowKey(row, i);
              const rowChanges = changedCells?.get(rk);
              const rowFindings = reviewFindings?.get(rk);
              const rowPoints = reviewPointCells?.get(rk);
              const originalIndex = activeTable.rows.indexOf(row);
              return (
                <tr
                  key={i}
                  onDoubleClick={onOpenField && !editing ? () => onOpenField(activeTable.structureId, originalIndex) : undefined}
                  className={clsx(onOpenField && !editing && 'cursor-default select-none')}
                >
                  {visibleColumns.map((c) => {
                    const maxWidth = FIELD_MAX_WIDTH[c.field];
                    const finding = rowFindings?.get(c.field);
                    const isChanged = rowChanges?.has(c.field);
                    const bg = finding ? (finding.severity === 'error' ? REVIEW_ERROR_BG : REVIEW_WARNING_BG) : (isChanged ? CHANGED_BG : undefined);
                    const hasPoint = rowPoints?.has(c.field);
                    return (
                      <td
                        key={c.field}
                        title={finding?.issue ?? (onAddReviewPoint ? 'Right-click to add a review point' : undefined)}
                        onContextMenu={onAddReviewPoint ? (e) => {
                          e.preventDefault();
                          onAddReviewPoint(activeTable.structureId, originalIndex, c.field);
                        } : undefined}
                        className={clsx(
                          'px-2.5 py-1.5 text-sm2 border-t border-line-soft transition-colors',
                          !editing && 'hover:shadow-[inset_0_0_0_9999px_rgba(10,79,140,.08)] hover:text-blue-deep',
                          maxWidth ? 'whitespace-normal break-words text-left' : 'text-center whitespace-nowrap',
                          hasPoint && 'relative',
                        )}
                        style={{
                          ...(maxWidth ? { maxWidth } : {}),
                          minWidth: minWidthFor(c.field),
                          backgroundColor: bg,
                        }}
                      >
                        {editing && onSaveField ? (
                          <div
                            className="flex items-center gap-1 group/cell"
                            // Only free text gets the roomy editor. A dropdown, a checkbox or a
                            // number has nothing to expand — a modal around a three-item select is
                            // a dialog that wastes a click.
                            onDoubleClick={isExpandable(c) ? () => setExpandedCell({ rowIndex: originalIndex, field: c.field }) : undefined}
                          >
                            <GridCell
                              column={c} value={row[c.field] ?? ''}
                              onSave={(next) => onSaveField(activeTable.structureId, originalIndex, c.field, next)}
                            />
                            {isExpandable(c) && (
                              <button
                                onClick={() => setExpandedCell({ rowIndex: originalIndex, field: c.field })}
                                aria-label={`Open ${c.field} in a larger editor`}
                                title="Open in a larger editor (or double-click the cell)"
                                className="shrink-0 opacity-0 group-hover/cell:opacity-100 focus:opacity-100 text-muted hover:text-blue"
                              >
                                <Maximize2 size={11} />
                              </button>
                            )}
                          </div>
                        ) : row[c.field]}
                        {/* Folded-corner marker: this cell already carries a review point. */}
                        {hasPoint && (
                          <span
                            aria-label="Has a review point"
                            className="absolute top-0 right-0 w-0 h-0 border-t-[7px] border-l-[7px] border-t-blue border-l-transparent"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CellEditorDialog
        open={!!expandedCell}
        column={columns.find((c) => c.field === expandedCell?.field)}
        value={expandedCell ? activeTable?.rows[expandedCell.rowIndex]?.[expandedCell.field] ?? '' : ''}
        structureIdent={activeTable?.structureIdent}
        rowLabel={expandedCell ? (() => {
          const r = activeTable?.rows[expandedCell.rowIndex];
          // The row's own identity, the same way every other surface labels it.
          return r?.SRC_FIELD || r?.TGT_FIELD || `Row ${expandedCell.rowIndex + 1}`;
        })() : undefined}
        onSave={async (next) => {
          if (expandedCell && onSaveField && activeTable) {
            await onSaveField(activeTable.structureId, expandedCell.rowIndex, expandedCell.field, next);
          }
        }}
        onClose={() => setExpandedCell(null)}
      />
    </div>
  );
}

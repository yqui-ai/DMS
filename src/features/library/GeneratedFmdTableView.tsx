import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Columns3, Type } from 'lucide-react';
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
const CHANGED_BG = '#fef9c3';
const REVIEW_ERROR_BG = '#fecaca';
const REVIEW_WARNING_BG = '#fed7aa';

function IconPopoverButton({ icon, label, active, children }: { icon: ReactNode; label: string; active?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)} aria-label={label}
        className={clsx('flex items-center justify-center w-8 h-8 rounded-[8px]', active ? 'text-blue bg-blue-pale' : 'text-muted hover:text-blue hover:bg-blue-pale')}
      >
        {icon}
      </button>
      {open && <div className="absolute left-0 mt-1 min-w-[280px] bg-surface rounded-[8px] shadow-cardHover p-3 z-20">{children}</div>}
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

export function GeneratedFmdTableView({ columns, tables, changedCellsByTable, reviewFindingsByTable, onOpenField, onAddReviewPoint, reviewPointCellsByTable }: {
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
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    setActiveTableId(tables[0]?.structureId ?? null);
    setSortField(null); setSortDir('asc'); setHiddenColumns(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);

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
                    className="flex items-center gap-2 px-2 py-1 rounded-[6px] cursor-pointer text-2xs font-bold uppercase tracking-[.04em] sticky top-0"
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
              className={clsx('flex items-center justify-center w-8 h-8 rounded-[8px] shrink-0',
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
            <div ref={tabsRef} onScroll={updateTabScrollState} className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
              {tables.map((t) => (
                <button
                  key={t.structureId} onClick={() => setActiveTableId(t.structureId)}
                  title={t.structureDescription || t.structureIdent}
                  className={clsx('px-2.5 py-1.5 text-sm2 border-b-2 -mb-px whitespace-nowrap shrink-0', t.structureId === activeTable.structureId ? 'border-blue text-blue font-semibold' : 'border-transparent text-muted hover:text-text')}
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
            (the section band at top-0, the field-name row at top-[29px]) render with a visible
            white seam between them under border-collapse — a browser quirk with sticky table rows,
            not a real gap in the markup. border-separate removes it; the per-row divider moves from
            <tr> (unreliable under border-separate) onto each <td> instead. */}
        <table className="border-separate border-spacing-0 text-sm2">
          <thead>
            <tr>
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
                  className="text-2xs font-bold uppercase tracking-[.04em] text-text px-2.5 py-2 sticky top-[29px] text-center whitespace-nowrap cursor-pointer select-none z-[2]"
                  style={{ backgroundColor: colorByKey(c.color).bg }}
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
                  onDoubleClick={onOpenField ? () => onOpenField(activeTable.structureId, originalIndex) : undefined}
                  className={clsx(onOpenField && 'cursor-default select-none')}
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
                          'hover:shadow-[inset_0_0_0_9999px_rgba(10,79,140,.08)] hover:text-blue-deep',
                          maxWidth ? 'whitespace-normal break-words text-left' : 'text-center whitespace-nowrap',
                          hasPoint && 'relative',
                        )}
                        style={{ ...(maxWidth ? { maxWidth } : {}), backgroundColor: bg }}
                      >
                        {row[c.field]}
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
    </div>
  );
}

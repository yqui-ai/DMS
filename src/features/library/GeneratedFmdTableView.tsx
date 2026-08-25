import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Maximize2 } from 'lucide-react';
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
      {open && <div className="absolute left-0 mt-1 min-w-[220px] bg-surface rounded-[8px] shadow-cardHover p-3 z-20">{children}</div>}
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

export function GeneratedFmdTableView({ columns, tables, changedCellsByTable, reviewFindingsByTable, onOpenField }: {
  columns: GeneratedColumn[]; tables: GeneratedTable[];
  /** structureId -> rowKey -> changed field names, vs. the previous version — yellow-highlights
   * exactly the cells that changed since then. Undefined/absent means "nothing to compare against
   * (first version)", not "nothing changed". */
  changedCellsByTable?: Map<string, Map<string, Set<string>>>;
  /** structureId -> rowKey -> field -> Mapping Review finding — red/orange-highlights the exact
   * cell a review flagged, with the finding text as a hover tooltip. Takes visual priority over
   * the "changed" yellow when both apply to the same cell. */
  reviewFindingsByTable?: Map<string, Map<string, Map<string, ReviewCellFinding>>>;
  /** When provided, every row gets a "view details" action opening the field-level drill-down for
   * that row (its index within the active table's own row order, not the sorted display order). */
  onOpenField?: (structureId: string, rowIndex: number) => void;
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
  const changedCells = changedCellsByTable?.get(activeTable?.structureId ?? '');
  const reviewFindings = reviewFindingsByTable?.get(activeTable?.structureId ?? '');
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
  const toggleColumn = (field: string) => setHiddenColumns((s) => {
    const next = new Set(s);
    if (next.has(field)) next.delete(field); else next.add(field);
    return next;
  });

  if (!activeTable) return <p className="text-sm text-muted py-8 text-center">No structure data on this version.</p>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 mb-2 shrink-0">
        <IconPopoverButton icon={<ArrowUpDown size={15} />} label="Sort" active={!!sortField}>
          <label className="block text-2xs font-semibold text-muted mb-1">Sort by</label>
          <select
            value={sortField ?? ''} onChange={(e) => { setSortField(e.target.value || null); setSortDir('asc'); }}
            className="w-full text-sm2 px-2.5 py-1.5 rounded-[8px] border border-[#d6dbe2] bg-surface mb-2"
          >
            <option value="">None</option>
            {columns.map((c) => <option key={c.field} value={c.field}>{c.field}</option>)}
          </select>
          {sortField && (
            <div className="flex gap-1.5">
              <button onClick={() => setSortDir('asc')} className={clsx('flex-1 text-2xs font-semibold py-1 rounded', sortDir === 'asc' ? 'bg-blue text-white' : 'bg-surface-2 text-text')}>Asc</button>
              <button onClick={() => setSortDir('desc')} className={clsx('flex-1 text-2xs font-semibold py-1 rounded', sortDir === 'desc' ? 'bg-blue text-white' : 'bg-surface-2 text-text')}>Desc</button>
            </div>
          )}
        </IconPopoverButton>
        <IconPopoverButton icon={<Columns3 size={15} />} label="Fields to show" active={hiddenColumns.size > 0}>
          <label className="block text-2xs font-semibold text-muted mb-1.5">Show fields</label>
          <div className="max-h-56 overflow-auto flex flex-col gap-1">
            {columns.map((c) => (
              <label key={c.field} className="flex items-center gap-2 text-sm2 cursor-pointer">
                <input type="checkbox" checked={!hiddenColumns.has(c.field)} onChange={() => toggleColumn(c.field)} className="w-3.5 h-3.5 accent-[var(--blue)]" />
                {c.field}
              </label>
            ))}
          </div>
        </IconPopoverButton>
        {tables.length > 1 && (
          <button onClick={() => setTabLabelMode((m) => (m === 'ident' ? 'description' : 'ident'))} className="ml-auto text-sm2 font-semibold text-blue hover:underline">
            {tabLabelMode === 'ident' ? 'Show structure name' : 'Show structure ID'}
          </button>
        )}
      </div>

      {tables.length > 1 && (
        <div className="flex items-center gap-1 border-b border-line mb-3 shrink-0">
          {canScrollLeft && (
            <button onClick={() => scrollTabs('left')} className="shrink-0 p-1 text-muted hover:text-blue" aria-label="Scroll tabs left">
              <ChevronLeft size={16} />
            </button>
          )}
          <div ref={tabsRef} onScroll={updateTabScrollState} className="flex items-center gap-1 flex-1 overflow-hidden">
            {tables.map((t) => (
              <button
                key={t.structureId} onClick={() => setActiveTableId(t.structureId)}
                className={clsx('px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap shrink-0', t.structureId === activeTable.structureId ? 'border-blue text-blue font-medium' : 'border-transparent text-muted hover:text-text')}
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
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
        {/* border-separate + border-spacing-0 (NOT border-collapse): two stacked sticky <tr>s
            (the section band at top-0, the field-name row at top-[29px]) render with a visible
            white seam between them under border-collapse — a browser quirk with sticky table rows,
            not a real gap in the markup. border-separate removes it; the per-row divider moves from
            <tr> (unreliable under border-separate) onto each <td> instead. */}
        <table className="border-separate border-spacing-0 text-sm2">
          <thead>
            <tr>
              {onOpenField && (
                <th rowSpan={2} className="sticky top-0 z-[2] bg-[#eef1f5] w-8" style={{ verticalAlign: 'middle' }} />
              )}
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
              <tr><td colSpan={visibleColumns.length + (onOpenField ? 1 : 0)} className="px-2.5 py-6 text-center text-muted text-sm">No rows.</td></tr>
            )}
            {processedRows.map((row, i) => {
              const rk = rowKey(row, i);
              const rowChanges = changedCells?.get(rk);
              const rowFindings = reviewFindings?.get(rk);
              const originalIndex = activeTable.rows.indexOf(row);
              return (
                <tr key={i}>
                  {onOpenField && (
                    <td className="border-t border-line px-1.5 py-1.5 text-center">
                      <button
                        onClick={() => onOpenField(activeTable.structureId, originalIndex)}
                        aria-label="View field details"
                        className="p-1 rounded text-muted hover:text-blue hover:bg-blue-pale"
                      >
                        <Maximize2 size={12} />
                      </button>
                    </td>
                  )}
                  {visibleColumns.map((c) => {
                    const maxWidth = FIELD_MAX_WIDTH[c.field];
                    const finding = rowFindings?.get(c.field);
                    const isChanged = rowChanges?.has(c.field);
                    const bg = finding ? (finding.severity === 'error' ? REVIEW_ERROR_BG : REVIEW_WARNING_BG) : (isChanged ? CHANGED_BG : undefined);
                    return (
                      <td
                        key={c.field}
                        title={finding?.issue}
                        className={clsx(
                          'px-2.5 py-1.5 text-sm2 border-t border-line',
                          maxWidth ? 'whitespace-normal break-words text-left' : 'text-center whitespace-nowrap',
                        )}
                        style={{ ...(maxWidth ? { maxWidth } : {}), backgroundColor: bg }}
                      >
                        {row[c.field]}
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

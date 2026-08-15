import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download, Upload, Wand2, X } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { ColorTag } from '../../components/ColorTag';
import { GoldenToggle } from '../../components/GoldenToggle';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { ToolbarButton } from '../../components/ToolbarButton';
import { ToolbarSearch } from '../../components/ToolbarSearch';
import { fmtDateTime } from '../../lib/format';
import { exportFmdsAsExcel } from '../../lib/fmdZipExport';
import { useLibraryFmds, type LibraryFmdRow } from '../../lib/queries/fmds';
import { useToast } from '../../components/Toast';
import { FmdViewerDialog } from './FmdViewerDialog';
import { GoldenFmdDesignerDialog } from './GoldenFmdDesignerDialog';
import { FmdVersionHistoryDialog } from './FmdVersionHistoryDialog';
import { HistoricalUploadDialog } from './HistoricalUploadDialog';
import { FmdStandardizerDialog } from './FmdStandardizerDialog';

const CLASS_OPTIONS = ['Global', 'Local'];
const TYPE_OPTIONS = ['Standard', 'Golden', 'Historical', 'Custom'];
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

type GroupBy = 'none' | 'type' | 'reference';
const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'type', label: 'Group by Type' },
  { value: 'reference', label: 'Group by Program/Project/Subproject' },
];

const isNew = (f: LibraryFmdRow) => !!f.createdAt && Date.now() - new Date(f.createdAt).getTime() < NEW_WINDOW_MS;
/** Golden and Custom FMDs open the full version-history viewer (Golden also gets Where-used);
 * Standard/Historical use the simpler version-strip viewer instead. */
const usesVersionHistory = (f: LibraryFmdRow) => f.type === 'Golden' || f.type === 'Custom';

export function LibraryFmds() {
  const { data: fmds = [], isLoading } = useLibraryFmds();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [openFmd, setOpenFmd] = useState<LibraryFmdRow | null>(null);
  const [openHistory, setOpenHistory] = useState<LibraryFmdRow | null>(null);
  const [goldenTarget, setGoldenTarget] = useState<LibraryFmdRow | 'new' | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [standardizerOpen, setStandardizerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [klass, setKlass] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fmds.filter((f) => {
      if (klass.length > 0 && !klass.includes(f.class)) return false;
      if (type.length > 0 && !type.includes(f.type)) return false;
      if (!q) return true;
      return f.name.toLowerCase().includes(q) || f.reference.toLowerCase().includes(q);
    });
  }, [fmds, query, klass, type]);

  const groups = useMemo((): { label: string | null; rows: LibraryFmdRow[] }[] => {
    if (groupBy === 'none') return [{ label: null, rows: filtered }];
    const by = new Map<string, LibraryFmdRow[]>();
    for (const f of filtered) {
      const key = groupBy === 'type' ? f.type : f.reference;
      const arr = by.get(key) ?? [];
      arr.push(f);
      by.set(key, arr);
    }
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, rows]) => ({ label, rows }));
  }, [filtered, groupBy]);

  const hasActiveFilters = query !== '' || klass.length > 0 || type.length > 0;
  const clearFilters = () => { setQuery(''); setKlass([]); setType([]); };

  const existingGolden = fmds.find((f) => f.type === 'Golden');
  /** Only one Golden FMD ever exists — the button edits it if present, otherwise starts one. */
  const openGoldenDesigner = () => setGoldenTarget(existingGolden ?? 'new');

  /** Deep link from a "View FMD" toast action (?open=<fmdId>) — opens the right viewer and clears
   * the param so a refresh doesn't reopen it. */
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || fmds.length === 0) return;
    const target = fmds.find((f) => f.id === openId);
    if (target) (usesVersionHistory(target) ? setOpenHistory : setOpenFmd)(target);
    setSearchParams((params) => { params.delete('open'); return params; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmds]);

  /** One selected FMD downloads directly; several are bundled into a .zip — each gets its own
   * real workbook (Golden's structure template, or a generated FMD's Overview + structure
   * sheets), not just a metadata list. */
  const exportSelected = async () => {
    setExporting(true);
    try {
      const { exported, skipped } = await exportFmdsAsExcel([...selected]);
      if (exported > 0) toast.success(`Exported ${exported} FMD${exported === 1 ? '' : 's'}${skipped.length ? ` (skipped ${skipped.length} with no data yet)` : ''}.`);
      else toast.error('None of the selected FMDs have exportable data yet.');
    } catch (err: any) {
      toast.error(err.message ?? 'Could not export the selected FMDs.');
    } finally {
      setExporting(false);
    }
  };

  const toggleGroupCollapsed = (label: string) => setCollapsedGroups((s) => {
    const next = new Set(s);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.id));
  const toggleSelectAll = () => setSelected((s) => {
    if (allFilteredSelected) return new Set([...s].filter((id) => !filtered.some((f) => f.id === id)));
    return new Set([...s, ...filtered.map((f) => f.id)]);
  });
  const toggleSelectGroup = (rows: LibraryFmdRow[]) => setSelected((s) => {
    const allSelected = rows.length > 0 && rows.every((f) => selected.has(f.id));
    if (allSelected) return new Set([...s].filter((id) => !rows.some((f) => f.id === id)));
    return new Set([...s, ...rows.map((f) => f.id)]);
  });
  const toggleSelectOne = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const columns: Column<LibraryFmdRow>[] = [
    {
      key: 'select', width: 36,
      header: <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 accent-[var(--blue)]" />,
      render: (f) => <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelectOne(f.id)} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 accent-[var(--blue)]" />,
    },
    { key: 'displayId', header: 'ID', width: 100, render: (f) => <span className="font-mono text-sm2">{f.displayId ?? '—'}</span>, sortValue: (f) => f.displayId },
    {
      key: 'name', header: 'Name', width: 260,
      render: (f) => (
        <span className="flex items-center gap-2">
          {f.name}
          {isNew(f) && <span className="inline-flex items-center text-2xs px-1.5 py-[1px] rounded-pill bg-amber-bg text-amber-ink">New</span>}
        </span>
      ),
      sortValue: (f) => f.name,
    },
    { key: 'class', header: 'Class', width: 90, render: (f) => <ColorTag colorKey={f.class}>{f.class}</ColorTag>, sortValue: (f) => f.class },
    { key: 'type', header: 'Type', width: 90, render: (f) => <ColorTag colorKey={f.type}>{f.type}</ColorTag>, sortValue: (f) => f.type },
    { key: 'reference', header: 'Reference', width: 150, render: (f) => <span className="font-mono text-sm2">{f.reference}</span>, sortValue: (f) => f.reference },
    { key: 'latestVersion', header: 'Version', width: 90, render: (f) => f.latestVersion ?? '—', sortValue: (f) => f.latestVersion },
    { key: 'createdBy', header: 'Created', width: 190, render: (f) => f.createdBy ? <span className="text-2xs text-muted">{f.createdBy} · {fmtDateTime(f.createdAt)}</span> : '—', sortValue: (f) => f.createdAt },
    { key: 'changedBy', header: 'Changed', width: 190, render: (f) => f.changedBy ? <span className="text-2xs text-muted">{f.changedBy} · {fmtDateTime(f.changedAt)}</span> : '—', sortValue: (f) => f.changedAt },
  ];

  return (
    <div>
      <PageHeader title="Field Mapping" description="Field mapping documents across every subproject you have access to." />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ToolbarSearch value={query} onChange={setQuery} placeholder="Search field mappings…" />
        <MultiSelectFilter label="Class" options={CLASS_OPTIONS} selected={klass} onChange={setKlass} />
        <MultiSelectFilter label="Type" options={TYPE_OPTIONS} selected={type} onChange={setType} />
        <select
          value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="text-sm px-2.5 py-1.5 rounded-[8px] border border-[#d6dbe2] bg-surface shrink-0"
        >
          {GROUP_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-red px-2 py-1.5 rounded-[8px] hover:bg-red-light shrink-0">
            <X size={13} /> Clear filters
          </button>
        )}
        <span className="text-sm text-muted ml-1 shrink-0">{filtered.length.toLocaleString()} FMDs{selected.size > 0 ? ` · ${selected.size} selected` : ''}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <ToolbarButton onClick={exportSelected} disabled={selected.size === 0 || exporting}>
            <Download size={14} /> {exporting ? 'Exporting…' : `Export to Excel${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </ToolbarButton>
          <ToolbarButton onClick={() => setUploadOpen(true)}><Upload size={14} /> Upload Historical FMD</ToolbarButton>
          <ToolbarButton onClick={() => setStandardizerOpen(true)}><Wand2 size={14} /> FMD Standardizer</ToolbarButton>
          <GoldenToggle onClick={openGoldenDesigner} label="Golden FMD" />
        </div>
      </div>
      {!isLoading && filtered.length === 0 ? (
        <EmptyState title="No FMDs yet" description="Field mapping documents created for any subproject, or a Golden FMD built via the designer, will list here." />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g, i) => {
            const collapsed = g.label !== null && collapsedGroups.has(g.label);
            const allGroupSelected = g.rows.length > 0 && g.rows.every((f) => selected.has(f.id));
            return (
              <div key={g.label ?? i}>
                {g.label !== null && (
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <button onClick={() => toggleGroupCollapsed(g.label!)} className="flex items-center gap-1.5 text-sm font-bold text-text">
                      {collapsed ? <ChevronRight size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                      {g.label}
                    </button>
                    <span className="text-2xs text-muted">{g.rows.length}</span>
                    <input
                      type="checkbox" checked={allGroupSelected} onChange={() => toggleSelectGroup(g.rows)}
                      className="w-3.5 h-3.5 accent-[var(--blue)] ml-1" aria-label={`Select all in ${g.label}`}
                    />
                  </div>
                )}
                {!collapsed && (
                  <Table
                    columns={columns} rows={g.rows} rowKey={(f) => f.id} pageSize={30} emptyMessage="Loading…"
                    onRowClick={(f) => (usesVersionHistory(f) ? setOpenHistory(f) : setOpenFmd(f))}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      <FmdViewerDialog fmd={openFmd} onClose={() => setOpenFmd(null)} />
      <FmdVersionHistoryDialog fmd={openHistory} onClose={() => setOpenHistory(null)} showWhereUsed={openHistory?.type === 'Golden'} />
      <GoldenFmdDesignerDialog target={goldenTarget} onClose={() => setGoldenTarget(null)} />
      <HistoricalUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <FmdStandardizerDialog open={standardizerOpen} onClose={() => setStandardizerOpen(false)} />
    </div>
  );
}

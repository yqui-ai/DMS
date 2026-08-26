import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../components/Select';
import { Button } from '../../components/Button';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download, Settings, Sparkles, X } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { ListEmptyState } from '../../components/ListEmptyState';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { ToolbarSearch } from '../../components/ToolbarSearch';
import { fmtDateTime } from '../../lib/format';
import { exportFmdsAsExcel } from '../../lib/fmdZipExport';
import { useLibraryFmds, type LibraryFmdRow } from '../../lib/queries/fmds';
import { markFmdSeen, isFmdSeen } from '../../lib/fmdSeen';
import { useToast } from '../../components/Toast';
import { GoldenFmdDesignerDialog } from './GoldenFmdDesignerDialog';
import { FmdVersionHistoryDialog } from './FmdVersionHistoryDialog';
import { ConvertHistoricalFmdWizard } from './ConvertHistoricalFmdWizard';

const CLASS_OPTIONS = ['Global', 'Local'];
const TYPE_OPTIONS = ['Standard', 'Golden', 'Custom'];
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

type GroupBy = 'none' | 'type' | 'reference';
const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'type', label: 'Group by Type' },
  { value: 'reference', label: 'Group by Program/Project/Subproject' },
];

/** Two recency flags, and a row shows at most one of them: "New" for an FMD that has only ever had
 * its first version, "New Version" once a later version goes live. They're deliberately exclusive —
 * an FMD can't simultaneously be new and have a newer version than the one it was created with.
 * "New" also clears as soon as the row is opened, rather than sitting until the window expires. */
const isRecent = (at?: string) => !!at && Date.now() - new Date(at).getTime() < NEW_WINDOW_MS;

/** The FMD itself is new — it has never had a second version, so there is nothing to call a "new
 * version" of. `changedAt` is only populated once a second version exists, which is exactly the
 * test for "this is still the original". */
const isNewFmd = (f: LibraryFmdRow) =>
  !f.changedAt && isRecent(f.createdAt) && !isFmdSeen(f.id, f.latestVersionId);

/** A later version of an existing FMD went live recently. Mutually exclusive with isNewFmd by
 * construction — an FMD that has never changed can't have published a *new* version — so a row
 * never carries both flags. */
const isNewVersion = (f: LibraryFmdRow) =>
  !!f.changedAt && isRecent(f.activePublishedAt);
export function LibraryFmds() {
  const { data: fmds = [], isLoading } = useLibraryFmds();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [openHistory, setOpenHistory] = useState<LibraryFmdRow | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [goldenTarget, setGoldenTarget] = useState<LibraryFmdRow | 'new' | null>(null);
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

  /** Opening a row is what dismisses its "New" badge, not just viewing the list. Every FMD type
   * uses the same full version-history viewer now — Versions and Where-used apply equally
   * to Golden, Standard and Custom alike, not just the AI-converted ones. */
  const openRow = (f: LibraryFmdRow) => {
    markFmdSeen(f.id, f.latestVersionId);
    setOpenHistory(f);
  };

  /** Deep link from a "View FMD" toast action (?open=<fmdId>) — opens the right viewer and clears
   * the param so a refresh doesn't reopen it. */
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || fmds.length === 0) return;
    const target = fmds.find((f) => f.id === openId);
    if (target) openRow(target);
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
      key: 'name', header: 'Name', width: 280,
      render: (f) => (
        <span className="flex items-center gap-2">
          <span className="truncate">{f.name}</span>
          {f.aiGenerated && (
            <span title="AI-converted" className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gradient-to-r from-[#3b82f6] to-[#a855f7] text-white">
              <Sparkles size={10} />
            </span>
          )}
          {/* One or the other, never both — see isNewFmd / isNewVersion. Same treatment because
              they mean the same kind of thing (something arrived recently); the label carries the
              distinction, so a second colour would only imply a difference in severity. */}
          {isNewFmd(f) && <Tag variant="success" size="sm" className="shrink-0">New</Tag>}
          {isNewVersion(f) && <Tag variant="success" size="sm" className="shrink-0">New Version</Tag>}
        </span>
      ),
      sortValue: (f) => f.name,
    },
    { key: 'class', header: 'Class', width: 90, render: (f) => f.class, sortValue: (f) => f.class },
    {
      key: 'type', header: 'Type', width: 90,
      render: (f) => f.type,
      sortValue: (f) => f.type,
    },
    { key: 'reference', header: 'Reference', width: 150, render: (f) => <span className="font-mono text-sm2">{f.reference}</span>, sortValue: (f) => f.reference },
    {
      // Just the number here — the Draft/Active badge lives in Status and repeating it made the two
      // columns say the same thing twice. Shows the live (published) version when there is one,
      // falling back to the latest draft for an FMD that has never been published.
      key: 'latestVersion', header: 'Version', width: 90,
      render: (f) => <span className="font-mono">{f.activeVersion ?? f.latestVersion ?? '—'}</span>,
      sortValue: (f) => f.activeVersion ?? f.latestVersion,
    },
    {
      // Active = a published version exists. Draft = everything so far is unreleased. When both are
      // true (published, with newer edits pending) the draft is what needs attention, so it wins.
      key: 'status', header: 'Status', width: 100,
      // Active is the resting state, so it carries no colour — a badge on every row is just noise.
      // Draft is the exception that needs picking out of a long list (unreleased work), so it keeps
      // a quiet red at the small size.
      render: (f) => f.hasDraft || !f.activeVersion
        ? <Tag variant="danger" size="sm">{f.hasDraft ? 'Draft' : (f.latestState ?? 'Draft')}</Tag>
        : <span className="text-muted">Active</span>,
      sortValue: (f) => (f.hasDraft ? 'Draft' : f.activeVersion ? 'Active' : f.latestState),
    },
    {
      key: 'goldenVersionLabel', header: 'Golden FMD Version', width: 150,
      render: (f) => f.goldenVersionLabel ? (
        <span className="inline-flex items-center gap-1.5 font-mono text-sm2">
          {f.goldenVersionLabel}{f.goldenOutdated && <Tag variant="warn" size="sm">Outdated</Tag>}
        </span>
      ) : '—',
      sortValue: (f) => f.goldenVersionLabel,
    },
    {
      key: 'standardRefVersionLabel', header: 'Reference FMD Version', width: 160,
      render: (f) => f.standardRefVersionLabel ? (
        <span className="inline-flex items-center gap-1.5 font-mono text-sm2">
          {f.standardRefVersionLabel}{f.standardRefOutdated && <Tag variant="warn" size="sm">Outdated</Tag>}
        </span>
      ) : '—',
      sortValue: (f) => f.standardRefVersionLabel,
    },
    {
      // Falls back to Created when an FMD hasn't been changed yet — a brand-new FMD's most recent
      // activity IS its creation, so the column shouldn't just read "—" until a second version exists.
      key: 'changedBy', header: 'Changed', width: 160,
      render: (f) => {
        const by = f.changedBy ?? f.createdBy;
        const at = f.changedAt ?? f.createdAt;
        return by ? (
          <div className="text-2xs leading-tight">
            <div className="font-semibold text-text truncate">{by}</div>
            <div className="text-muted">{fmtDateTime(at)}</div>
          </div>
        ) : '—';
      },
      sortValue: (f) => f.changedAt ?? f.createdAt,
    },
  ];

  return (
    <div>
      <PageHeader title="Field Mapping" description="Field mapping documents across every subproject you have access to." />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ToolbarSearch value={query} onChange={setQuery} placeholder="Search field mappings…" />
        <MultiSelectFilter label="Class" options={CLASS_OPTIONS} selected={klass} onChange={setKlass} />
        <MultiSelectFilter label="Type" options={TYPE_OPTIONS} selected={type} onChange={setType} />
        <Select
          value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          size="sm"
        >
          {GROUP_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </Select>
        {hasActiveFilters && (
          <Button variant="dangerGhost" size="sm" onClick={clearFilters}>
            <X size={13} /> Clear filters
          </Button>
        )}
        <span className="text-sm2 text-muted ml-1 shrink-0">{filtered.length.toLocaleString()} FMDs{selected.size > 0 ? ` · ${selected.size} selected` : ''}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button variant="quiet" size="sm" onClick={exportSelected} disabled={selected.size === 0 || exporting}>
            <Download size={14} /> {exporting ? 'Exporting…' : `Export to Excel${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </Button>
          <Button variant="quiet" size="sm" onClick={openGoldenDesigner}><Settings size={14} /> Golden FMD</Button>
          <Button variant="ai" size="sm" onClick={() => setWizardOpen(true)}><Sparkles size={14} /> Convert Historical FMD</Button>
        </div>
      </div>
      {!isLoading && filtered.length === 0 ? (
        <ListEmptyState
          noun="FMDs" filtered={hasActiveFilters} onClearFilters={clearFilters}
          description="Field mapping documents created for any subproject, or a Golden FMD built via the designer, will list here."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g, i) => {
            const collapsed = g.label !== null && collapsedGroups.has(g.label);
            const allGroupSelected = g.rows.length > 0 && g.rows.every((f) => selected.has(f.id));
            return (
              <div key={g.label ?? i}>
                {g.label !== null && (
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <button onClick={() => toggleGroupCollapsed(g.label!)} className="flex items-center gap-1.5 text-sm2 font-bold text-text">
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
                    onRowClick={openRow}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      <FmdVersionHistoryDialog fmd={openHistory} onClose={() => setOpenHistory(null)} />
      <GoldenFmdDesignerDialog target={goldenTarget} onClose={() => setGoldenTarget(null)} />
      <ConvertHistoricalFmdWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

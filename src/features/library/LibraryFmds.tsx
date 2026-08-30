import { useMemo, useState } from 'react';
import { Select } from '../../components/Select';
import { Button } from '../../components/Button';
import { Outlet, useNavigate } from 'react-router-dom';
import { Archive, ChevronDown, ChevronRight, Download, Settings, Sparkles } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { ListEmptyState } from '../../components/ListEmptyState';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { Toolbar } from '../../components/Toolbar';
import { Menu } from '../../components/Menu';
import { ArchiveDialog, type ArchiveTarget } from '../../components/ArchiveDialog';
import { fmtDateTime } from '../../lib/format';
import { exportFmdsAsExcel } from '../../lib/fmdZipExport';
import { useLibraryFmds, type LibraryFmdRow } from '../../lib/queries/fmds';
import { useFmdUsageCounts } from '../../lib/queries/scope';
import { useLibraryPath } from '../../lib/libraryNav';
/* Scope Register reads the same flags off the same rows — these live in one place so the two lists
   can't disagree about whether an FMD is outdated or new. This screen keeps its own layout (the
   recency flags sit by the name, the version and Draft tag in the Version column); only the rules
   are shared. */
import { isFmdOutdated, fmdOutdatedReason, isNewFmd, isNewVersion } from '../../components/FmdStatusTags';
import { useToast } from '../../components/Toast';
import { GoldenFmdDesignerDialog } from './GoldenFmdDesignerDialog';
import { ConvertHistoricalFmdWizard } from './ConvertHistoricalFmdWizard';

const CLASS_OPTIONS = ['Global', 'Local'];
const TYPE_OPTIONS = ['Standard', 'Golden', 'Custom'];

type GroupBy = 'none' | 'type' | 'reference';
/** Read as "Group: <value>", matching the filters beside it ("Class: All"). The old labels each
 * repeated the word "grouping" and the longest ran to 37 characters, which is what made the control
 * twice the width of everything else in the row. */
const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'Group: None' },
  { value: 'type', label: 'Group: Type' },
  { value: 'reference', label: 'Group: Scope' },
];

export function LibraryFmds() {
  const { data: fmds = [], isLoading } = useLibraryFmds();
  // One query for the whole list — see useFmdUsageCounts.
  const { data: usage = new Map() } = useFmdUsageCounts();
  const toast = useToast();
  const navigate = useNavigate();
  const to = useLibraryPath();
  const [exporting, setExporting] = useState(false);
  const [archiving, setArchiving] = useState<ArchiveTarget | null>(null);
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

  /** Every FMD type uses the same viewer — Versions and Where-used apply equally to Golden,
   * Standard and Custom alike, not just the AI-converted ones. The viewer lives at its own URL, so
   * opening a row is a navigation; dismissing the row's "New" badge happens there rather than here,
   * so a deep link dismisses it too. */
  const openRow = (f: LibraryFmdRow) => navigate(to('fmds', f.id));

  /** One selected FMD downloads directly; several are bundled into a .zip — each gets its own
   * real workbook (Golden's structure template, or a generated FMD's Overview + structure
   * sheets), not just a metadata list. */
  const exportSelected = async () => {
    setExporting(true);
    try {
      const { exported, skipped } = await exportFmdsAsExcel([...selected]);
      // Name the skipped FMDs rather than counting them: "skipped 3" leaves you to work out which
      // three out of ten, and the names are already collected. Capped so a large selection doesn't
      // produce a toast nobody can read.
      const skippedNote = skipped.length
        ? ` Skipped ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? ` and ${skipped.length - 3} more` : ''} — no data to export yet.`
        : '';
      if (exported > 0) toast.success(`Exported ${exported} FMD${exported === 1 ? '' : 's'}.${skippedNote}`);
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
          {/* The flag, not the number it's behind. "Needs re-syncing" is actionable in a list;
              "the template is on v1.0.2" is a detail you only need once you've opened it. */}
          {isFmdOutdated(f) && (
            <Tag variant="warn" size="sm" className="shrink-0" title={fmdOutdatedReason(f)}>
              Outdated
            </Tag>
          )}
        </span>
      ),
      sortValue: (f) => f.name,
    },
    { key: 'type', header: 'Type', width: 90, render: (f) => f.type, sortValue: (f) => f.type },
    {
      // Where it lives, by NAME. `reference` said the same thing in codes (PRG-PRJ), which nobody
      // reads at a glance — and the catalogue spans every subproject, so which one a row belongs to
      // is exactly the sort of thing you scan a list for.
      key: 'scope', header: 'Scope', width: 190,
      render: (f) => (f.subprojectName ? (
        <div className="text-2xs leading-tight">
          <div className="text-sm2 text-text truncate">{f.subprojectName}</div>
          <div className="text-muted truncate">{[f.programName, f.projectName].filter(Boolean).join(' › ') || '—'}</div>
        </div>
      ) : (
        <span className="text-muted">Program-wide</span>
      )),
      sortValue: (f) => f.subprojectName ?? '',
    },
    {
      // Version and status were two columns saying one thing. The number is the live (published)
      // version; the Draft tag beside it is the whole of what Status used to carry, and only
      // appears when there is unreleased work — Active is the resting state and needs no badge on
      // every row.
      key: 'latestVersion', header: 'Version', width: 130,
      render: (f) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono">{f.activeVersion ?? f.latestVersion ?? '—'}</span>
          {(f.hasDraft || !f.activeVersion) && <Tag variant="danger" size="sm">{f.hasDraft ? 'Draft' : (f.latestState ?? 'Draft')}</Tag>}
        </span>
      ),
      sortValue: (f) => f.activeVersion ?? f.latestVersion,
    },
    {
      /* The reuse signal, and the thing to read before changing a document.
       *
       * An FMD is assigned, not owned (0045) — several subprojects may point at the same one — so
       * "who else depends on this" is not answerable from the row itself. Counts distinct
       * subprojects and distinct objects, because either side can repeat: the same object in two
       * subprojects is two uses; the same subproject twice is not.
       *
       * Zero is shown as "Not in use" rather than "0", which reads as a measurement rather than an
       * absence — and for a Golden or Standard template, not being assigned is the normal state
       * rather than a problem. */
      key: 'usedBy', header: 'Used by', width: 150,
      sortValue: (f) => usage.get(f.id)?.subprojects ?? 0,
      render: (f) => {
        const u = usage.get(f.id);
        if (!u || u.subprojects === 0) return <span className="text-muted">Not in use</span>;
        return (
          <span className="inline-flex flex-col leading-tight">
            <span className="text-sm2">
              <span className="font-semibold tabular-nums">{u.subprojects}</span>
              {' '}subproject{u.subprojects === 1 ? '' : 's'}
            </span>
            <span className="text-2xs text-muted tabular-nums">
              {u.objects} object{u.objects === 1 ? '' : 's'}
            </span>
          </span>
        );
      },
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
    {
      key: 'actions', width: 44, header: '',
      render: (f) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Menu
            label={`Manage ${f.name}`}
            actions={[{
              key: 'archive',
              label: 'Archive FMD',
              icon: <Archive size={14} />,
              danger: true,
              // Disabled rather than hidden: the reason is the useful part, and it goes in the
              // tooltip via the label so a refused action explains itself.
              disabled: !!f.archiveBlockedReason,
              title: f.archiveBlockedReason,
              onSelect: () => f.programId && setArchiving({
                entityType: 'fmd', entityId: f.id, entityLabel: f.name, programId: f.programId,
              }),
            }]}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Field Mapping" description="Field mapping documents across every subproject you have access to." />
      <Toolbar
        search={{ value: query, onChange: setQuery, placeholder: 'Search field mappings…' }}
        onClearFilters={hasActiveFilters ? clearFilters : undefined}
        count={filtered.length} noun="FMDs" selectedCount={selected.size}
        actions={
          <>
            <Button variant="quiet" size="sm" onClick={exportSelected} disabled={selected.size === 0 || exporting}>
              <Download size={14} /> {exporting ? 'Exporting…' : `Export to Excel${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </Button>
            <Button variant="quiet" size="sm" onClick={openGoldenDesigner}><Settings size={14} /> Golden FMD</Button>
            <Button variant="ai" size="sm" onClick={() => setWizardOpen(true)}><Sparkles size={14} /> Convert Historical FMD</Button>
          </>
        }
      >
        <MultiSelectFilter label="Class" options={CLASS_OPTIONS} selected={klass} onChange={setKlass} />
        <MultiSelectFilter label="Type" options={TYPE_OPTIONS} selected={type} onChange={setType} />
        <Select
          value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          size="sm" quiet={groupBy === 'none'} aria-label="Group rows by"
        >
          {GROUP_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </Select>
      </Toolbar>
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
                    columns={columns} rows={g.rows} rowKey={(f) => f.id} pageSize={groupBy === 'none' ? 30 : 200} emptyMessage="Loading…"
                    onRowClick={openRow}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      <Outlet />
      <GoldenFmdDesignerDialog target={goldenTarget} onClose={() => setGoldenTarget(null)} />
      <ConvertHistoricalFmdWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <ArchiveDialog target={archiving} onClose={() => setArchiving(null)} />
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, Files, Network, X } from 'lucide-react';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { ColorTag } from '../../components/ColorTag';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { PageHeader } from '../../components/PageHeader';
import { ToolbarButton } from '../../components/ToolbarButton';
import { ToolbarSearch } from '../../components/ToolbarSearch';
import { useToast } from '../../components/Toast';
import { useMigrationObjects } from '../../lib/queries/scope';
import { useStandardFmdLinks } from '../../lib/queries/fmds';
import { componentMainGroup } from '../../lib/tagColor';
import { fmtApproach } from '../../lib/format';
import { GenerateFmdDialog } from './GenerateFmdDialog';
import { LibraryObjectDialog } from './LibraryObjectDialog';
import type { MigrationObject } from '../../types/entities';

const STATUS_OPTIONS = ['Deprecated', 'Unrestricted'];

export function LibraryObjects() {
  const toast = useToast();
  const navigate = useNavigate();
  const { data: allObjects = [], isLoading } = useMigrationObjects();
  const { data: standardFmdLinks = [] } = useStandardFmdLinks();
  const standardFmdByObject = useMemo(() => new Map(standardFmdLinks.map((l) => [l.migrationObjectId, l])), [standardFmdLinks]);
  const [query, setQuery] = useState('');
  const [klass, setKlass] = useState<string[]>([]);
  const [category, setCategory] = useState<string[]>([]);
  const [approach, setApproach] = useState<string[]>([]);
  const [component, setComponent] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [detailObject, setDetailObject] = useState<MigrationObject | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generateTargets, setGenerateTargets] = useState<MigrationObject[] | null>(null);

  const objects = useMemo(
    () => allObjects.filter((o) => o.objectId.startsWith('SIF_') || o.objectId.startsWith('ZSIF')),
    [allObjects],
  );

  const isString = <T extends string>(v: T | undefined): v is T => Boolean(v);
  const classes = useMemo(() => Array.from(new Set(objects.map((o) => o.class).filter(isString))), [objects]);
  const categories = useMemo(() => Array.from(new Set(objects.map((o) => o.category).filter(isString))), [objects]);
  const approaches = useMemo(() => Array.from(new Set(objects.map((o) => o.approach).filter(isString))), [objects]);
  const components = useMemo(() => Array.from(new Set(objects.map((o) => o.component).filter(isString))), [objects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return objects.filter((o) => {
      if (klass.length > 0 && !klass.includes(o.class)) return false;
      if (category.length > 0 && (!o.category || !category.includes(o.category))) return false;
      if (approach.length > 0 && (!o.approach || !approach.includes(o.approach))) return false;
      if (component.length > 0 && (!o.component || !component.includes(o.component))) return false;
      if (status.length > 0 && !status.some((s) => (s === 'Deprecated') === !!o.invalid)) return false;
      if (!q) return true;
      return (
        o.objectId.toLowerCase().includes(q) ||
        (o.technicalName ?? '').toLowerCase().includes(q) ||
        (o.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [objects, query, klass, category, approach, component, status]);

  const hasActiveFilters = query !== '' || klass.length > 0 || category.length > 0 || approach.length > 0 || component.length > 0 || status.length > 0;
  const clearFilters = () => {
    setQuery(''); setKlass([]); setCategory([]); setApproach([]); setComponent([]); setStatus([]);
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.id));
  const toggleSelectAll = () => setSelected((s) => {
    if (allFilteredSelected) return new Set([...s].filter((id) => !filtered.some((o) => o.id === id)));
    return new Set([...s, ...filtered.map((o) => o.id)]);
  });
  const toggleSelect = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const openGenerate = () => {
    const targets = objects.filter((o) => selected.has(o.id));
    if (targets.length === 0) { toast.error('Select at least one object first.'); return; }
    setGenerateTargets(targets);
  };

  const columns: Column<MigrationObject>[] = [
    {
      key: 'select', width: 36,
      header: <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 accent-[var(--blue)]" />,
      render: (o) => <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 accent-[var(--blue)]" />,
    },
    { key: 'objectId', header: 'Object ID', render: (o) => <Tag variant="table">{o.objectId}</Tag>, width: 190, sortValue: (o) => o.objectId },
    { key: 'description', header: 'Description', render: (o) => o.description ?? '—', sortValue: (o) => o.description },
    { key: 'class', header: 'Class', render: (o) => <ColorTag colorKey={o.class}>{o.class}</ColorTag>, width: 90, sortValue: (o) => o.class },
    { key: 'category', header: 'Object Type', render: (o) => o.category ? <ColorTag colorKey={o.category}>{o.category}</ColorTag> : '—', sortValue: (o) => o.category },
    { key: 'approach', header: 'Approach', render: (o) => o.approach ? <ColorTag colorKey={o.approach}>{fmtApproach(o.approach)}</ColorTag> : '—', sortValue: (o) => o.approach },
    { key: 'component', header: 'Component', render: (o) => o.component ? <ColorTag colorKey={componentMainGroup(o.component)}>{o.component}</ColorTag> : '—', sortValue: (o) => o.component },
    {
      key: 'standardFmd', header: 'Standard FMD',
      render: (o) => {
        const link = standardFmdByObject.get(o.id);
        return link ? (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/library/fmds?open=${link.fmdId}`); }}
            className="font-mono text-sm2 text-blue hover:underline"
          >
            {link.displayId ?? link.name}
          </button>
        ) : '—';
      },
      sortValue: (o) => standardFmdByObject.get(o.id)?.displayId,
    },
  ];

  return (
    <div>
      <PageHeader title="Migration Object" description="Programme-wide SAP migration-object catalogue." />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ToolbarSearch value={query} onChange={setQuery} placeholder="Search catalogue…" />
        <MultiSelectFilter label="Class" options={classes} selected={klass} onChange={setKlass} />
        <MultiSelectFilter label="Object Type" options={categories} selected={category} onChange={setCategory} />
        <MultiSelectFilter label="Approach" options={approaches} selected={approach} onChange={setApproach} formatOption={fmtApproach} />
        <MultiSelectFilter label="Component" options={components} selected={component} onChange={setComponent} />
        <MultiSelectFilter label="Status" options={STATUS_OPTIONS} selected={status} onChange={setStatus} />
        {hasActiveFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-red px-2 py-1.5 rounded-[8px] hover:bg-red-light shrink-0">
            <X size={13} /> Clear filters
          </button>
        )}
        <span className="text-sm text-muted ml-1 shrink-0">{filtered.length.toLocaleString()} objects{selected.size > 0 ? ` · ${selected.size} selected` : ''}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <ToolbarButton onClick={() => toast.info('Dependency / ERD diagram generator — coming soon.')}>
            <Network size={14} /> ERD Generator
          </ToolbarButton>
          <ToolbarButton onClick={openGenerate} disabled={selected.size === 0}>
            <Files size={14} /> Generate FMD{selected.size > 0 ? ` (${selected.size})` : ''}
          </ToolbarButton>
          <ToolbarButton onClick={() => toast.info('Migration object designer — coming soon.')}>
            <Boxes size={14} /> Object Designer
          </ToolbarButton>
        </div>
      </div>
      <Table
        columns={columns} rows={filtered} rowKey={(o) => o.id} pageSize={30}
        onRowClick={setDetailObject} emptyMessage={isLoading ? 'Loading…' : 'No objects.'}
      />
      <LibraryObjectDialog
        object={detailObject} onClose={() => setDetailObject(null)}
        onSelectObject={(id) => { const next = allObjects.find((o) => o.id === id); if (next) setDetailObject(next); }}
      />
      <GenerateFmdDialog objects={generateTargets} onClose={() => setGenerateTargets(null)} />
    </div>
  );
}

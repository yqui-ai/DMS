import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { ColorTag } from '../../components/ColorTag';
import { GoldenToggle } from '../../components/GoldenToggle';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { ToolbarSearch } from '../../components/ToolbarSearch';
import { useLibraryXrefTables, type LibraryXrefRow } from '../../lib/queries/rules';
import { GoldenXrefDesignerDialog } from './GoldenXrefDesignerDialog';
import { GoldenXrefViewerDialog } from './GoldenXrefViewerDialog';

const CLASS_OPTIONS = ['Global', 'Local'];
const TYPE_OPTIONS = ['Standard', 'Golden'];

export function LibraryXref() {
  const { data: tables = [], isLoading } = useLibraryXrefTables();
  const [query, setQuery] = useState('');
  const [klass, setKlass] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const [openGolden, setOpenGolden] = useState<LibraryXrefRow | null>(null);
  const [goldenTarget, setGoldenTarget] = useState<LibraryXrefRow | 'new' | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tables.filter((t) => {
      if (klass.length > 0 && !klass.includes(t.class)) return false;
      if (type.length > 0 && !type.includes(t.type)) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q);
    });
  }, [tables, query, klass, type]);

  const hasActiveFilters = query !== '' || klass.length > 0 || type.length > 0;
  const clearFilters = () => { setQuery(''); setKlass([]); setType([]); };

  const existingGolden = tables.find((t) => t.type === 'Golden');
  /** Only one Golden XREF ever exists — the button edits it if present, otherwise starts one. */
  const openGoldenDesigner = () => setGoldenTarget(existingGolden ?? 'new');

  const columns: Column<LibraryXrefRow>[] = [
    { key: 'displayId', header: 'ID', width: 110, render: (t) => <span className="font-mono text-sm2">{t.displayId ?? '—'}</span>, sortValue: (t) => t.displayId },
    { key: 'name', header: 'Name', render: (t) => <span className="font-mono font-bold text-sm2">{t.name}</span>, sortValue: (t) => t.name },
    { key: 'class', header: 'Class', width: 90, render: (t) => <ColorTag colorKey={t.class}>{t.class}</ColorTag>, sortValue: (t) => t.class },
    { key: 'type', header: 'Type', width: 90, render: (t) => <ColorTag colorKey={t.type}>{t.type}</ColorTag>, sortValue: (t) => t.type },
    { key: 'reference', header: 'Reference', render: (t) => <span className="font-mono text-sm2">{t.reference}</span>, sortValue: (t) => t.reference },
    { key: 'latestVersion', header: 'Version', render: (t) => t.latestVersion ?? '—', sortValue: (t) => t.latestVersion },
    { key: 'purpose', header: 'Purpose', render: (t) => t.purpose ?? '—', sortValue: (t) => t.purpose },
  ];

  return (
    <div>
      <PageHeader title="Cross Reference (XREF)" description="Value-mapping tables across every subproject you have access to." />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ToolbarSearch value={query} onChange={setQuery} placeholder="Search XREF tables…" />
        <MultiSelectFilter label="Class" options={CLASS_OPTIONS} selected={klass} onChange={setKlass} />
        <MultiSelectFilter label="Type" options={TYPE_OPTIONS} selected={type} onChange={setType} />
        {hasActiveFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-red px-2 py-1.5 rounded-[8px] hover:bg-red-light shrink-0">
            <X size={13} /> Clear filters
          </button>
        )}
        <span className="text-sm text-muted ml-1 shrink-0">{filtered.length.toLocaleString()} tables</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <GoldenToggle onClick={openGoldenDesigner} label="Golden XREF" />
        </div>
      </div>
      {!isLoading && filtered.length === 0
        ? <EmptyState title="No XREF tables yet" description="Value-mapping tables created for any subproject, or a Golden XREF built via the designer, will list here." />
        : (
          <Table
            columns={columns} rows={filtered} rowKey={(t) => t.id} pageSize={30} emptyMessage="Loading…"
            onRowClick={setOpenGolden} rowClickable={(t) => t.type === 'Golden'}
          />
        )}
      <GoldenXrefViewerDialog xref={openGolden} onClose={() => setOpenGolden(null)} />
      <GoldenXrefDesignerDialog target={goldenTarget} onClose={() => setGoldenTarget(null)} />
    </div>
  );
}

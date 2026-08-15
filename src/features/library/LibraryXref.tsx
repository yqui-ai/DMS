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

const CLASS_OPTIONS = ['Global', 'Local'];

export function LibraryXref() {
  const { data: tables = [], isLoading } = useLibraryXrefTables();
  const [goldenOnly, setGoldenOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [klass, setKlass] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tables.filter((t) => {
      if (goldenOnly && t.class !== 'Global') return false;
      if (klass.length > 0 && !klass.includes(t.class)) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q);
    });
  }, [tables, query, klass, goldenOnly]);

  const hasActiveFilters = query !== '' || klass.length > 0;
  const clearFilters = () => { setQuery(''); setKlass([]); };

  const columns: Column<LibraryXrefRow>[] = [
    { key: 'displayId', header: 'ID', width: 110, render: (t) => <span className="font-mono text-sm2">{t.displayId ?? '—'}</span>, sortValue: (t) => t.displayId },
    { key: 'name', header: 'Name', render: (t) => <span className="font-mono font-bold text-sm2">{t.name}</span>, sortValue: (t) => t.name },
    { key: 'class', header: 'Class', width: 90, render: (t) => <ColorTag colorKey={t.class}>{t.class}</ColorTag>, sortValue: (t) => t.class },
    { key: 'reference', header: 'Reference', render: (t) => <span className="font-mono text-sm2">{t.reference}</span>, sortValue: (t) => t.reference },
    { key: 'version', header: 'Version', render: (t) => t.version ?? '—', sortValue: (t) => t.version },
    { key: 'purpose', header: 'Purpose', render: (t) => t.purpose ?? '—', sortValue: (t) => t.purpose },
  ];

  return (
    <div>
      <PageHeader title="Cross Reference (XREF)" description="Value-mapping tables across every subproject you have access to." />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ToolbarSearch value={query} onChange={setQuery} placeholder="Search XREF tables…" />
        <MultiSelectFilter label="Class" options={CLASS_OPTIONS} selected={klass} onChange={setKlass} />
        {hasActiveFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-red px-2 py-1.5 rounded-[8px] hover:bg-red-light shrink-0">
            <X size={13} /> Clear filters
          </button>
        )}
        <span className="text-sm text-muted ml-1 shrink-0">{filtered.length.toLocaleString()} tables</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <GoldenToggle active={goldenOnly} onClick={() => setGoldenOnly((v) => !v)} label="Golden XREF" />
        </div>
      </div>
      {!isLoading && filtered.length === 0
        ? <EmptyState title="No XREF tables yet" description="Value-mapping tables created for any subproject will list here." />
        : <Table columns={columns} rows={filtered} rowKey={(t) => t.id} pageSize={30} emptyMessage="Loading…" />}
    </div>
  );
}

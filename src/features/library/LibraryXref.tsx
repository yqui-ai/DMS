import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Settings } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { ListEmptyState } from '../../components/ListEmptyState';
import { Table, type Column } from '../../components/Table';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { Toolbar } from '../../components/Toolbar';
import { Outlet, useNavigate } from 'react-router-dom';
import { useLibraryXrefTables, type LibraryXrefRow } from '../../lib/queries/rules';
import { useLibraryPath } from '../../lib/libraryNav';
import { GoldenXrefDesignerDialog } from './GoldenXrefDesignerDialog';

const CLASS_OPTIONS = ['Global', 'Local'];
const TYPE_OPTIONS = ['Standard', 'Golden'];

export function LibraryXref() {
  const { data: tables = [], isLoading } = useLibraryXrefTables();
  const [query, setQuery] = useState('');
  const [klass, setKlass] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const navigate = useNavigate();
  const to = useLibraryPath();
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
    { key: 'class', header: 'Class', width: 90, render: (t) => t.class, sortValue: (t) => t.class },
    { key: 'type', header: 'Type', width: 90, render: (t) => t.type, sortValue: (t) => t.type },
    { key: 'reference', header: 'Reference', render: (t) => <span className="font-mono text-sm2">{t.reference}</span>, sortValue: (t) => t.reference },
    { key: 'latestVersion', header: 'Version', render: (t) => t.latestVersion ?? '—', sortValue: (t) => t.latestVersion },
    { key: 'purpose', header: 'Purpose', render: (t) => t.purpose ?? '—', sortValue: (t) => t.purpose },
  ];

  return (
    <div>
      <PageHeader title="Cross Reference (XREF)" description="Value-mapping tables across every subproject you have access to." />
      <Toolbar
        search={{ value: query, onChange: setQuery, placeholder: 'Search XREF tables…' }}
        onClearFilters={hasActiveFilters ? clearFilters : undefined}
        count={filtered.length} noun="tables"
        actions={<Button variant="quiet" size="sm" onClick={openGoldenDesigner}><Settings size={14} /> Golden XREF</Button>}
      >
        <MultiSelectFilter label="Class" options={CLASS_OPTIONS} selected={klass} onChange={setKlass} />
        <MultiSelectFilter label="Type" options={TYPE_OPTIONS} selected={type} onChange={setType} />
      </Toolbar>
      {!isLoading && filtered.length === 0
        ? (
          <ListEmptyState
            noun="XREF tables" filtered={hasActiveFilters} onClearFilters={clearFilters}
            description="Value-mapping tables created for any subproject, or a Golden XREF built via the designer, will list here."
          />
        )
        : (
          <Table
            columns={columns} rows={filtered} rowKey={(t) => t.id} pageSize={30} emptyMessage="Loading…"
            onRowClick={(t) => navigate(to('xref', t.id))} rowClickable={(t) => t.type === 'Golden'}
          />
        )}
      <Outlet />
      <GoldenXrefDesignerDialog target={goldenTarget} onClose={() => setGoldenTarget(null)} />
    </div>
  );
}

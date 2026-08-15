import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Filter, Maximize2 } from 'lucide-react';
import clsx from 'clsx';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { useXrefTables, useXrefRows, useXrefRowMutations } from '../../lib/queries/rules';
import type { XrefRow } from '../../types/entities';

export function ValueMapping() {
  const { waveId } = useParams();
  const { data: tables = [], isLoading } = useXrefTables(waveId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ?? tables[0]?.id ?? null;
  const selectedTable = tables.find((t) => t.id === selected);

  if (!isLoading && tables.length === 0) {
    return <EmptyState title="No XREF tables yet" description="Value-mapping tables created for this wave will list here." />;
  }

  return (
    <div className="flex gap-4">
      <div className="w-64 shrink-0 flex flex-col gap-1.5">
        {tables.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedId(t.id)}
            className={clsx(
              'text-left px-3 py-2.5 rounded-[8px] border',
              selected === t.id ? 'bg-blue-light border-blue-mid' : 'bg-surface border-line hover:bg-blue-pale',
            )}
          >
            <div className="font-mono font-bold text-sm2">{t.name}</div>
            <div className="text-2xs text-muted">{t.purpose ?? '—'}</div>
            {t.version && <div className="text-2xs text-muted mt-0.5">v{t.version}</div>}
          </button>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        {selected && selectedTable ? <XrefRowsGrid xrefTableId={selected} title={selectedTable.name} /> : <p className="text-sm text-muted">Select a table.</p>}
      </div>
    </div>
  );
}

interface XrefFilters { query: string; status: 'All' | 'Active' | 'Retired' }

function XrefRowsGrid({ xrefTableId, title }: { xrefTableId: string; title: string }) {
  const toast = useToast();
  const { data: rows = [], isLoading } = useXrefRows(xrefTableId);
  const mutations = useXrefRowMutations(xrefTableId);
  const [adding, setAdding] = useState(false);
  const [legacy, setLegacy] = useState('');
  const [s4, setS4] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [poppedOut, setPoppedOut] = useState(false);
  const [filters, setFilters] = useState<XrefFilters>({ query: '', status: 'All' });

  const addRow = async () => {
    if (!legacy.trim() || !s4.trim()) return;
    try {
      await mutations.add({ legacyValue: legacy.trim(), s4Value: s4.trim() });
      setLegacy(''); setS4(''); setAdding(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not add row.');
    }
  };

  const toggleStatus = async (row: XrefRow) => {
    try {
      await mutations.update(row.id, { status: row.status === 'Active' ? 'Retired' : 'Active' });
    } catch (err: any) {
      toast.error(err.message ?? 'Could not update row.');
    }
  };

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.status !== 'All' && r.status !== filters.status) return false;
      if (!q) return true;
      return (r.legacyValue ?? '').toLowerCase().includes(q) || (r.s4Value ?? '').toLowerCase().includes(q);
    });
  }, [rows, filters]);

  const activeFilterCount = (filters.query ? 1 : 0) + (filters.status !== 'All' ? 1 : 0);

  const columns: Column<XrefRow>[] = [
    { key: 'legacy', header: 'Legacy Value', render: (r) => <span className="font-mono text-sm2">{r.legacyValue}</span> },
    { key: 's4', header: 'S/4 Value', render: (r) => <span className="font-mono text-sm2">{r.s4Value}</span> },
    { key: 'validFrom', header: 'Valid From', render: (r) => r.validFrom ?? '—' },
    {
      key: 'status', header: 'Status',
      render: (r) => (
        <button onClick={() => toggleStatus(r)}>
          <Tag variant={r.status === 'Active' ? 'accent' : 'neutral'}>{r.status}</Tag>
        </button>
      ),
    },
  ];

  const toolbar = (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setFiltersOpen(true)}>
          <Filter size={13} /> Filters {activeFilterCount > 0 && <Tag variant="accent">{activeFilterCount}</Tag>}
        </Button>
        <span className="text-sm text-muted">{filtered.length} of {rows.length} rows</span>
      </div>
      <div className="flex items-center gap-2">
        {adding ? (
          <div className="flex items-center gap-2 bg-surface rounded-lg shadow-card p-2.5">
            <Input placeholder="Legacy value" value={legacy} onChange={(e) => setLegacy(e.target.value)} className="w-36" />
            <Input placeholder="S/4 value" value={s4} onChange={(e) => setS4(e.target.value)} className="w-36" />
            <Button variant="primary" onClick={addRow}>Add</Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={14} /> Add row</Button>
        )}
        {!poppedOut && (
          <Button variant="ghost" onClick={() => setPoppedOut(true)}><Maximize2 size={13} /> Pop out</Button>
        )}
      </div>
    </div>
  );

  const grid = (
    <div className="flex flex-col gap-3">
      {toolbar}
      <Table columns={columns} rows={filtered} rowKey={(r) => r.id} emptyMessage={isLoading ? 'Loading…' : 'No rows match these filters.'} />
    </div>
  );

  return (
    <>
      {grid}

      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter rows" size="sm" footer={
        <>
          <Button variant="secondary" onClick={() => { setFilters({ query: '', status: 'All' }); setFiltersOpen(false); }}>Clear</Button>
          <Button variant="primary" onClick={() => setFiltersOpen(false)}>Apply</Button>
        </>
      }>
        <div className="flex flex-col gap-3.5">
          <Field label="Search legacy / S/4 value">
            <Input value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} placeholder="e.g. FIN or FERT" />
          </Field>
          <Field label="Status">
            <select
              value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as XrefFilters['status'] }))}
              className="w-full text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 min-h-[38px]"
            >
              <option>All</option><option>Active</option><option>Retired</option>
            </select>
          </Field>
        </div>
      </Dialog>

      <Dialog open={poppedOut} onClose={() => setPoppedOut(false)} title={`Value Mapping — ${title}`} size="win">
        {grid}
      </Dialog>
    </>
  );
}

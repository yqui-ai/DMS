import { useMemo, useState } from 'react';
import { Search, BarChart2 } from 'lucide-react';
import { Table, type Column } from './Table';
import { EmptyState } from './EmptyState';

export interface TableViewerProps<T> {
  title: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  filterRow?: (row: T, query: string) => boolean;
}

/** Data grid with a text filter and a profiling side tab (column-level stats). */
export function TableViewer<T>({ title, columns, rows, rowKey, filterRow }: TableViewerProps<T>) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'data' | 'profiling'>('data');

  const filtered = useMemo(() => {
    if (!query || !filterRow) return rows;
    return rows.filter((r) => filterRow(r, query));
  }, [rows, query, filterRow]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-md font-bold">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter rows…"
              className="text-sm2 pl-8 pr-3 py-1.5 rounded-[8px] border border-line-strong bg-surface min-w-[220px]"
            />
          </div>
          <div className="flex rounded-[8px] shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
            <button
              onClick={() => setTab('data')}
              className={`px-3 py-1.5 text-sm2 font-semibold ${tab === 'data' ? 'bg-blue text-white' : 'bg-surface text-text hover:bg-blue-pale'}`}
            >
              Data
            </button>
            <button
              onClick={() => setTab('profiling')}
              className={`px-3 py-1.5 text-sm2 font-semibold flex items-center gap-1.5 ${tab === 'profiling' ? 'bg-blue text-white' : 'bg-surface text-text hover:bg-blue-pale'}`}
            >
              <BarChart2 size={13} /> Profiling
            </button>
          </div>
        </div>
      </div>
      {tab === 'data' ? (
        <Table columns={columns} rows={filtered} rowKey={rowKey} />
      ) : (
        <EmptyState title="Profiling not yet available" description="Column-level distribution and null-rate stats populate once this table has been extracted." />
      )}
    </div>
  );
}

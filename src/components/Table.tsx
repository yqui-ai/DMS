import { useMemo, useState, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import clsx from 'clsx';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  frozen?: boolean;
  width?: number;
  /** Raw comparable value for this column — presence of this makes the column's header clickable to sort. */
  sortValue?: (row: T) => string | number | boolean | null | undefined;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string;
  pageSize?: number;
  emptyMessage?: string;
  /** Tighter row height/padding and smaller text — for data-dense lists (e.g. a structure's field
   * list) where the default row height wastes space without adding readability. */
  dense?: boolean;
}

type SortDir = 'asc' | 'desc';

export function Table<T>({ columns, rows, rowKey, onRowClick, selectedKey, pageSize = 25, emptyMessage = 'No records.', dense = false }: TableProps<T>) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  const sortCol = sort ? columns.find((c) => c.key === sort.key) : undefined;
  const sorted = useMemo(() => {
    if (!sort || !sortCol?.sortValue) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sortCol.sortValue!(a);
      const bv = sortCol.sortValue!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [rows, sort, sortCol]);

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setPage(0);
    setSort((s) => {
      if (s?.key !== col.key) return { key: col.key, dir: 'asc' };
      if (s.dir === 'asc') return { key: col.key, dir: 'desc' };
      return null;
    });
  };

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className={clsx('overflow-hidden', !dense && 'rounded-lg shadow-card')}>
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full border-collapse text-base">
          <thead>
            <tr>
              {columns.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    onClick={() => toggleSort(col)}
                    className={clsx(
                      'font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] sticky top-0 text-left z-[1]',
                      dense ? 'text-2xs px-2.5 py-1.5' : 'text-xs px-3.5 py-2.5',
                      col.numeric && 'text-right',
                      col.frozen && 'sticky right-0 shadow-frozenCol',
                      col.sortValue && 'cursor-pointer select-none hover:text-text',
                    )}
                  >
                    <span className={clsx('inline-flex items-center gap-1', col.numeric && 'flex-row-reverse')}>
                      {col.header}
                      {col.sortValue && (
                        active ? (
                          sort!.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        ) : (
                          <ChevronsUpDown size={12} className="opacity-30" />
                        )
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3.5 py-8 text-center text-muted text-sm">{emptyMessage}</td></tr>
            )}
            {paged.map((row) => {
              const key = rowKey(row);
              const selected = key === selectedKey;
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  className={clsx('border-t border-line', onRowClick && 'cursor-pointer hover:bg-blue-pale', selected && 'bg-blue-light')}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={clsx(dense ? 'px-2.5 py-1.5 text-sm2' : 'px-3.5 py-2.5', col.numeric && 'text-right tabular-nums', col.frozen && 'sticky right-0 bg-surface shadow-frozenCol')}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && (
        <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-line text-sm text-muted">
          <span>{page * pageSize + 1}–{Math.min(rows.length, (page + 1) * pageSize)} of {rows.length}</span>
          <div className="flex gap-1.5">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded hover:bg-blue-pale disabled:opacity-40">Prev</button>
            <button disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded hover:bg-blue-pale disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

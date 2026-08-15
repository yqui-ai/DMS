import { useState, type ReactNode } from 'react';
import clsx from 'clsx';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  frozen?: boolean;
  width?: number;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string;
  pageSize?: number;
  emptyMessage?: string;
}

export function Table<T>({ columns, rows, rowKey, onRowClick, selectedKey, pageSize = 25, emptyMessage = 'No records.' }: TableProps<T>) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const paged = rows.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="rounded-lg shadow-card overflow-hidden">
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full border-collapse text-base">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={clsx(
                    'text-xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3.5 py-2.5 sticky top-0 text-left z-[1]',
                    col.numeric && 'text-right',
                    col.frozen && 'sticky right-0 shadow-frozenCol',
                  )}
                >
                  {col.header}
                </th>
              ))}
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
                      className={clsx('px-3.5 py-2.5', col.numeric && 'text-right tabular-nums', col.frozen && 'sticky right-0 bg-surface shadow-frozenCol')}
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

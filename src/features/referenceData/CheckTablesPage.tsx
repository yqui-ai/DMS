import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Tag } from '../../components/Tag';
import { EmptyState } from '../../components/EmptyState';
import { QueryErrorNotice } from '../../components/QueryErrorNotice';
import { TableViewer } from '../../components/TableViewer';
import { useCheckTables, useCheckTableRows } from '../../lib/queries/referenceData';
import type { CheckTable, CheckTableRow } from '../../types/entities';

export function CheckTablesPage() {
  const { waveId } = useParams();
  const { data: tables = [], isLoading, isError, error } = useCheckTables(waveId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = tables.find((t) => t.id === selectedId) ?? tables[0];

  if (isError) return <QueryErrorNotice error={error} />;
  if (!isLoading && tables.length === 0) {
    return <EmptyState title="No check tables yet" description="SAP check tables referenced by this wave will list here." />;
  }

  return (
    <div className="flex gap-4">
      <div className="w-72 shrink-0 flex flex-col gap-1.5">
        {tables.map((t) => (
          <button
            key={t.id} onClick={() => setSelectedId(t.id)}
            className={`text-left px-3 py-2.5 rounded-[8px] border ${selected?.id === t.id ? 'bg-blue-light border-blue-mid' : 'bg-surface border-line hover:bg-blue-pale'}`}
          >
            <div className="flex items-center gap-2">
              <Tag variant="table">{t.tableName}</Tag>
              {t.domain && <span className="text-2xs text-muted">{t.domain}</span>}
            </div>
            {t.description && <div className="text-2xs text-muted mt-1">{t.description}</div>}
          </button>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        {selected ? <CheckTableViewer table={selected} /> : <p className="text-sm text-muted">Select a table.</p>}
      </div>
    </div>
  );
}

function CheckTableViewer({ table }: { table: CheckTable }) {
  const { data: rows = [] } = useCheckTableRows(table.id);

  return (
    <TableViewer<CheckTableRow>
      title={table.tableName}
      rows={rows}
      rowKey={(r) => r.id}
      filterRow={(r, q) => r.values.some((v) => v.toLowerCase().includes(q.toLowerCase()))}
      columns={table.columns.map((col, i) => ({
        key: col, header: col, render: (r) => <span className="font-mono text-sm2">{r.values[i] ?? '—'}</span>,
      }))}
    />
  );
}

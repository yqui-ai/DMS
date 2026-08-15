import { useParams } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { useFallout } from '../../lib/queries/quality';
import type { FalloutRecord } from '../../types/entities';

export function FalloutPage() {
  const { subprojectId } = useParams();
  const { data: rows = [], isLoading } = useFallout(subprojectId);

  const columns: Column<FalloutRecord>[] = [
    { key: 'rule', header: 'Rule', render: (f) => <span className="font-mono font-bold text-sm2">{f.ruleCode ?? '—'}</span> },
    { key: 'key', header: 'Key Value', render: (f) => <span className="font-mono text-sm2">{f.keyValue ?? '—'}</span> },
    { key: 'reason', header: 'Reason', render: (f) => f.reason ?? '—' },
  ];

  if (!isLoading && rows.length === 0) {
    return <EmptyState title="No rejected records" description="Rows rejected by validation transforms during a run will list here." />;
  }
  return <Table columns={columns} rows={rows} rowKey={(f) => String(f.id)} pageSize={30} emptyMessage="Loading…" />;
}

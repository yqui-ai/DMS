import { useParams } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { useReconciliation } from '../../lib/queries/quality';
import { useMigrationObjects } from '../../lib/queries/scope';
import { fmtNumber, fmtDateTime } from '../../lib/format';
import type { Reconciliation } from '../../types/entities';

export function ReconciliationPage() {
  const { subprojectId } = useParams();
  const { data: rows = [], isLoading } = useReconciliation(subprojectId);
  const { data: objects = [] } = useMigrationObjects();
  const objLabel = (id?: string) => (id ? objects.find((o) => o.id === id)?.objectId ?? id : '—');

  const columns: Column<Reconciliation>[] = [
    { key: 'object', header: 'Object', render: (r) => <span className="font-mono text-sm2">{objLabel(r.migrationObjectId)}</span> },
    { key: 'src', header: 'Source', numeric: true, render: (r) => fmtNumber(r.srcCount) },
    { key: 'tgt', header: 'Target', numeric: true, render: (r) => fmtNumber(r.tgtCount) },
    { key: 'variance', header: 'Variance', numeric: true, render: (r) => <Tag variant={r.variance === 0 ? 'accent' : 'warn'}>{r.variance}%</Tag> },
    { key: 'signedOff', header: 'Signed Off', render: (r) => (r.signedOffBy ? `${r.signedOffBy} · ${fmtDateTime(r.signedOffAt)}` : '—') },
  ];

  if (!isLoading && rows.length === 0) {
    return <EmptyState title="No reconciliation records yet" description="Source vs. target counts from completed runs will list here." />;
  }
  return <Table columns={columns} rows={rows} rowKey={(r) => r.id} emptyMessage="Loading…" />;
}

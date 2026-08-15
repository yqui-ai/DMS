import { useParams } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { useDqDimensions } from '../../lib/queries/quality';
import { fmtDecimal } from '../../lib/format';
import type { DqDimension } from '../../types/entities';

export function QualityDimensions() {
  const { waveId } = useParams();
  const { data: dimensions = [], isLoading } = useDqDimensions(waveId);

  const columns: Column<DqDimension>[] = [
    { key: 'dimension', header: 'Dimension', render: (d) => <span className="font-semibold">{d.dimension}</span> },
    { key: 'description', header: 'Description', render: (d) => d.description ?? '—' },
    { key: 'threshold', header: 'Threshold', numeric: true, render: (d) => (d.threshold != null ? `${fmtDecimal(d.threshold)}%` : '—') },
    { key: 'actual', header: 'Actual', numeric: true, render: (d) => (d.actual != null ? `${fmtDecimal(d.actual)}%` : '—') },
    {
      key: 'result', header: 'Result',
      render: (d) => d.threshold == null || d.actual == null ? '—' : (
        <Tag variant={d.actual >= d.threshold ? 'accent' : 'danger'}>{d.actual >= d.threshold ? 'Met' : 'Below threshold'}</Tag>
      ),
    },
  ];

  if (!isLoading && dimensions.length === 0) {
    return <EmptyState title="No quality dimensions yet" description="Thresholds and actuals scored for this wave will list here." />;
  }
  return <Table columns={columns} rows={dimensions} rowKey={(d) => d.id} emptyMessage="Loading…" />;
}

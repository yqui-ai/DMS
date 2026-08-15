import { useParams } from 'react-router-dom';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { EmptyState } from '../../components/EmptyState';
import { useSourceTables } from '../../lib/queries/staging';
import { fmtNumber, fmtDecimal } from '../../lib/format';
import type { SourceTable } from '../../types/entities';

export function ProfilingPage() {
  const { subprojectId } = useParams();
  const { data: tables = [], isLoading } = useSourceTables(subprojectId);
  const extracted = tables.filter((t) => t.status === 'Extracted');

  const columns: Column<SourceTable>[] = [
    { key: 'name', header: 'Table', render: (t) => <span className="font-mono font-bold text-sm2">{t.name}</span> },
    { key: 'records', header: 'Records', numeric: true, render: (t) => fmtNumber(t.records) },
    { key: 'dqScore', header: 'DQ Score', numeric: true, render: (t) => (t.dqScore != null ? `${fmtDecimal(t.dqScore)}%` : '—') },
    {
      key: 'assessment', header: 'Assessment',
      render: (t) => {
        if (t.dqScore == null) return <Tag variant="neutral">Not assessed</Tag>;
        if (t.dqScore >= 95) return <Tag variant="accent">Clean</Tag>;
        if (t.dqScore >= 80) return <Tag variant="warn">Needs cleansing</Tag>;
        return <Tag variant="danger">High risk</Tag>;
      },
    },
  ];

  if (!isLoading && extracted.length === 0) {
    return <EmptyState title="Nothing to profile yet" description="Extract source tables in the Staging Area first — this screen assesses them for data quality." />;
  }

  return <Table columns={columns} rows={extracted} rowKey={(t) => t.id} emptyMessage="Loading…" />;
}

import { useParams } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { useDqChecks } from '../../lib/queries/quality';
import { useMigrationObjects } from '../../lib/queries/scope';
import type { DqCheck } from '../../types/entities';

const RESULT_VARIANT = { Pass: 'accent', Warning: 'warn', Fail: 'danger' } as const;

export function DqChecksPhase({ phase, emptyLabel }: { phase: 'pre-load' | 'post-load' | 'post-transform'; emptyLabel: string }) {
  const { subprojectId } = useParams();
  const { data: checks = [], isLoading } = useDqChecks(subprojectId, phase);
  const { data: objects = [] } = useMigrationObjects();
  const objLabel = (id?: string) => (id ? objects.find((o) => o.id === id)?.objectId ?? id : '—');

  const columns: Column<DqCheck>[] = [
    { key: 'code', header: 'Check', render: (c) => <span className="font-mono font-bold text-sm2">{c.code}</span> },
    { key: 'object', header: 'Object', render: (c) => <span className="font-mono text-sm2">{objLabel(c.migrationObjectId)}</span> },
    { key: 'description', header: 'Description', render: (c) => c.description ?? '—' },
    { key: 'expected', header: 'Expected', render: (c) => c.expected ?? '—' },
    { key: 'actual', header: 'Actual', render: (c) => c.actual ?? '—' },
    { key: 'result', header: 'Result', render: (c) => c.result ? <Tag variant={RESULT_VARIANT[c.result]}>{c.result}</Tag> : '—' },
  ];

  if (!isLoading && checks.length === 0) {
    return <EmptyState title={emptyLabel} description="Checks run for this subproject will list here." />;
  }
  return <Table columns={columns} rows={checks} rowKey={(c) => c.id} emptyMessage="Loading…" />;
}

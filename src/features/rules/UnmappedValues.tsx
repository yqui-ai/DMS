import { Segmented } from '../../components/Segmented';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { useUnmappedValues, useUnmappedValueMutations } from '../../lib/queries/unmapped';
import { fmtNumber } from '../../lib/format';
import type { UnmappedValue } from '../../types/entities';

const STATUS_VARIANT = { Open: 'danger', Proposed: 'warn', Resolved: 'accent' } as const;
const STATUS_CYCLE: UnmappedValue['status'][] = ['Open', 'Proposed', 'Resolved'];

export function UnmappedValues() {
  const { subprojectId } = useParams();
  const toast = useToast();
  const { data: values = [], isLoading } = useUnmappedValues(subprojectId);
  const mutations = useUnmappedValueMutations(subprojectId!);
  const [statusFilter, setStatusFilter] = useState<'All' | UnmappedValue['status']>('Open');

  const cycle = async (v: UnmappedValue) => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(v.status) + 1) % STATUS_CYCLE.length];
    try { await mutations.setStatus(v.id, next); } catch (err: any) { toast.error(err.message ?? 'Could not update.'); }
  };

  const filtered = values.filter((v) => statusFilter === 'All' || v.status === statusFilter);

  const columns: Column<UnmappedValue>[] = [
    { key: 'set', header: 'Set', render: (v) => v.setName },
    { key: 'value', header: 'Value', render: (v) => <span className="font-mono font-bold text-sm2">{v.value}</span> },
    { key: 'field', header: 'Field', render: (v) => v.field ?? '—' },
    { key: 'occurrences', header: 'Occurrences', numeric: true, render: (v) => fmtNumber(v.occurrences) },
    { key: 'owner', header: 'Owner', render: (v) => v.owner ?? '—' },
    { key: 'suggestion', header: 'Suggestion', render: (v) => v.suggestion ? <span className="font-mono text-sm2">{v.suggestion}</span> : '—' },
    { key: 'status', header: 'Status', render: (v) => <button onClick={() => cycle(v)}><Tag variant={STATUS_VARIANT[v.status]}>{v.status}</Tag></button> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        options={(['All', 'Open', 'Proposed', 'Resolved'] as const).map((s) => ({ value: s, label: s }))}
        value={statusFilter}
        onChange={setStatusFilter}
      />
      {!isLoading && filtered.length === 0 ? (
        <EmptyState title="Nothing here" description="Legacy values without an XREF mapping will list here." />
      ) : (
        <Table columns={columns} rows={filtered} rowKey={(v) => v.id} emptyMessage="Loading…" />
      )}
    </div>
  );
}

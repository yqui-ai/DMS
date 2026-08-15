import { useMemo, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { EmptyState } from '../../components/EmptyState';
import { useRuns } from '../../lib/queries/runs';
import { useMigrationObjects } from '../../lib/queries/scope';
import { fmtDateTime, fmtDuration, fmtNumber } from '../../lib/format';
import type { Run } from '../../types/entities';

const STATUS_VARIANT = { Running: 'warn', Completed: 'accent', 'Completed with rejects': 'warn', Failed: 'danger' } as const;

export function RunsRegister() {
  const { subprojectId } = useParams();
  const navigate = useNavigate();
  const { data: runs = [], isLoading } = useRuns(subprojectId);
  const { data: objects = [] } = useMigrationObjects();
  const objLabel = (id?: string) => (id ? objects.find((o) => o.id === id)?.objectId ?? id : '—');

  const [objectFilter, setObjectFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const objectOptions = useMemo(() => ['All', ...Array.from(new Set(runs.map((r) => objLabel(r.migrationObjectId))))], [runs, objects]);
  const statusOptions = ['All', 'Running', 'Completed', 'Completed with rejects', 'Failed'];

  const filtered = runs.filter((r) => {
    if (objectFilter !== 'All' && objLabel(r.migrationObjectId) !== objectFilter) return false;
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    return true;
  });

  const columns: Column<Run>[] = [
    { key: 'code', header: 'Run', render: (r) => <span className="font-mono font-bold text-sm2">{r.code}</span> },
    { key: 'object', header: 'Object', render: (r) => <span className="font-mono text-sm2">{objLabel(r.migrationObjectId)}</span> },
    { key: 'mode', header: 'Mode', render: (r) => r.mode ?? '—' },
    { key: 'env', header: 'Env', render: (r) => r.env ? <Tag variant="neutral">{r.env}</Tag> : '—' },
    { key: 'started', header: 'Started', render: (r) => fmtDateTime(r.startedAt) },
    { key: 'duration', header: 'Duration', render: (r) => fmtDuration(r.durationS) },
    { key: 'src', header: 'Source', numeric: true, render: (r) => fmtNumber(r.srcCount) },
    { key: 'tgt', header: 'Target', numeric: true, render: (r) => fmtNumber(r.tgtCount) },
    { key: 'rej', header: 'Rejects', numeric: true, render: (r) => fmtNumber(r.rejCount) },
    { key: 'status', header: 'Status', render: (r) => <Tag variant={STATUS_VARIANT[r.status]}>{r.status}</Tag> },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <FilterSelect label="Object" value={objectFilter} options={objectOptions} onChange={setObjectFilter} />
        <FilterSelect label="Status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
        <span className="text-sm text-muted ml-1">{filtered.length} runs</span>
      </div>

      {!isLoading && runs.length === 0 ? (
        <EmptyState title="No runs yet" description="Job runs for this subproject will register here." />
      ) : (
        <Table columns={columns} rows={filtered} rowKey={(r) => r.id} onRowClick={(r) => navigate(r.id)} emptyMessage="No runs match these filters." />
      )}

      <Outlet />
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="text-sm px-2.5 py-1.5 rounded-[8px] border border-[#d6dbe2] bg-surface">
      {options.map((o) => <option key={o} value={o}>{o === 'All' ? `${label}: All` : o}</option>)}
    </select>
  );
}

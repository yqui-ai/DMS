import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { useRules } from '../../lib/queries/rules';
import { useMigrationObjects } from '../../lib/queries/scope';
import type { Rule } from '../../types/entities';

const SEVERITY_VARIANT = { Critical: 'danger', High: 'warn', Medium: 'accent', Low: 'neutral' } as const;
const STATUS_VARIANT = { Draft: 'neutral', 'In Review': 'warn', Approved: 'accent', Rejected: 'danger' } as const;

export function RulesRegister() {
  const { subprojectId } = useParams();
  const { data: rules = [], isLoading } = useRules(subprojectId);
  const { data: objects = [] } = useMigrationObjects();
  const [selected, setSelected] = useState<Rule | null>(null);

  const objectLabel = (id?: string) => (id ? objects.find((o) => o.id === id)?.objectId ?? id : '—');

  const columns: Column<Rule>[] = [
    { key: 'code', header: 'Rule ID', render: (r) => <span className="font-mono font-bold text-sm2">{r.code}</span> },
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'object', header: 'Object', render: (r) => <span className="font-mono text-sm2">{objectLabel(r.migrationObjectId)}</span> },
    { key: 'type', header: 'Type', render: (r) => r.type },
    { key: 'severity', header: 'Severity', render: (r) => <Tag variant={SEVERITY_VARIANT[r.severity]}>{r.severity}</Tag> },
    { key: 'status', header: 'Status', render: (r) => <Tag variant={STATUS_VARIANT[r.status]}>{r.status}</Tag> },
    { key: 'owner', header: 'Owner', render: (r) => r.owner ?? '—' },
    { key: 'version', header: 'Version', render: (r) => <span className="font-mono text-sm2">{r.version ?? '—'}</span> },
  ];

  if (!isLoading && rules.length === 0) {
    return <EmptyState title="No rules yet" description="Rules created for this subproject will register here." />;
  }

  return (
    <div>
      <Table columns={columns} rows={rules} rowKey={(r) => r.id} onRowClick={setSelected} selectedKey={selected?.id} emptyMessage={isLoading ? 'Loading…' : 'No rules.'} />

      <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} size="md">
        {selected && (
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-3 text-sm2">
              <Field label="Rule ID"><span className="font-mono font-bold">{selected.code}</span></Field>
              <Field label="Object"><span className="font-mono">{objectLabel(selected.migrationObjectId)}</span></Field>
              <Field label="Type">{selected.type}</Field>
              <Field label="Severity"><Tag variant={SEVERITY_VARIANT[selected.severity]}>{selected.severity}</Tag></Field>
              <Field label="Status"><Tag variant={STATUS_VARIANT[selected.status]}>{selected.status}</Tag></Field>
              <Field label="Owner">{selected.owner ?? '—'}</Field>
              <Field label="Version"><span className="font-mono">{selected.version ?? '—'}</span></Field>
            </div>
            <div>
              <div className="text-sm2 font-semibold text-muted mb-1">Expression</div>
              <pre className="font-mono text-sm2 bg-surface-2 rounded-[8px] p-3 whitespace-pre-wrap break-words">
                {selected.expression ?? '— no expression captured —'}
              </pre>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs font-semibold uppercase tracking-[.04em] text-muted mb-0.5">{label}</div>
      <div>{children}</div>
    </div>
  );
}

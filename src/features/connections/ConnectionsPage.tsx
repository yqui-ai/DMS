import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { useConnections, useConnectionMutations } from '../../lib/queries/connections';
import { useDefaultProgram } from '../../lib/queries/programme';
import { useToast } from '../../components/Toast';
import type { Connection } from '../../types/entities';

const STATUS_VARIANT = { Connected: 'accent', Error: 'danger', 'Not Configured': 'neutral' } as const;
const STATUSES: Connection['status'][] = ['Connected', 'Error', 'Not Configured'];

export function ConnectionsPage() {
  const { data: program } = useDefaultProgram();
  const toast = useToast();
  const { data: connections = [], isLoading } = useConnections(program?.id);
  const mutations = useConnectionMutations(program?.id ?? '');

  const cycleStatus = async (c: Connection) => {
    const next = STATUSES[(STATUSES.indexOf(c.status) + 1) % STATUSES.length];
    try { await mutations.setStatus(c.id, next); }
    catch (err: any) { toast.error(err.message ?? 'Could not update status.'); }
  };

  const columns: Column<Connection>[] = [
    { key: 'sid', header: 'SID', render: (c) => <Tag variant="connection">{c.sid}</Tag> },
    { key: 'description', header: 'Description', render: (c) => c.description },
    { key: 'type', header: 'Type', render: (c) => c.type },
    { key: 'host', header: 'Host', render: (c) => <span className="font-mono text-sm2">{c.host ?? '—'}</span> },
    { key: 'client', header: 'Client', render: (c) => c.client ?? '—' },
    { key: 'role', header: 'Role', render: (c) => <Tag variant="neutral">{c.role}</Tag> },
    { key: 'envs', header: 'Environments', render: (c) => c.envs ?? '—' },
    {
      key: 'status', header: 'Status',
      render: (c) => <button onClick={() => cycleStatus(c)} title="Click to cycle status"><Tag variant={STATUS_VARIANT[c.status]}>{c.status}</Tag></button>,
    },
  ];

  return (
    <div>
      <PageHeader title="Connections" description="System landscape — SID, host, client, role and status." />
      {!isLoading && connections.length === 0 ? (
        <EmptyState title="No connections configured" description="Connections created for this programme will list here." />
      ) : (
        <Table columns={columns} rows={connections} rowKey={(c) => c.id} emptyMessage="Loading…" />
      )}
    </div>
  );
}

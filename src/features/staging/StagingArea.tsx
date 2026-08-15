import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Card } from '../../components/Card';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../lib/auth';
import { useStagingDb, useSourceTables, useSourceTableMutations } from '../../lib/queries/staging';
import { useConnections } from '../../lib/queries/connections';
import { fmtDateTime, fmtNumber } from '../../lib/format';
import type { SourceTable } from '../../types/entities';

const STATUS_VARIANT = { Extracted: 'accent', Extracting: 'warn', Failed: 'danger', 'Not Extracted': 'neutral' } as const;

export function StagingArea() {
  const { projectId, waveId } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const { data: stagingDb } = useStagingDb(waveId);
  const { data: tables = [], isLoading } = useSourceTables(waveId);
  const { data: connections = [] } = useConnections(projectId);
  const mutations = useSourceTableMutations(waveId!);

  const connName = (id: string) => connections.find((c) => c.id === id)?.sid ?? id;

  const grouped = useMemo(() => {
    const m = new Map<string, SourceTable[]>();
    for (const t of tables) m.set(t.connectionId, [...(m.get(t.connectionId) ?? []), t]);
    return m;
  }, [tables]);

  const extract = async (t: SourceTable) => {
    try {
      await mutations.extract(t.id, user?.email ?? 'Unknown');
      toast.success(`${t.name} extracted.`);
    } catch (err: any) {
      toast.error(err.message ?? 'Extraction failed.');
    }
  };

  const columns: Column<SourceTable>[] = [
    { key: 'name', header: 'Table', render: (t) => <span className="font-mono font-bold text-sm2">{t.name}</span> },
    { key: 'tier', header: 'Tier', render: (t) => <Tag variant="neutral">{t.tier}</Tag> },
    { key: 'records', header: 'Records', numeric: true, render: (t) => fmtNumber(t.records) },
    { key: 'status', header: 'Status', render: (t) => <Tag variant={STATUS_VARIANT[t.status]}>{t.status}</Tag> },
    { key: 'extractedOn', header: 'Extracted On', render: (t) => fmtDateTime(t.extractedOn) },
    { key: 'executedBy', header: 'Executed By', render: (t) => t.executedBy ?? '—' },
    {
      key: 'actions', header: '', frozen: true, width: 100,
      render: (t) => t.status !== 'Extracted' && t.inScope ? (
        <Button variant="ghost" onClick={() => extract(t)}><Download size={13} /> Extract</Button>
      ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {stagingDb && (
        <Card>
          <div className="text-sm2 font-bold uppercase tracking-[.05em] text-muted mb-2">Staging Database</div>
          <div className="grid grid-cols-5 gap-3 text-sm">
            <Field label="Engine">{stagingDb.engine ?? '—'}</Field>
            <Field label="Host"><span className="font-mono">{stagingDb.host ?? '—'}</span></Field>
            <Field label="Schema"><span className="font-mono">{stagingDb.schemaName ?? '—'}</span></Field>
            <Field label="Retention">{stagingDb.retention ?? '—'}</Field>
            <Field label="Last Ingestion">{fmtDateTime(stagingDb.lastIngestion)}</Field>
          </div>
        </Card>
      )}

      {!isLoading && tables.length === 0 ? (
        <EmptyState title="No source tables yet" description="Tables extracted into staging for this wave will list here." />
      ) : (
        Array.from(grouped.entries()).map(([connId, rows]) => (
          <div key={connId}>
            <h3 className="text-lg font-bold mb-2">{connName(connId)}</h3>
            <Table columns={columns} rows={rows} rowKey={(t) => t.id} />
          </div>
        ))
      )}
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

import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { useAllRules } from '../../lib/queries/rules';
import { RuleGeneratorDialog } from './RuleGeneratorDialog';
import type { Rule } from '../../types/entities';

const SEVERITY_VARIANT = { Critical: 'danger', High: 'warn', Medium: 'accent', Low: 'neutral' } as const;
const STATUS_VARIANT = { Draft: 'neutral', 'In Review': 'warn', Approved: 'accent', Rejected: 'danger' } as const;

export function LibraryRules() {
  const { data: rules = [], isLoading } = useAllRules();
  const [generatorOpen, setGeneratorOpen] = useState(false);

  const columns: Column<Rule>[] = [
    { key: 'code', header: 'Rule ID', render: (r) => <span className="font-mono font-bold text-sm2">{r.code}</span> },
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'type', header: 'Type', render: (r) => r.type },
    { key: 'severity', header: 'Severity', render: (r) => <Tag variant={SEVERITY_VARIANT[r.severity]}>{r.severity}</Tag> },
    { key: 'status', header: 'Status', render: (r) => <Tag variant={STATUS_VARIANT[r.status]}>{r.status}</Tag> },
    { key: 'owner', header: 'Owner', render: (r) => r.owner ?? '—' },
  ];

  return (
    <div>
      <PageHeader
        title="Rule" description="Rules across every subproject you have access to."
        actions={<Button variant="secondary" onClick={() => setGeneratorOpen(true)}><Wand2 size={13} /> Rule Generator</Button>}
      />
      {!isLoading && rules.length === 0
        ? <EmptyState title="No rules yet" />
        : <Table columns={columns} rows={rules} rowKey={(r) => r.id} pageSize={30} emptyMessage="Loading…" />}
      <RuleGeneratorDialog open={generatorOpen} onClose={() => setGeneratorOpen(false)} />
    </div>
  );
}

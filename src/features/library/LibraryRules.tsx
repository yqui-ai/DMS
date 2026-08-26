import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Wand2 } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { ListEmptyState } from '../../components/ListEmptyState';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { Toolbar } from '../../components/Toolbar';
import { useLibraryRules, type LibraryRuleRow } from '../../lib/queries/rules';
import { RuleGeneratorDialog } from './RuleGeneratorDialog';

const SEVERITY_VARIANT = { Critical: 'danger', High: 'warn', Medium: 'accent', Low: 'neutral' } as const;
const CLASS_OPTIONS = ['Global', 'Local'];

export function LibraryRules() {
  const { data: rules = [], isLoading } = useLibraryRules();
  const [generatorOpen, setGeneratorOpen] = useState(false);
  // Rule is the one Library screen with no detail view, so a search hit can't open a record —
  // it opens the catalogue already narrowed to it instead, which `?q=` is for.
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [klass, setKlass] = useState<string[]>([]);
  const [severity, setSeverity] = useState<string[]>([]);

  const severities = useMemo(() => Array.from(new Set(rules.map((r) => r.severity))), [rules]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter((r) => {
      if (klass.length > 0 && !klass.includes(r.class)) return false;
      if (severity.length > 0 && !severity.includes(r.severity)) return false;
      if (!q) return true;
      return r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
    });
  }, [rules, query, klass, severity]);

  const hasActiveFilters = query !== '' || klass.length > 0 || severity.length > 0;
  const clearFilters = () => { setQuery(''); setKlass([]); setSeverity([]); };

  const columns: Column<LibraryRuleRow>[] = [
    { key: 'displayId', header: 'ID', width: 110, render: (r) => <span className="font-mono text-sm2">{r.displayId ?? '—'}</span>, sortValue: (r) => r.displayId },
    { key: 'code', header: 'Rule ID', render: (r) => <span className="font-mono font-bold text-sm2">{r.code}</span>, sortValue: (r) => r.code },
    { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
    { key: 'class', header: 'Class', width: 90, render: (r) => r.class, sortValue: (r) => r.class },
    { key: 'reference', header: 'Reference', render: (r) => <span className="font-mono text-sm2">{r.reference}</span>, sortValue: (r) => r.reference },
    { key: 'version', header: 'Version', render: (r) => r.version ?? '—', sortValue: (r) => r.version },
    { key: 'type', header: 'Type', render: (r) => r.type, sortValue: (r) => r.type },
    { key: 'severity', header: 'Severity', render: (r) => <Tag variant={SEVERITY_VARIANT[r.severity]} size="sm">{r.severity}</Tag>, sortValue: (r) => r.severity },
    { key: 'status', header: 'Status', render: (r) => r.status, sortValue: (r) => r.status },
    { key: 'owner', header: 'Owner', render: (r) => r.owner ?? '—', sortValue: (r) => r.owner },
  ];

  return (
    <div>
      <PageHeader title="Rule" description="Rules across every subproject you have access to." />
      <Toolbar
        search={{ value: query, onChange: setQuery, placeholder: 'Search rules…' }}
        onClearFilters={hasActiveFilters ? clearFilters : undefined}
        count={filtered.length} noun="rules"
        actions={<Button variant="quiet" size="sm" onClick={() => setGeneratorOpen(true)}><Wand2 size={14} /> Rule Generator</Button>}
      >
        <MultiSelectFilter label="Class" options={CLASS_OPTIONS} selected={klass} onChange={setKlass} />
        <MultiSelectFilter label="Severity" options={severities} selected={severity} onChange={setSeverity} />
      </Toolbar>
      {!isLoading && filtered.length === 0
        ? <ListEmptyState noun="rules" filtered={hasActiveFilters} onClearFilters={clearFilters} />
        : <Table columns={columns} rows={filtered} rowKey={(r) => r.id} pageSize={30} emptyMessage="Loading…" />}
      <RuleGeneratorDialog open={generatorOpen} onClose={() => setGeneratorOpen(false)} />
    </div>
  );
}

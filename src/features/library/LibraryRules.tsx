import { useMemo, useState } from 'react';
import { Wand2, X } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { ColorTag } from '../../components/ColorTag';
import { GoldenToggle } from '../../components/GoldenToggle';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { ToolbarButton } from '../../components/ToolbarButton';
import { ToolbarSearch } from '../../components/ToolbarSearch';
import { useLibraryRules, type LibraryRuleRow } from '../../lib/queries/rules';
import { RuleGeneratorDialog } from './RuleGeneratorDialog';

const SEVERITY_VARIANT = { Critical: 'danger', High: 'warn', Medium: 'accent', Low: 'neutral' } as const;
const STATUS_VARIANT = { Draft: 'neutral', 'In Review': 'warn', Approved: 'accent', Rejected: 'danger' } as const;
const CLASS_OPTIONS = ['Global', 'Local'];

export function LibraryRules() {
  const { data: rules = [], isLoading } = useLibraryRules();
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [goldenOnly, setGoldenOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [klass, setKlass] = useState<string[]>([]);
  const [severity, setSeverity] = useState<string[]>([]);

  const severities = useMemo(() => Array.from(new Set(rules.map((r) => r.severity))), [rules]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter((r) => {
      if (goldenOnly && r.class !== 'Global') return false;
      if (klass.length > 0 && !klass.includes(r.class)) return false;
      if (severity.length > 0 && !severity.includes(r.severity)) return false;
      if (!q) return true;
      return r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
    });
  }, [rules, query, klass, severity, goldenOnly]);

  const hasActiveFilters = query !== '' || klass.length > 0 || severity.length > 0;
  const clearFilters = () => { setQuery(''); setKlass([]); setSeverity([]); };

  const columns: Column<LibraryRuleRow>[] = [
    { key: 'displayId', header: 'ID', width: 110, render: (r) => <span className="font-mono text-sm2">{r.displayId ?? '—'}</span>, sortValue: (r) => r.displayId },
    { key: 'code', header: 'Rule ID', render: (r) => <span className="font-mono font-bold text-sm2">{r.code}</span>, sortValue: (r) => r.code },
    { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
    { key: 'class', header: 'Class', width: 90, render: (r) => <ColorTag colorKey={r.class}>{r.class}</ColorTag>, sortValue: (r) => r.class },
    { key: 'reference', header: 'Reference', render: (r) => <span className="font-mono text-sm2">{r.reference}</span>, sortValue: (r) => r.reference },
    { key: 'version', header: 'Version', render: (r) => r.version ?? '—', sortValue: (r) => r.version },
    { key: 'type', header: 'Type', render: (r) => r.type, sortValue: (r) => r.type },
    { key: 'severity', header: 'Severity', render: (r) => <Tag variant={SEVERITY_VARIANT[r.severity]}>{r.severity}</Tag>, sortValue: (r) => r.severity },
    { key: 'status', header: 'Status', render: (r) => <Tag variant={STATUS_VARIANT[r.status]}>{r.status}</Tag>, sortValue: (r) => r.status },
    { key: 'owner', header: 'Owner', render: (r) => r.owner ?? '—', sortValue: (r) => r.owner },
  ];

  return (
    <div>
      <PageHeader title="Rule" description="Rules across every subproject you have access to." />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ToolbarSearch value={query} onChange={setQuery} placeholder="Search rules…" />
        <MultiSelectFilter label="Class" options={CLASS_OPTIONS} selected={klass} onChange={setKlass} />
        <MultiSelectFilter label="Severity" options={severities} selected={severity} onChange={setSeverity} />
        {hasActiveFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-red px-2 py-1.5 rounded-[8px] hover:bg-red-light shrink-0">
            <X size={13} /> Clear filters
          </button>
        )}
        <span className="text-sm text-muted ml-1 shrink-0">{filtered.length.toLocaleString()} rules</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <ToolbarButton onClick={() => setGeneratorOpen(true)}><Wand2 size={14} /> Rule Generator</ToolbarButton>
          <GoldenToggle active={goldenOnly} onClick={() => setGoldenOnly((v) => !v)} label="Golden Rule" />
        </div>
      </div>
      {!isLoading && filtered.length === 0
        ? <EmptyState title="No rules yet" />
        : <Table columns={columns} rows={filtered} rowKey={(r) => r.id} pageSize={30} emptyMessage="Loading…" />}
      <RuleGeneratorDialog open={generatorOpen} onClose={() => setGeneratorOpen(false)} />
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { useGoldenLibrary } from '../../lib/queries/goldenLibrary';
import { useDefaultProgram } from '../../lib/queries/programme';
import { fmtDateTime } from '../../lib/format';
import type { GoldenLibraryEntry } from '../../types/entities';

const KIND_VARIANT = { fmd: 'accent', xref: 'connection' } as const;
const KIND_LABEL = { fmd: 'FMD', xref: 'XREF' } as const;

export function GoldenLibraryPage() {
  const { data: program } = useDefaultProgram();
  const { data: entries = [], isLoading } = useGoldenLibrary(program?.id);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q) || (e.reference ?? '').toLowerCase().includes(q));
  }, [entries, query]);

  const columns: Column<GoldenLibraryEntry>[] = [
    { key: 'kind', header: 'Type', render: (e) => <Tag variant={KIND_VARIANT[e.kind]}>{KIND_LABEL[e.kind]}</Tag>, width: 90 },
    { key: 'name', header: 'Name', render: (e) => e.name },
    { key: 'reference', header: 'Reference', render: (e) => e.reference ?? '—' },
    { key: 'version', header: 'Version', render: (e) => e.version ?? '—' },
    { key: 'changedBy', header: 'Last Changed By', render: (e) => e.changedBy ?? e.createdBy ?? '—' },
    { key: 'changedAt', header: 'Last Changed', render: (e) => fmtDateTime(e.changedAt ?? e.createdAt) },
  ];

  return (
    <div>
      <PageHeader title="Golden Library" description="Approved, reusable FMDs and XREF sets promoted for reuse across waves." />
      <div className="relative mb-3 w-72">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search golden library…"
          className="text-sm pl-8 pr-3 py-1.5 rounded-[8px] border border-[#d6dbe2] bg-surface w-full"
        />
      </div>
      {!isLoading && filtered.length === 0 ? (
        <EmptyState title="No golden library entries" description="FMDs and XREF sets promoted to golden status will list here." />
      ) : (
        <Table columns={columns} rows={filtered} rowKey={(e) => e.id} pageSize={30} emptyMessage="Loading…" />
      )}
    </div>
  );
}

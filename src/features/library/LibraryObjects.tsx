import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { PageHeader } from '../../components/PageHeader';
import { useMigrationObjects } from '../../lib/queries/scope';
import type { MigrationObject } from '../../types/entities';

export function LibraryObjects() {
  const { data: objects = [], isLoading } = useMigrationObjects();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return objects;
    return objects.filter((o) =>
      o.objectId.toLowerCase().includes(q) || (o.technicalName ?? '').toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q));
  }, [objects, query]);

  const columns: Column<MigrationObject>[] = [
    { key: 'objectId', header: 'Object ID', render: (o) => <Tag variant="table">{o.objectId}</Tag>, width: 190 },
    { key: 'technicalName', header: 'Technical Name', render: (o) => <span className="font-mono text-sm2">{o.technicalName ?? '—'}</span> },
    { key: 'description', header: 'Description', render: (o) => o.description ?? '—' },
    { key: 'category', header: 'Category', render: (o) => o.category ? <Tag variant="neutral">{o.category}</Tag> : '—' },
    { key: 'approach', header: 'Approach', render: (o) => o.approach ?? '—' },
    { key: 'component', header: 'Component', render: (o) => o.component ? <Tag variant="connection">{o.component}</Tag> : '—' },
  ];

  return (
    <div>
      <PageHeader title="Migration Object" description="Programme-wide SAP migration-object catalogue." />
      <div className="relative mb-3 w-72">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search catalogue…"
          className="text-sm pl-8 pr-3 py-1.5 rounded-[8px] border border-[#d6dbe2] bg-surface w-full"
        />
      </div>
      <Table columns={columns} rows={filtered} rowKey={(o) => o.id} pageSize={30} emptyMessage={isLoading ? 'Loading…' : 'No objects.'} />
    </div>
  );
}

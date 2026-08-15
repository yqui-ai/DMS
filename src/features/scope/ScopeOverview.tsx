import { useParams } from 'react-router-dom';
import { StatStrip } from '../../components/Kpi';
import { Card } from '../../components/Card';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { useMigrationObjects, useSubprojectObjects, useMissingPrerequisites } from '../../lib/queries/scope';
import { useRules } from '../../lib/queries/rules';
import type { MigrationObject } from '../../types/entities';

export function ScopeOverview() {
  const { subprojectId } = useParams();
  const { data: objects = [] } = useMigrationObjects();
  const { data: subprojectObjects = [] } = useSubprojectObjects(subprojectId);
  const { data: missingPrereqs = [] } = useMissingPrerequisites(subprojectId);
  const { data: rules = [] } = useRules(subprojectId);

  const inScope = subprojectObjects.filter((w) => w.inScope);
  const byId = new Map(objects.map((o) => [o.id, o]));
  const rulesActive = rules.filter((r) => r.status === 'Approved').length;

  const rows = inScope
    .map((w) => byId.get(w.migrationObjectId))
    .filter((o): o is MigrationObject => !!o);

  const columns: Column<MigrationObject>[] = [
    { key: 'objectId', header: 'Object ID', render: (o) => <Tag variant="table">{o.objectId}</Tag> },
    { key: 'description', header: 'Description', render: (o) => o.description ?? '—' },
    { key: 'category', header: 'Category', render: (o) => o.category ?? '—' },
    { key: 'component', header: 'Component', render: (o) => o.component ? <Tag variant="connection">{o.component}</Tag> : '—' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <StatStrip
          items={[
            { label: 'Objects in scope', value: inScope.length, accent: 'blue' },
            { label: 'Prerequisites open', value: missingPrereqs.length, accent: missingPrereqs.length ? 'amber' : 'muted' },
            { label: 'FMDs approved', value: 0 },
            { label: 'Rules active', value: rulesActive, accent: 'green' },
          ]}
        />
      </Card>

      <div>
        <h3 className="text-lg font-bold mb-3">In-scope objects</h3>
        <Table columns={columns} rows={rows} rowKey={(o) => o.id} emptyMessage="No objects in scope yet — add some in the Migration Object tab." />
      </div>
    </div>
  );
}

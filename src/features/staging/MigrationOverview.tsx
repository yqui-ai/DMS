import { useParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { StatStrip } from '../../components/Kpi';
import { useSubprojectObjects } from '../../lib/queries/scope';
import { useSourceTables } from '../../lib/queries/staging';
import { useRuns } from '../../lib/queries/runs';

export function MigrationOverview() {
  const { subprojectId } = useParams();
  const { data: subprojectObjects = [] } = useSubprojectObjects(subprojectId);
  const { data: tables = [] } = useSourceTables(subprojectId);
  const { data: runs = [] } = useRuns(subprojectId);

  const inScope = subprojectObjects.filter((w) => w.inScope);
  const extracted = tables.filter((t) => t.status === 'Extracted').length;
  const completed = runs.filter((r) => r.status === 'Completed').length;
  const failed = runs.filter((r) => r.status === 'Failed').length;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <StatStrip
          items={[
            { label: 'Objects in scope', value: inScope.length, accent: 'blue' },
            { label: 'Tables extracted', value: `${extracted}/${tables.length}` },
            { label: 'Runs completed', value: completed, accent: 'green' },
            { label: 'Runs failed', value: failed, accent: failed ? 'red' : 'muted' },
          ]}
        />
      </Card>
      <p className="text-sm text-muted">
        See <strong>Staging Area</strong> for per-connection extraction detail, <strong>Pipelines</strong> for the ETL
        designer, and <strong>Runs</strong> for execution history.
      </p>
    </div>
  );
}

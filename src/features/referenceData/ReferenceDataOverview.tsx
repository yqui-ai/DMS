import { useParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { StatStrip } from '../../components/Kpi';
import { useCheckTables } from '../../lib/queries/referenceData';

export function ReferenceDataOverview() {
  const { subprojectId } = useParams();
  const { data: tables = [] } = useCheckTables(subprojectId);
  const domains = new Set(tables.map((t) => t.domain).filter(Boolean));

  return (
    <Card>
      <StatStrip items={[{ label: 'Check tables', value: tables.length, accent: 'blue' }, { label: 'Domains covered', value: domains.size }]} />
    </Card>
  );
}

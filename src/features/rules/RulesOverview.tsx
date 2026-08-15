import { useParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { StatStrip } from '../../components/Kpi';
import { useRules, useXrefTables } from '../../lib/queries/rules';

export function RulesOverview() {
  const { waveId } = useParams();
  const { data: rules = [] } = useRules(waveId);
  const { data: xrefTables = [] } = useXrefTables(waveId);

  const critical = rules.filter((r) => r.severity === 'Critical').length;
  const approved = rules.filter((r) => r.status === 'Approved').length;
  const inReview = rules.filter((r) => r.status === 'In Review').length;

  return (
    <Card>
      <StatStrip
        items={[
          { label: 'Total rules', value: rules.length, accent: 'blue' },
          { label: 'Approved', value: approved, accent: 'green' },
          { label: 'In review', value: inReview, accent: 'amber' },
          { label: 'Critical severity', value: critical, accent: critical ? 'red' : 'muted' },
          { label: 'XREF tables', value: xrefTables.length },
        ]}
      />
    </Card>
  );
}

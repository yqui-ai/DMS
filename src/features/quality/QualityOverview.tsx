import { useParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { StatStrip } from '../../components/Kpi';
import { useDqDimensions, useReconciliation, useFallout } from '../../lib/queries/quality';

export function QualityOverview() {
  const { waveId } = useParams();
  const { data: dimensions = [] } = useDqDimensions(waveId);
  const { data: reconciliation = [] } = useReconciliation(waveId);
  const { data: fallout = [] } = useFallout(waveId);

  const withinThreshold = dimensions.filter((d) => d.threshold != null && d.actual != null && d.actual >= d.threshold).length;

  return (
    <Card>
      <StatStrip
        items={[
          { label: 'DQ dimensions', value: dimensions.length },
          { label: 'Within threshold', value: `${withinThreshold}/${dimensions.length}`, accent: 'green' },
          { label: 'Reconciliations', value: reconciliation.length },
          { label: 'Fallout records', value: fallout.length, accent: fallout.length ? 'amber' : 'muted' },
        ]}
      />
    </Card>
  );
}

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useSubproject } from '../../lib/queries/programme';
import { ProgramGantt } from './ProgramGantt';
import { ConfigureTimelineDialog } from './ConfigureTimelineDialog';

/** The programme's shape over time, and nothing else yet.
 *
 * What used to be here reported on sections that are not built — execution runs, cutover readiness,
 * data-quality blockers — so most of it read as zero regardless of what the subproject was doing. A
 * dashboard whose numbers are structurally zero is worse than no dashboard: it invites people to
 * trust a health score assembled from features that do not exist.
 *
 * The timeline is the one thing this screen can say truthfully today, because it is drawn from
 * dates the hierarchy already carries rather than from work that has not happened. */
export function DashboardPage() {
  const { programId, subprojectId } = useParams();
  const [configuring, setConfiguring] = useState(false);
  const { data: subproject } = useSubproject(subprojectId);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        description={subproject
          ? `${subproject.name} — where this subproject sits in the programme.`
          : undefined}
        actions={
          /* Opens here rather than navigating to a settings tab. The timeline is edited while
             looking at it — you move a freeze date because of where it sits on the chart, and a
             round trip to another screen and back loses exactly that context. */
          <Button variant="secondary" onClick={() => setConfiguring(true)}>
            <SlidersHorizontal size={14} /> Configure timeline
          </Button>
        }
      />

      <Card>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <span className="text-sm2 font-bold uppercase tracking-[.05em] text-muted">Programme timeline</span>
          <span className="text-2xs text-muted">
            Drawn from the dates on each program, project, subproject and cycle.
          </span>
        </div>
        <ProgramGantt programId={programId} highlightSubprojectId={subprojectId} />
      </Card>

      <ConfigureTimelineDialog
        open={configuring}
        programId={programId}
        onClose={() => setConfiguring(false)}
      />
    </div>
  );
}

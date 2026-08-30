import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarDays, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { useSubproject } from '../../lib/queries/programme';
import { ProgramGantt } from './ProgramGantt';
import { ConfigureTimelineDialog } from './ConfigureTimelineDialog';
import { TimelineSpanDialog } from './TimelineSpanDialog';
import { useProgramTimeline, type Span } from './programTimeline';

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
  const [pickingSpan, setPickingSpan] = useState(false);
  const { data: subproject } = useSubproject(subprojectId);

  /* Null means "fit to the data", which is the right thing to open on and the wrong thing to be
     stuck with. Once someone picks a span it is theirs until they change it — the chart no longer
     jumps because a date moved somewhere else in the programme. Held here rather than persisted:
     it is how you are reading the chart right now, not a property of the programme. */
  const [span, setSpan] = useState<Span | null>(null);
  /* On by default. Weeks are the unit migration work is actually planned in — a load window is
     "the week of the 12th", not "sometime in March" — so the chart should arrive ruled in them.
     Off by default meant the stripes only existed for someone who went looking in Calendar for a
     setting they had no reason to expect. */
  const [showWeekBands, setShowWeekBands] = useState(true);

  // Same hook the chart uses, so the Calendar dialog opens on exactly the window that is on screen.
  const { autoSpan } = useProgramTimeline(programId, subprojectId);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Timeline"
        description={subproject
          ? `${subproject.name} — where this subproject sits in the programme.`
          : 'Program-level plan, drawn from the dates on each project, subproject and cycle.'}
        actions={
          <div className="flex items-center gap-2">
            {/* Two different jobs, deliberately not one dialog: Calendar changes what you are
                LOOKING at, Configure changes what the programme IS. Folding a view control into
                the editor would make every re-scale look like an edit. */}
            <Button variant="secondary" onClick={() => setPickingSpan(true)}>
              <CalendarDays size={14} /> Calendar
            </Button>
            <Button variant="secondary" onClick={() => setConfiguring(true)}>
              <SlidersHorizontal size={14} /> Configure
            </Button>
          </div>
        }
      />

      <ProgramGantt
        programId={programId}
        highlightSubprojectId={subprojectId}
        span={span}
        showWeekBands={showWeekBands}
      />

      <TimelineSpanDialog
        open={pickingSpan}
        span={span ?? autoSpan}
        showWeekBands={showWeekBands}
        onApply={(next, bands) => { setSpan(next); setShowWeekBands(bands); }}
        onClose={() => setPickingSpan(false)}
      />

      <ConfigureTimelineDialog
        open={configuring}
        programId={programId}
        onClose={() => setConfiguring(false)}
      />
    </div>
  );
}

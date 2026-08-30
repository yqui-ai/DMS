import { useParams } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { useSubproject } from '../../lib/queries/programme';

/** Deliberately empty, pending a rebuild.
 *
 * What was here reported on sections that are not built yet — execution runs, cutover readiness,
 * data-quality blockers — so most of it read as zero regardless of what the subproject was doing.
 * A dashboard whose numbers are structurally zero is worse than no dashboard: it invites people to
 * trust a health score assembled from features that do not exist.
 *
 * The pieces it used are not deleted. `TimelineGantt` still lives beside this file, and the queries
 * it read (useSubprojectObjects, useRules, useRuns, useCutoverTasks) are all still exported and
 * used elsewhere — so rebuilding is a matter of choosing what to show, not re-deriving it. Timeline
 * categories and entries are still maintained in Program Admin › Timelines. */
export function DashboardPage() {
  const { subprojectId } = useParams();
  const { data: subproject } = useSubproject(subprojectId);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        description={subproject ? `${subproject.name} — programme health and open items.` : undefined}
      />
      <EmptyState
        icon={<LayoutDashboard size={22} />}
        title="Dashboard is being rebuilt"
        description="It will report on this subproject once the sections it draws from are built. Scope, Field Mapping and the Library are all working in the meantime."
      />
    </div>
  );
}

import { useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { StatStrip } from '../../components/Kpi';
import { EmptyState } from '../../components/EmptyState';
import { useWave } from '../../lib/queries/programme';
import { useWaveObjects } from '../../lib/queries/scope';
import { useRules } from '../../lib/queries/rules';
import { useRuns } from '../../lib/queries/runs';
import { useCutoverTasks } from '../../lib/queries/cutover';
import { TimelineGantt } from './TimelineGantt';

export function DashboardPage() {
  const { waveId } = useParams();
  const [params] = useSearchParams();
  const env = params.get('env') ?? 'DEV';
  const { data: wave } = useWave(waveId);
  const { data: waveObjects = [] } = useWaveObjects(waveId);
  const { data: rules = [] } = useRules(waveId);
  const { data: runs = [] } = useRuns(waveId);
  const { data: cutoverTasks = [] } = useCutoverTasks(waveId);

  const inScope = waveObjects.filter((w) => w.inScope).length;
  const rulesActive = rules.filter((r) => r.status === 'Approved').length;
  const failedRuns = runs.filter((r) => r.status === 'Failed').length;
  const openBlockers = failedRuns;
  const cutoverDone = cutoverTasks.filter((t) => t.status === 'Done').length;
  const cutoverReadiness = cutoverTasks.length ? Math.round((cutoverDone / cutoverTasks.length) * 100) : 0;
  const healthScore = Math.max(0, 100 - openBlockers * 15 - (wave?.scopeFinalized ? 0 : 20));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Dashboard" description={wave ? `${wave.name} — programme health and open items.` : undefined} />

      <Card>
        <div className="flex items-center gap-8">
          <div className="relative w-24 h-24 shrink-0 grid place-items-center">
            <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
              <circle cx="18" cy="18" r="16" fill="none" stroke="var(--line)" strokeWidth="3.5" />
              <circle
                cx="18" cy="18" r="16" fill="none" stroke={healthScore >= 70 ? '#15803d' : healthScore >= 40 ? '#e2a900' : '#da291c'}
                strokeWidth="3.5" strokeDasharray={`${(healthScore / 100) * 100.5} 100.5`} strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-xl font-bold">{healthScore}</span>
          </div>
          <div>
            <div className="text-lg font-bold text-text">Program health: {healthScore >= 70 ? 'On Track' : healthScore >= 40 ? 'At Risk' : 'Critical'}</div>
            <div className="text-sm text-muted mt-1">{openBlockers} open blocker{openBlockers === 1 ? '' : 's'}</div>
            <div className="mt-3">
              <StatStrip
                items={[
                  { label: 'Schedule', value: wave?.scopeFinalized ? 'On track' : 'Scoping' },
                  { label: 'Execution', value: `${runs.length - failedRuns}/${runs.length || 0}` },
                  { label: 'Open blockers', value: openBlockers, accent: openBlockers ? 'red' : 'green' },
                  { label: 'Cutover readiness', value: `${cutoverReadiness}%` },
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <StatStrip
          items={[
            { label: 'Objects in scope', value: inScope, accent: 'blue' },
            { label: 'FMDs approved', value: 0 },
            { label: 'Rules active', value: rulesActive, accent: 'green' },
          ]}
        />
      </Card>

      <TimelineGantt />

      {env === 'DEV' && (
        <p className="text-sm text-muted bg-blue-pale rounded-[8px] px-3.5 py-2.5">
          Execution summary appears once this SubProject is running in QSA or Prod — DEV is design-only.
        </p>
      )}

      {failedRuns > 0 ? (
        <div>
          <h3 className="text-lg font-bold mb-2">Blockers</h3>
          <div className="rounded-lg shadow-card bg-surface divide-y divide-line">
            {runs.filter((r) => r.status === 'Failed').map((r) => (
              <div key={r.id} className="px-4 py-2.5 text-sm flex items-center justify-between">
                <span className="font-mono font-bold">{r.code}</span>
                <span className="text-red">Failed</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="No blockers" description="Nothing is currently blocking this wave." />
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import clsx from 'clsx';
import { EmptyState } from '../../components/EmptyState';
import { Tag } from '../../components/Tag';
import { useMigrationObjects, useSubprojectObjects } from '../../lib/queries/scope';
import { useRuns } from '../../lib/queries/runs';
import { APPROACH_TEMPLATES } from './approachTemplates';
import { ObjectDetailDialog } from '../scope/ObjectDetailDialog';
import type { MigrationObject, Run, SubprojectApproach } from '../../types/entities';

interface StageState { label: string; state: 'done' | 'failed' | 'running' | 'idle' }
interface PipeState { stages: StageState[]; statusLabel: string; variant: 'accent' | 'danger' | 'warn' | 'neutral' }

function computePipeState(approach: SubprojectApproach | undefined, run: Run | undefined): PipeState {
  const tmpl = APPROACH_TEMPLATES[approach ?? 'M_ADMC'];
  const n = tmpl.stages.length;
  let doneCount = 0, failIdx = -1, runIdx = -1;
  if (run?.status === 'Completed' || run?.status === 'Completed with rejects') doneCount = n;
  else if (run?.status === 'Failed') { doneCount = Math.max(1, n - 3); failIdx = doneCount; }
  else if (run) { doneCount = Math.max(1, n - 2); runIdx = doneCount; }

  const stages: StageState[] = tmpl.stages.map((label, i) => ({
    label,
    state: i < doneCount ? 'done' : i === failIdx ? 'failed' : i === runIdx ? 'running' : 'idle',
  }));
  const statusLabel = !run ? 'Not started' : run.status === 'Failed' ? 'Failed' : doneCount >= n ? 'Completed' : 'In progress';
  const variant: PipeState['variant'] = statusLabel === 'Completed' ? 'accent' : statusLabel === 'Failed' ? 'danger' : statusLabel === 'In progress' ? 'warn' : 'neutral';
  return { stages, statusLabel, variant };
}

const DOT_COLOR = { done: 'bg-blue', failed: 'bg-red', running: 'bg-amber-ink', idle: 'bg-neutralTag-bg' } as const;

export function PipelineStages() {
  const { subprojectId } = useParams();
  const { data: objects = [] } = useMigrationObjects();
  const { data: subprojectObjects = [] } = useSubprojectObjects(subprojectId);
  const { data: runs = [] } = useRuns(subprojectId);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MigrationObject | null>(null);

  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const inScope = subprojectObjects.filter((w) => w.inScope);
  const latestRunByObject = useMemo(() => {
    const m = new Map<string, Run>();
    for (const r of runs) {
      if (!r.migrationObjectId) continue;
      const cur = m.get(r.migrationObjectId);
      if (!cur || (r.startedAt ?? '') > (cur.startedAt ?? '')) m.set(r.migrationObjectId, r);
    }
    return m;
  }, [runs]);

  const rows = inScope
    .map((w) => ({ obj: byId.get(w.migrationObjectId), approach: w.approach, run: latestRunByObject.get(w.migrationObjectId) }))
    .filter((r): r is { obj: MigrationObject; approach: SubprojectApproach | undefined; run: Run | undefined } => !!r.obj)
    .filter((r) => !query || r.obj.objectId.toLowerCase().includes(query.toLowerCase()) || (r.obj.description ?? '').toLowerCase().includes(query.toLowerCase()));

  if (inScope.length === 0) {
    return <EmptyState title="No objects in scope yet" description="Add objects to scope to see their migration pipeline stage." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-72">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search objects…" className="text-sm2 pl-8 pr-3 py-1.5 rounded-[8px] border border-line-strong bg-surface w-full" />
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map(({ obj, approach, run }) => {
          const ps = computePipeState(approach, run);
          return (
            <button
              key={obj.id} onClick={() => setSelected(obj)}
              className="text-left bg-surface rounded-lg shadow-card p-4 hover:shadow-cardHover transition-shadow"
            >
              <div className="flex items-center gap-2 mb-3">
                <Tag variant="table">{obj.objectId}</Tag>
                <span className="text-sm2 text-text truncate flex-1">{obj.description ?? '—'}</span>
                <Tag variant={ps.variant}>{ps.statusLabel}</Tag>
              </div>
              <div className="flex items-center">
                {ps.stages.map((stage, i) => (
                  <div key={i} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <span className={clsx('w-3 h-3 rounded-full shrink-0', DOT_COLOR[stage.state])} />
                      <span className="text-2xs text-muted whitespace-nowrap">{stage.label}</span>
                    </div>
                    {i < ps.stages.length - 1 && <div className={clsx('h-px flex-1 mx-1.5', stage.state === 'done' ? 'bg-blue' : 'bg-line')} />}
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <ObjectDetailDialog object={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

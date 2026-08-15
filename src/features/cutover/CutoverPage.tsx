import { useParams } from 'react-router-dom';
import { CheckCircle2, Circle, CircleDashed, CircleSlash } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { useCutoverTasks, useCutoverMutations } from '../../lib/queries/cutover';
import { fmtDateTime } from '../../lib/format';
import type { CutoverTask } from '../../types/entities';

const STATUS_CYCLE: CutoverTask['status'][] = ['Not Started', 'In Progress', 'Done', 'Blocked'];
const STATUS_ICON = {
  'Not Started': <CircleDashed size={16} className="text-muted" />,
  'In Progress': <Circle size={16} className="text-amber-ink fill-amber-bg" />,
  Done: <CheckCircle2 size={16} className="text-green" />,
  Blocked: <CircleSlash size={16} className="text-red" />,
};

export function CutoverPage() {
  const { waveId } = useParams();
  const toast = useToast();
  const { data: tasks = [], isLoading } = useCutoverTasks(waveId);
  const mutations = useCutoverMutations(waveId!);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const cycle = async (task: CutoverTask) => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.status) + 1) % STATUS_CYCLE.length];
    try { await mutations.setStatus(task.id, next); }
    catch (err: any) { toast.error(err.message ?? 'Could not update task.'); }
  };

  const done = tasks.filter((t) => t.status === 'Done').length;

  return (
    <div>
      <PageHeader
        title="Cutover"
        description={tasks.length ? `${done} of ${tasks.length} tasks done. Click a status icon to advance it.` : undefined}
      />
      {!isLoading && tasks.length === 0 ? (
        <EmptyState title="No cutover plan yet" description="Tasks for this wave's cutover will list here." />
      ) : (
        <div className="rounded-lg shadow-card bg-surface divide-y divide-line">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => cycle(task)} title={task.status} className="shrink-0">
                {STATUS_ICON[task.status]}
              </button>
              <div className="min-w-0 flex-1">
                <div className={clsx('font-semibold text-sm', task.status === 'Done' && 'line-through text-muted')}>{task.name}</div>
                <div className="text-2xs text-muted">
                  {task.owner ?? 'Unassigned'}
                  {task.dependsOn && byId.get(task.dependsOn) && <> · depends on {byId.get(task.dependsOn)!.name}</>}
                </div>
              </div>
              <div className="text-2xs text-muted shrink-0 text-right">
                {task.plannedStart && <div>{fmtDateTime(task.plannedStart)}</div>}
                {task.plannedEnd && <div>→ {fmtDateTime(task.plannedEnd)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

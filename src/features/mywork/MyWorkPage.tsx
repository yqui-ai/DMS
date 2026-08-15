import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { Tag } from '../../components/Tag';
import { usePromotions } from '../../lib/queries/jobMonitor';
import { useRuns } from '../../lib/queries/runs';
import { useMissingPrerequisites } from '../../lib/queries/scope';
import { fmtDateTime } from '../../lib/format';

interface WorkItem { id: string; label: string; context: string; state: string; variant: 'accent' | 'warn' | 'danger' | 'neutral'; onClick?: () => void }

function WorkCard({ title, items }: { title: string; items: WorkItem[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-lg font-bold">{title}</h3>
        <Tag variant="neutral">{items.length}</Tag>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Nothing here" description="You're all caught up." />
      ) : (
        <div className="rounded-lg shadow-card bg-surface divide-y divide-line">
          {items.map((item) => (
            <button
              key={item.id} onClick={item.onClick}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-blue-pale disabled:hover:bg-transparent"
              disabled={!item.onClick}
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm text-text truncate">{item.label}</div>
                <div className="text-2xs text-muted truncate">{item.context}</div>
              </div>
              <Tag variant={item.variant}>{item.state}</Tag>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MyWorkPage() {
  const { projectId, waveId } = useParams();
  const navigate = useNavigate();
  const { data: promotions = [] } = usePromotions(waveId);
  const { data: runs = [] } = useRuns(waveId);
  const { data: missingPrereqs = [] } = useMissingPrerequisites(waveId);

  const awaitingApproval: WorkItem[] = promotions
    .filter((p) => p.status === 'Pending')
    .map((p) => ({
      id: p.id, label: p.artefactName ?? p.artefactType, context: `${p.fromEnv ?? '?'} → ${p.toEnv ?? '?'} · requested by ${p.requestedBy ?? 'someone'}`,
      state: 'Pending', variant: 'warn', onClick: () => navigate(`/p/${projectId}/w/${waveId}/promotions`),
    }));

  const blockers: WorkItem[] = runs
    .filter((r) => r.status === 'Failed')
    .map((r) => ({
      id: r.id, label: r.code, context: `Failed run${r.startedAt ? ` · ${fmtDateTime(r.startedAt)}` : ''}`,
      state: 'Failed', variant: 'danger', onClick: () => navigate(`/p/${projectId}/w/${waveId}/migration/runs/${r.id}`),
    }));

  const openItems: WorkItem[] = missingPrereqs.map((m, i) => ({
    id: String(i), label: m.object, context: `Requires ${m.requires} — not yet in scope`,
    state: 'Open', variant: 'accent', onClick: () => navigate(`/p/${projectId}/w/${waveId}/scope/objects`),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My Work" description="Open items, approvals and blockers across this wave." />
      <WorkCard title="My open items" items={openItems} />
      <WorkCard title="Awaiting my approval" items={awaitingApproval} />
      <WorkCard title="Blockers assigned to me" items={blockers} />
    </div>
  );
}

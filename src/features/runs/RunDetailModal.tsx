import { useNavigate, useParams } from 'react-router-dom';
import { Dialog } from '../../components/Dialog';
import { Tag } from '../../components/Tag';
import { useRun, useRunLog } from '../../lib/queries/runs';
import { useMigrationObjects } from '../../lib/queries/scope';
import { fmtDateTime, fmtDuration, fmtNumber } from '../../lib/format';

const STATUS_VARIANT = { Running: 'warn', Completed: 'accent', 'Completed with rejects': 'warn', Failed: 'danger' } as const;

export function RunDetailModal() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { data: run } = useRun(runId);
  const { data: log = [] } = useRunLog(runId);
  const { data: objects = [] } = useMigrationObjects();
  const objLabel = run?.migrationObjectId ? objects.find((o) => o.id === run.migrationObjectId)?.objectId : undefined;

  return (
    <Dialog open={!!run} onClose={() => navigate('..')} title={run?.code ?? ''} size="lg">
      {run && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-3 text-sm2">
            <Field label="Object"><span className="font-mono">{objLabel ?? '—'}</span></Field>
            <Field label="Status"><Tag variant={STATUS_VARIANT[run.status]}>{run.status}</Tag></Field>
            <Field label="Mode">{run.mode ?? '—'}</Field>
            <Field label="Environment">{run.env ?? '—'}</Field>
            <Field label="Iteration">{run.iteration}</Field>
            <Field label="Target">{run.target ?? '—'}</Field>
            <Field label="Approach">{run.approach ?? '—'}</Field>
            <Field label="Run by">{run.runBy ?? '—'}</Field>
            <Field label="Started">{fmtDateTime(run.startedAt)}</Field>
            <Field label="Duration">{fmtDuration(run.durationS)}</Field>
            <Field label="Source rows">{fmtNumber(run.srcCount)}</Field>
            <Field label="Target rows">{fmtNumber(run.tgtCount)}</Field>
            <Field label="Rejects">{fmtNumber(run.rejCount)}</Field>
          </div>

          <div>
            <div className="text-sm2 font-semibold text-muted mb-1.5">Version snapshot</div>
            <div className="flex flex-wrap gap-2">
              {run.fmdVersion && <Tag variant="neutral">FMD {run.fmdVersion}</Tag>}
              {run.rulesVersion && <Tag variant="neutral">Rules {run.rulesVersion}</Tag>}
              {run.xrefVersion && <Tag variant="neutral">XREF {run.xrefVersion}</Tag>}
              {run.stagingSnapshot && <Tag variant="neutral">Staging {run.stagingSnapshot}</Tag>}
              {!run.fmdVersion && !run.rulesVersion && !run.xrefVersion && !run.stagingSnapshot && <span className="text-sm2 text-muted">No version snapshot captured.</span>}
            </div>
          </div>

          {log.length > 0 && (
            <div>
              <div className="text-sm2 font-semibold text-muted mb-1.5">Log</div>
              <pre className="font-mono text-2xs bg-surface-2 rounded-[8px] p-3 max-h-64 overflow-auto whitespace-pre-wrap">
                {log.map((l) => l.line).filter(Boolean).join('\n') || 'No trace captured.'}
              </pre>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs font-semibold uppercase tracking-[.04em] text-muted mb-0.5">{label}</div>
      <div>{children}</div>
    </div>
  );
}

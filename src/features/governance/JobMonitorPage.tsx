import { useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { StatDot } from '../../components/StatDot';
import { useRuns } from '../../lib/queries/runs';
import { useExtractionJobs } from '../../lib/queries/staging';
import { fmtDateTime } from '../../lib/format';
import type { ExtractionJob, Run } from '../../types/entities';

const RUN_DOT = { Running: 'running', Completed: 'ok', 'Completed with rejects': 'ok', Failed: 'error' } as const;
const JOB_DOT = { Running: 'running', Success: 'ok', Idle: 'idle', Failed: 'error' } as const;

export function JobMonitorPage() {
  const { subprojectId } = useParams();
  const { data: runs = [], isLoading: loadingRuns } = useRuns(subprojectId);
  const { data: jobs = [], isLoading: loadingJobs } = useExtractionJobs(subprojectId);

  const runColumns: Column<Run>[] = [
    { key: 'dot', header: '', width: 24, render: (r) => <StatDot state={RUN_DOT[r.status]} /> },
    { key: 'code', header: 'Run', render: (r) => <span className="font-mono font-bold text-sm2">{r.code}</span> },
    { key: 'started', header: 'Started', render: (r) => fmtDateTime(r.startedAt) },
    { key: 'status', header: 'Status', render: (r) => <Tag variant="neutral">{r.status}</Tag> },
  ];

  const jobColumns: Column<ExtractionJob>[] = [
    { key: 'dot', header: '', width: 24, render: (j) => <StatDot state={JOB_DOT[j.status]} /> },
    { key: 'name', header: 'Job', render: (j) => <span className="font-mono font-bold text-sm2">{j.name}</span> },
    { key: 'schedule', header: 'Schedule', render: (j) => j.schedule ?? '—' },
    { key: 'lastRun', header: 'Last Run', render: (j) => fmtDateTime(j.lastRun) },
    { key: 'status', header: 'Status', render: (j) => <Tag variant="neutral">{j.status}</Tag> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Job Monitor" description="Live, queued and failed jobs across runs and extractions." />

      <div>
        <h3 className="text-md font-bold mb-2">Runs</h3>
        {!loadingRuns && runs.length === 0
          ? <EmptyState title="No runs yet" />
          : <Table columns={runColumns} rows={runs} rowKey={(r) => r.id} />}
      </div>

      <div>
        <h3 className="text-md font-bold mb-2">Extraction jobs</h3>
        {!loadingJobs && jobs.length === 0
          ? <EmptyState title="No extraction jobs yet" />
          : <Table columns={jobColumns} rows={jobs} rowKey={(j) => j.id} />}
      </div>
    </div>
  );
}

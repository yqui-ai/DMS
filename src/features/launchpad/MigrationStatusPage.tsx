import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { useProgramStatus, type ProgramStatus } from '../../lib/queries/launchpad';

/** The portfolio, for the people accountable for it rather than the people doing it.
 *
 * Two halves, deliberately side by side. Progress answers "how far along are we"; risk answers
 * "what is going wrong". Either alone misleads — a program can be 90% mapped and completely stuck,
 * or have no open findings because nobody has reviewed anything yet.
 *
 * Read-only, with no drill-down into the working screens. Someone watching twenty programs is not
 * about to fix a field mapping, and a link that drops them into one is an invitation to change
 * something they don't have the context for. */
export function MigrationStatusPage() {
  const { data: programs = [], isLoading } = useProgramStatus();

  const totals = useMemo(() => programs.reduce((acc, p) => ({
    inScope: acc.inScope + p.objectsInScope,
    loaded: acc.loaded + p.objectsLoaded,
    findings: acc.findings + p.openFindings,
    prereqs: acc.prereqs + p.missingPrereqs,
    failed: acc.failed + p.failedRuns7d,
  }), { inScope: 0, loaded: 0, findings: 0, prereqs: 0, failed: 0 }), [programs]);

  return (
    <div>
      <PageHeader
        title="Migration Status"
        description="Progress and outstanding risk across every program you can see. Read-only."
      />

      {isLoading ? (
        <p className="text-sm2 text-muted py-16 text-center">Loading…</p>
      ) : programs.length === 0 ? (
        <EmptyState
          title="No programs to report on"
          description="You need a membership on a program before its status appears here."
        />
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Total n={programs.length} label={programs.length === 1 ? 'program' : 'programs'} />
            <Total n={totals.inScope} label="objects in scope" />
            <Total n={totals.loaded} label="loaded" />
            <Total n={totals.findings} label="open findings" warn={totals.findings > 0} />
            <Total n={totals.prereqs} label="missing prerequisites" warn={totals.prereqs > 0} />
            {totals.failed > 0 && <Total n={totals.failed} label="failed runs (7d)" warn />}
          </div>

          <div className="flex flex-col gap-3">
            {programs.map((p) => <ProgramCard key={p.programId} program={p} />)}
          </div>
        </>
      )}
    </div>
  );
}

function ProgramCard({ program: p }: { program: ProgramStatus }) {
  const risks = [
    { n: p.openErrors, label: p.openErrors === 1 ? 'review error' : 'review errors', severe: true },
    { n: p.openFindings - p.openErrors, label: 'warnings', severe: false },
    { n: p.missingPrereqs, label: p.missingPrereqs === 1 ? 'missing prerequisite' : 'missing prerequisites', severe: true },
    { n: p.failedRuns7d, label: 'failed runs (7d)', severe: true },
  ].filter((r) => r.n > 0);

  return (
    <section className="rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--line)] p-4">
      <div className="flex items-baseline gap-2.5 flex-wrap mb-3">
        <span className="text-sm2 font-mono font-bold text-blue-deep">{p.code}</span>
        <span className="text-md font-bold text-text">{p.name}</span>
        <span className="text-2xs text-muted ml-auto tabular-nums">
          {p.objectsInScope.toLocaleString()} object{p.objectsInScope === 1 ? '' : 's'} in scope
        </span>
      </div>

      {p.objectsInScope === 0 ? (
        <p className="text-sm2 text-muted py-2">Nothing in scope yet — the scope wizard hasn't been run.</p>
      ) : (
        <div className="flex gap-6 flex-wrap">
          {/* Progress: each stage as a share of what's in scope, so the bars are directly
              comparable and always shorten left to right. */}
          <div className="flex-1 min-w-[280px] flex flex-col gap-1.5">
            <Stage label="Scoped" n={p.objectsInScope} of={p.objectsInScope} />
            <Stage label="Mapped" n={p.objectsMapped} of={p.objectsInScope} />
            <Stage label="FMD live" n={p.objectsFmdLive} of={p.objectsInScope} />
            <Stage label="Loaded" n={p.objectsLoaded} of={p.objectsInScope} />
          </div>

          <div className="w-[240px] shrink-0 flex flex-col gap-1">
            {risks.length === 0 ? (
              <p className="text-2xs text-green flex items-center gap-1.5">
                <CheckCircle2 size={13} /> Nothing outstanding
              </p>
            ) : risks.map((r) => (
              <p
                key={r.label}
                className={clsx('text-2xs flex items-center gap-1.5', r.severe ? 'text-red-ink' : 'text-amber-ink')}
              >
                <AlertTriangle size={12} className="shrink-0" />
                <span className="font-bold tabular-nums">{r.n.toLocaleString()}</span> {r.label}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** One stage of the pipeline as a share of scope. `of` is always objects-in-scope, never the
 * previous stage — a percentage that shifts its own denominator can go up when nothing improved. */
function Stage({ label, n, of }: { label: string; n: number; of: number }) {
  const pct = of === 0 ? 0 : Math.round((n / of) * 100);
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-2xs text-muted w-[60px] shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-pill bg-surface-2 overflow-hidden min-w-[80px]">
        <div className="h-full rounded-pill bg-blue" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-2xs text-text font-semibold tabular-nums w-[76px] shrink-0 text-right">
        {n.toLocaleString()} <span className="text-muted font-normal">· {pct}%</span>
      </span>
    </div>
  );
}

function Total({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5 rounded border border-line bg-surface px-3 py-1.5">
      <span className={clsx('text-md font-bold tabular-nums', warn ? 'text-amber-ink' : 'text-text')}>
        {n.toLocaleString()}
      </span>
      <span className="text-2xs text-muted">{label}</span>
    </div>
  );
}

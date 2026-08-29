import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from 'lucide-react';
import { Pane } from '../../../components/Pane';
import { Tag } from '../../../components/Tag';
import { Segmented } from '../../../components/Segmented';
import { fmtDateTime } from '../../../lib/format';
import { analyseFmd, type CheckStatus, type HealthCheck } from '../../../lib/fmdHealth';
import { MAPPING_EFFORT_WEIGHTS } from '../../../lib/mappingRulePolicy';
import { Button } from '../../../components/Button';
import { SyncGoldenFmdDialog } from '../SyncGoldenFmdDialog';
import type { LibraryFmdRow } from '../../../lib/queries/fmds';
import type { FmdFieldNote, FmdVersion, GoldenFmdStructure } from '../../../types/entities';

/** Spelled out from the weights themselves, so the explanation can't drift from the arithmetic. */
const EFFORT_LEGEND = [
  `Copy ${MAPPING_EFFORT_WEIGHTS.COPY}`,
  `Default ${MAPPING_EFFORT_WEIGHTS.DEFAULT}`,
  `Simple ${MAPPING_EFFORT_WEIGHTS.TRANSFORM_Simple}`,
  `XREF ${MAPPING_EFFORT_WEIGHTS.XREF}`,
  `Complex ${MAPPING_EFFORT_WEIGHTS.TRANSFORM_Complex}`,
].join(' · ');

const STATUS: Record<CheckStatus, { icon: typeof CheckCircle2; className: string }> = {
  pass: { icon: CheckCircle2, className: 'text-green' },
  warn: { icon: AlertTriangle, className: 'text-amber-ink' },
  fail: { icon: XCircle, className: 'text-red' },
};

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="min-w-[66px]">
      <div className={clsx('text-xl font-bold tabular-nums leading-none', accent ?? 'text-text')}>{value}</div>
      <div className="text-2xs text-muted mt-1 whitespace-nowrap">{label}</div>
    </div>
  );
}

/** A named set of related numbers, sharing the strip's width evenly.
 *
 * Equal tiles in a row asked the reader to work out for themselves that "Fields" and "Open points"
 * answer completely different questions. Four groups, four questions: how big is it, how much is in
 * play, what will it cost, what is still open. */
function Group({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[180px] px-4 first:pl-0 last:pr-0 border-l border-line first:border-l-0">
      <div className="text-2xs font-bold uppercase tracking-[.05em] text-muted mb-2">{label}</div>
      <div className="flex gap-5 flex-wrap">{children}</div>
      {note && <div className="text-2xs text-muted mt-2">{note}</div>}
    </div>
  );
}

/** A proportion, as a bar only when there is a proportion to show.
 *
 * A single value rendered as a full-width bar of one colour is a rectangle that says nothing — it
 * reads as an alarm and carries no more information than the number beside it. */
function Breakdown({ title, parts }: { title: string; parts: { label: string; n: number; className: string }[] }) {
  const total = parts.reduce((n, p) => n + p.n, 0);
  const shown = parts.filter((p) => p.n > 0);
  return (
    <div>
      <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1.5">{title}</div>
      {total === 0 ? (
        <p className="text-sm2 text-muted">Nothing to measure.</p>
      ) : (
        <>
          {shown.length > 1 && (
            <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-2 mb-2">
              {shown.map((p) => (
                <div key={p.label} className={p.className} style={{ width: `${(p.n / total) * 100}%` }} title={`${p.label}: ${p.n}`} />
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {shown.map((p) => (
              <span key={p.label} className="text-2xs text-muted flex items-center gap-1.5">
                <span className={clsx('w-2 h-2 rounded-full shrink-0', p.className)} />
                {p.label}
                <span className="font-semibold text-text tabular-nums">{p.n}</span>
                <span className="tabular-nums">({Math.round((p.n / total) * 100)}%)</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** What this FMD looks like as a whole — scope, completeness, the mapping mix and the build effort
 * it implies, and how much review work is still open.
 *
 * Always computed against the LATEST version, never the one selected in the header dropdown: "how
 * healthy is this FMD" is a question about the document as it stands, and answering it from a
 * superseded version someone happened to be browsing would report a state that no longer exists.
 * The header hides the version selector while this tab is open for the same reason.
 *
 * Every number is counted, never inferred — the AI's opinion has its own pane, and a health report
 * nobody can reproduce by counting is one nobody can act on. */
export function FmdHealthTab({ fmd, latest, notes, pendingChanges, versionLabel, goldenStructure, goldenVersionId, goldenVersionLabel }: {
  fmd: LibraryFmdRow;
  latest?: FmdVersion;
  notes: FmdFieldNote[];
  pendingChanges: number;
  versionLabel?: string;
  /** The current Golden template, for the sync assessment. */
  goldenStructure?: GoldenFmdStructure;
  goldenVersionId?: string; goldenVersionLabel?: string;
}) {
  /** Judge the whole document, or only the fields actually being migrated. A field explicitly
   * marked out of scope needs no rule and no target, so grading it drags every number down for work
   * nobody intends to do — but hiding it by default would let an FMD look finished because most of
   * it was excluded. Off by default; the choice is visible. */
  const [inScopeOnly, setInScopeOnly] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  /** Passing checks start folded — they are the proof, not the work. */
  const [showPassing, setShowPassing] = useState(false);
  const health = useMemo(
    () => analyseFmd(latest, notes, pendingChanges, inScopeOnly),
    [latest, notes, pendingChanges, inScopeOnly],
  );

  if (!health) {
    return <p className="text-sm2 text-muted py-16 text-center">This FMD has no generated mapping data to analyse.</p>;
  }

  const failing = health.checks.filter((c) => c.status === 'fail').length;
  const warning = health.checks.filter((c) => c.status === 'warn').length;
  const passing = health.checks.filter((c) => c.status === 'pass');
  const filled = health.blanks.totalCells - health.blanks.blankCells;
  const filledPct = health.blanks.totalCells === 0 ? 0 : Math.round((filled / health.blanks.totalCells) * 100);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* The scope of the measurement, before the measurements. At the bottom it read as a footnote
          to numbers the reader had already had to interpret. */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <p className="text-2xs text-muted">
          Measured on <span className="font-mono font-semibold text-text">{versionLabel ?? 'the latest version'}</span> — always
          the latest, which is why this tab has no version selector.
        </p>
        <div className="ml-auto flex items-center gap-2">
          {health.excluded > 0 && (
            <span className="text-2xs text-muted">{health.excluded} field{health.excluded === 1 ? '' : 's'} excluded — out of scope or undecided</span>
          )}
          <Segmented
            value={inScopeOnly ? 'in' : 'all'}
            onChange={(v) => setInScopeOnly(v === 'in')}
            options={[
              { value: 'all' as const, label: 'All fields', title: 'Judge every field in the document' },
              { value: 'in' as const, label: 'In scope only', title: 'Judge only fields marked MIGRATION_IN_SCOPE. Fields left undecided are excluded too — decide them, or grade the whole document.' },
            ]}
          />
        </div>
      </div>

      {/* Groups spread across the full width. They used to cluster at the left with half the strip
          empty, and the effort explanation — a paragraph sitting inside a row of numbers — made its
          group three times taller than its neighbours. That explanation now lives with the
          arithmetic it describes, under Mapping mix. */}
      <div className="flex flex-wrap items-start gap-y-5 rounded-lg shadow-[inset_0_0_0_1px_var(--line)] bg-surface px-4 py-3.5 shrink-0">
        <Group label="Size">
          <Stat label="Fields" value={health.totalRows.toLocaleString()} />
          <Stat label={health.structures.length === 1 ? 'Structure' : 'Structures'} value={health.structures.length} />
          <Stat label="Cells filled" value={`${filledPct}%`} accent={filledPct < 75 ? 'text-amber-ink' : undefined} />
        </Group>

        <Group label="Coverage" note={health.scope.unset > 0 ? 'MIGRATION_IN_SCOPE decides this.' : undefined}>
          <Stat label="In scope" value={health.scope.in.toLocaleString()} />
          <Stat label="Out of scope" value={health.scope.out.toLocaleString()} />
          <Stat label="Not stated" value={health.scope.unset.toLocaleString()} accent={health.scope.unset > 0 ? 'text-amber-ink' : undefined} />
        </Group>

        {/* "38" with no unit invited exactly one question: 38 what? The unit is on the number and
            the anchor is under it — a point is one COPY field's worth of work, so the total reads as
            "as much work as N copy fields". Not hours, and deliberately not converted to hours: the
            conversion is a rate that differs per team, and inventing one here would dress a relative
            score up as a schedule. */}
        <Group label="Build effort" note={`1 pt = one COPY field. Not hours — ${health.totalEffort.toLocaleString()} pts is as much work as ${health.totalEffort.toLocaleString()} copy fields.`}>
          <Stat label="Points" value={`${health.totalEffort.toLocaleString()} pts`} />
          {health.untyped > 0 && <Stat label="Unscored" value={health.untyped} accent="text-red" />}
        </Group>

        <Group label="Outstanding" note={health.review.ran ? `Reviewed ${fmtDateTime(health.review.at)}.` : 'Never reviewed.'}>
          <Stat label="Findings" value={health.review.outstanding} accent={health.review.errors > 0 ? 'text-red' : undefined} />
          <Stat label="Review points" value={health.points.open} />
          <Stat label="Unpublished" value={health.pendingChanges} accent={health.pendingChanges > 0 ? 'text-amber-ink' : undefined} />
        </Group>
      </div>

      {/* Template alignment lives here rather than in Version details, and syncs the LATEST version
          rather than the selected one. Shown against a version you were merely browsing, "Outdated"
          was reporting on a superseded version that is supposed to be behind — and the sync would
          have rebuilt from it. */}
      {/* Being behind the template is the one thing on this tab with a button attached, so it gets
          the only coloured panel — everything else here is a number to read. When nothing is behind
          it collapses to one quiet line, because a permanent green banner is just furniture. */}
      {(fmd.goldenOutdated || fmd.standardRefOutdated) ? (
        <div className="flex items-start gap-3 rounded-lg bg-amber-bg shadow-[inset_0_0_0_1px_var(--amber-ink)] px-4 py-3 shrink-0">
          <AlertTriangle size={16} className="text-amber-ink shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm2 font-semibold text-amber-ink">
              {fmd.goldenOutdated ? 'Behind the Golden template' : 'Behind the object’s Standard FMD'}
            </div>
            <p className="text-2xs text-amber-ink/90 mt-0.5">
              {fmd.goldenOutdated
                ? <>Built from Golden <span className="font-mono font-semibold">{fmd.goldenVersionLabel}</span>; the template has moved on. Reviewing shows exactly what changed before anything is applied, and the result is a draft.</>
                : <>Built from Standard FMD <span className="font-mono font-semibold">{fmd.standardRefVersionLabel}</span>, which has since been re-versioned.</>}
            </p>
          </div>
          {fmd.goldenOutdated && (
            <Button variant="primary" size="sm" className="shrink-0" onClick={() => setSyncOpen(true)}>
              Review changes…
            </Button>
          )}
        </div>
      ) : (fmd.goldenVersionLabel || fmd.standardRefVersionLabel) && (
        <p className="text-2xs text-muted shrink-0">
          {fmd.goldenVersionLabel && <>Golden template <span className="font-mono font-semibold text-text">{fmd.goldenVersionLabel}</span> — current. </>}
          {fmd.standardRefVersionLabel && <>Reference FMD <span className="font-mono font-semibold text-text">{fmd.standardRefVersionLabel}</span> — current.</>}
        </p>
      )}

      {/* Both columns take the remaining height and scroll inside themselves, so the tab fills the
          dialog instead of stopping halfway down it. */}
      <div className="flex-1 min-h-0 flex gap-3 items-stretch">
        <Pane
          title="Checks" className="flex-1 min-w-0 min-h-0"
          actions={
            <>
              {failing > 0 && <Tag variant="danger" size="sm">{failing} failing</Tag>}
              {warning > 0 && <Tag variant="warn" size="sm">{warning} to watch</Tag>}
              {failing === 0 && warning === 0 && <Tag variant="accent" size="sm">All clear</Tag>}
            </>
          }
        >
          {/* Ordered fail → watch → pass, and the passing ones collapse.
              Eight checks rendered at identical weight, distinguished only by a 14px icon, meant
              the five things wrong were the same size as the three things right and you had to read
              every row to find them. What needs doing is now at the top, carries a severity stripe,
              and the rest folds into one line you can open if you want the proof. */}
          <div className="flex flex-col overflow-auto">
            {[...health.checks]
              .filter((c) => c.status !== 'pass')
              .sort((a, b) => (a.status === 'fail' ? 0 : 1) - (b.status === 'fail' ? 0 : 1))
              .map((c) => <CheckRow key={c.key} check={c} />)}

            {passing.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowPassing((v) => !v)}
                  className="flex items-center gap-2 px-3.5 py-2 text-left border-t border-line hover:bg-surface-2 shrink-0"
                >
                  <CheckCircle2 size={14} className="text-green shrink-0" />
                  <span className="text-sm2 text-text">
                    <span className="font-semibold tabular-nums">{passing.length}</span> check
                    {passing.length === 1 ? '' : 's'} passing
                  </span>
                  <ChevronDown
                    size={14}
                    className={clsx('ml-auto text-muted transition-transform', showPassing && 'rotate-180')}
                  />
                </button>
                {showPassing && passing.map((c) => <CheckRow key={c.key} check={c} />)}
              </>
            )}

            {health.checks.every((c) => c.status === 'pass') && (
              <p className="text-sm2 text-muted px-3.5 py-6 text-center">
                Every check passes on this version.
              </p>
            )}
          </div>
        </Pane>

        <Pane title="Composition" className="flex-1 min-w-0 min-h-0" bodyClassName="p-3.5 overflow-auto">
          <div className="flex flex-col gap-4">
            <Breakdown title="Migration scope" parts={[
              { label: 'In scope', n: health.scope.in, className: 'bg-green' },
              { label: 'Out of scope', n: health.scope.out, className: 'bg-neutralTag-ink' },
              { label: 'Not stated', n: health.scope.unset, className: 'bg-red' },
            ]} />

            <Breakdown title="Technical rules" parts={[
              { label: 'SQL', n: health.rules.sql, className: 'bg-green' },
              { label: 'Prose', n: health.rules.prose, className: 'bg-amber-ink' },
              { label: 'Points elsewhere', n: health.rules.pointer, className: 'bg-red' },
              { label: 'Blank', n: health.rules.blank, className: 'bg-neutralTag-ink' },
            ]} />

            <div>
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-2xs font-bold uppercase tracking-[.04em] text-muted">Mapping mix</span>
                {health.untyped > 0 && <span className="text-2xs text-red">{health.untyped} untyped</span>}
              </div>
              {health.mapping.length === 0 ? (
                <p className="text-sm2 text-muted">No row carries a valid MAPPING_TYPE yet.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    {health.mapping.map((m) => (
                      <div key={m.label} className="flex items-center gap-2.5 text-sm2">
                        <span className="w-[130px] shrink-0 truncate">{m.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden min-w-[40px]">
                          <div className="h-full bg-blue" style={{ width: `${(m.rows / health.totalRows) * 100}%` }} />
                        </div>
                        <span className="tabular-nums w-9 text-right shrink-0">{m.rows}</span>
                        <span className="text-2xs text-muted tabular-nums w-16 text-right shrink-0">{m.effort} eff.</span>
                      </div>
                    ))}
                  </div>
                  {/* The explanation belongs with the arithmetic, not in the metric strip: this is
                      the block that shows each type's rows and the effort they add up to. */}
                  <p className="text-2xs text-muted mt-2.5 pt-2.5 border-t border-line-soft">
                    Effort scores each field in POINTS by the work its mapping type implies — {EFFORT_LEGEND} —
                    adding up to <span className="font-semibold text-text tabular-nums">{health.totalEffort.toLocaleString()} pts</span>.
                    One point is one COPY field, so an XREF is worth three copies and a complex transform five.
                    Simple vs Complex is read from the SQL, not typed by hand.
                    <br />
                    Points are <span className="font-semibold text-text">not hours</span>. Use them to compare FMDs
                    and size a wave; to get a duration, multiply by your own measured time per copy field, and
                    recalibrate the weights against your actuals.
                  </p>
                </>
              )}
            </div>
          </div>
        </Pane>
      </div>

      <SyncGoldenFmdDialog
        open={syncOpen} fmdId={fmd.id} fmdName={fmd.name} current={latest}
        goldenStructure={goldenStructure}
        goldenVersionId={goldenVersionId} goldenVersionLabel={goldenVersionLabel}
        onClose={() => setSyncOpen(false)}
      />
    </div>
  );
}

/** One check. The severity stripe does the work the icon alone was doing — a failing check is
 * visible from the edge of the panel rather than only after reading its title. */
function CheckRow({ check: c }: { check: HealthCheck }) {
  const Icon = STATUS[c.status].icon;
  return (
    <div
      className={clsx(
        'flex items-start gap-2.5 px-3.5 py-2 border-b border-line-soft last:border-b-0 shrink-0 border-l-[3px]',
        c.status === 'fail' && 'border-l-red bg-red-light/25',
        c.status === 'warn' && 'border-l-amber-ink bg-amber-bg/40',
        c.status === 'pass' && 'border-l-transparent',
      )}
    >
      <Icon size={14} className={clsx('shrink-0 mt-0.5', STATUS[c.status].className)} />
      <div className="min-w-0">
        <div className="text-sm2 font-semibold text-text">{c.label}</div>
        <div className="text-2xs text-muted">{c.detail}</div>
      </div>
    </div>
  );
}

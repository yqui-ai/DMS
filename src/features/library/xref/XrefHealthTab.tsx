import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronDown, GitCompare, XCircle } from 'lucide-react';
import { Pane } from '../../../components/Pane';
import { Tag } from '../../../components/Tag';
import { Button } from '../../../components/Button';
import { fmtDateTime } from '../../../lib/format';
import { analyseXrefStructure, type CheckStatus, type HealthCheck } from '../../../lib/xrefHealth';
import { XrefCompareDialog } from './XrefCompareDialog';
import type { XrefVersion } from '../../../types/entities';

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

function Group({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[180px] px-4 first:pl-0 last:pr-0 border-l border-line first:border-l-0">
      <div className="text-2xs font-bold uppercase tracking-[.05em] text-muted mb-2">{label}</div>
      <div className="flex gap-5 flex-wrap">{children}</div>
      {note && <div className="text-2xs text-muted mt-2">{note}</div>}
    </div>
  );
}

/** Whether the Golden XREF template can do its job — and, when a draft is open, the one button that
 * releases it.
 *
 * Shaped after the FMD's health tab on purpose: the same metric strip, the same fail-first checks
 * list with the passing ones folded, the same coloured panel for the one thing with an action
 * attached. Two templates in one catalogue, read the same way from sibling rows, should not be two
 * different screens.
 *
 * What it measures is necessarily different. The FMD grades a mapping DOCUMENT — rows, rules,
 * effort, outstanding findings. A Golden XREF has none of that; it is the template, so the checks
 * are about whether the template is capable rather than how much of it is filled in.
 *
 * Always measured against the LATEST version, never the one selected in the header. "Is this
 * template healthy" is a question about the template as it stands, and answering it from a
 * superseded version someone happened to be browsing would report a state that no longer exists. */
export function XrefHealthTab({ versions, selectedId, onOpenDraft }: {
  /** Newest first. */
  versions: XrefVersion[];
  /** The version on screen — the comparison opens against this one. */
  selectedId?: string;
  /** Sends the reader to the Draft tab, which is the ONLY place publishing happens. This panel
   * reports that a draft is open; it deliberately does not release it. Publish appeared here, on
   * the Draft tab and in the version details at once, which is three buttons for one irreversible
   * act and no single place that owns it — the FMD settled that question long ago. */
  onOpenDraft: () => void;
}) {
  const [showPassing, setShowPassing] = useState(false);
  const [comparing, setComparing] = useState(false);

  const latest = versions[0];
  const latestPublished = versions.find((v) => v.publishedAt);
  const health = useMemo(() => analyseXrefStructure(latest?.structure, versions), [latest, versions]);

  const failing = health.checks.filter((c) => c.status === 'fail').length;
  const warning = health.checks.filter((c) => c.status === 'warn').length;
  const passing = health.checks.filter((c) => c.status === 'pass');
  const describedPct = health.fields === 0 ? 0 : Math.round((health.described / health.fields) * 100);

  const hasDraft = !!latest && !latest.publishedAt;

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <p className="text-2xs text-muted">
          Measured on <span className="font-mono font-semibold text-text">{latest?.version ?? 'the latest version'}</span> — always
          the latest, which is why this tab ignores the version selector.
        </p>
        <Button variant="quiet" size="sm" className="ml-auto" onClick={() => setComparing(true)} disabled={versions.length < 2}>
          <GitCompare size={13} /> Compare versions…
        </Button>
      </div>

      <div className="flex flex-wrap items-start gap-y-5 rounded-lg shadow-[inset_0_0_0_1px_var(--line)] bg-surface px-4 py-3.5 shrink-0">
        <Group label="Size">
          <Stat label="Fields" value={health.fields.toLocaleString()} />
          <Stat label={health.sections === 1 ? 'Section' : 'Sections'} value={health.sections} />
        </Group>

        <Group label="Documented" note={describedPct === 100 ? undefined : 'A field with no description is a column header with no stated meaning.'}>
          <Stat label="Described" value={`${describedPct}%`} accent={describedPct < 100 ? 'text-amber-ink' : undefined} />
          <Stat label="Missing" value={health.fields - health.described} accent={health.described < health.fields ? 'text-amber-ink' : undefined} />
        </Group>

        <Group label="History" note={latestPublished?.publishedAt ? `Last published ${fmtDateTime(latestPublished.publishedAt)}.` : 'Never published.'}>
          <Stat label="Versions" value={health.versions} />
          <Stat label="Published" value={health.published} accent={health.published === 0 ? 'text-red' : undefined} />
        </Group>
      </div>

      {/* The one thing on this tab with a button attached, so it gets the only coloured panel —
          everything else here is a number to read. When there is no draft it collapses to a quiet
          line, because a permanent green banner is furniture. */}
      {hasDraft ? (
        <div className="flex items-start gap-3 rounded-lg bg-amber-bg shadow-[inset_0_0_0_1px_var(--amber-ink)] px-4 py-3 shrink-0">
          <AlertTriangle size={16} className="text-amber-ink shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm2 font-semibold text-amber-ink">An unpublished draft is open</div>
            <p className="text-2xs text-amber-ink/90 mt-0.5">
              {latestPublished
                ? <>The programme is still using <span className="font-mono font-semibold">{latestPublished.version}</span>. The Draft tab shows what would change, and publishes it.</>
                : <>Nothing has been released yet, so nothing can be built against this template. The Draft tab publishes it.</>}
            </p>
          </div>
          <Button variant="primary" size="sm" className="shrink-0" onClick={onOpenDraft}>
            Review draft
          </Button>
        </div>
      ) : latestPublished && (
        <p className="text-2xs text-muted shrink-0">
          Live template <span className="font-mono font-semibold text-text">{latestPublished.version}</span> — published,
          frozen, and with no draft open.
        </p>
      )}

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
        {/* Ordered fail → watch → pass, with the passing ones folded. What needs doing is at the
            top and carries a severity stripe; the rest is proof you can open if you want it. */}
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
                <ChevronDown size={14} className={clsx('ml-auto text-muted transition-transform', showPassing && 'rotate-180')} />
              </button>
              {showPassing && passing.map((c) => <CheckRow key={c.key} check={c} />)}
            </>
          )}
        </div>
      </Pane>

      <XrefCompareDialog
        open={comparing}
        versions={versions}
        selectedId={selectedId}
        onClose={() => setComparing(false)}
      />
    </div>
  );
}

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

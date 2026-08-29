import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Sparkles } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { useToast } from '../../components/Toast';
import { useGoldenSyncPlan, useApplyGoldenSync, type GoldenSyncPlan } from '../../lib/queries/goldenSync';
import type { FmdVersion, GoldenFmdStructure } from '../../types/entities';

/** Assessment-then-approval for realigning an outdated FMD to the current Golden template — the
 * same shape as the historical converter: show exactly what will happen, make the cost explicit,
 * and change nothing until someone agrees. Sync is never automatic, because the one irreversible
 * part (dropping a populated column) is invisible unless you say it out loud. */
export function SyncGoldenFmdDialog({ open, fmdId, fmdName, current, goldenStructure, goldenVersionId, goldenVersionLabel, onClose }: {
  open: boolean;
  fmdId: string;
  fmdName: string;
  current?: FmdVersion;
  goldenStructure?: GoldenFmdStructure;
  goldenVersionId?: string;
  goldenVersionLabel?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const { buildPlan } = useGoldenSyncPlan();
  const { apply } = useApplyGoldenSync(fmdId);
  const [plan, setPlan] = useState<GoldenSyncPlan | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open || !current || !goldenStructure) { setPlan(null); return; }
    let cancelled = false;
    setAnalysing(true);
    buildPlan(current, goldenStructure)
      .then((p) => { if (!cancelled) setPlan(p); })
      .catch((err) => { if (!cancelled) toast.error(err.message ?? 'Could not analyse the difference.'); })
      .finally(() => { if (!cancelled) setAnalysing(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current?.id, goldenStructure]);

  const confirm = async () => {
    if (!current || !plan || !goldenVersionId) return;
    setApplying(true);
    try {
      await apply(current, plan, goldenVersionId, goldenVersionLabel ?? 'latest');
      toast.success(plan.relinkOnly
        ? `Reference updated to Golden ${goldenVersionLabel ?? 'latest'}.`
        : 'Synced — the result is a new draft, so nothing is published until you say so.');
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Could not apply the sync.');
    } finally {
      setApplying(false);
    }
  };

  /** The template moved but its columns are identical, so the only stale thing is the reference.
   *
   * This used to disable the button, which left the FMD permanently flagged Outdated with no way to
   * clear it — and it read the plan's parts by hand, so a template whose only change was a field
   * DESCRIPTION also counted as "nothing to do" even though there was something to sync. Read
   * `relinkOnly`, which the analysis already works out. */
  const relinkOnly = !!plan?.relinkOnly;

  return (
    <Dialog
      open={open} onClose={onClose} title="Sync to Golden FMD" size="lg" variant="ai" processing={analysing}
      subtitle={`${fmdName} → Golden FMD ${goldenVersionLabel ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={applying}>Cancel</Button>
          <Button variant="primary" onClick={confirm} disabled={analysing || applying || !plan}>
            {applying ? 'Syncing…' : relinkOnly ? 'Update reference' : 'Approve & create draft'}
          </Button>
        </>
      }
    >
      {analysing ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Sparkles size={26} className="text-violet-deep animate-pulse" />
          <p className="text-sm2 font-semibold text-text">Comparing with the current Golden template…</p>
          <p className="text-2xs text-muted">Checking which columns changed, and whether any were renamed rather than removed.</p>
        </div>
      ) : !plan ? (
        <p className="text-sm2 text-muted py-8 text-center">Nothing to compare yet.</p>
      ) : relinkOnly ? (
        <div className="py-10 text-center flex flex-col items-center gap-2">
          <p className="text-sm2 font-semibold text-green">✓ The columns already match Golden {goldenVersionLabel}.</p>
          <p className="text-2xs text-muted max-w-[420px]">
            Nothing in this FMD needs restructuring — the template changed in ways that don't affect
            its columns. Updating the reference records that it's current, and clears the Outdated
            flag. No new version is created.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {plan.summary && (
            <div className="rounded bg-blue-pale p-3 text-sm2 text-text">{plan.summary}</div>
          )}

          {/* Changes that move no data but change what the FMD ACCEPTS — a column's type, its value
              list, whether it's critical. These were computed but never shown, so re-typing a column
              in the template produced a plan that looked empty with an active Approve button. */}
          {plan.metadataChanges.length > 0 && (
            <div className="rounded shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
              <div className="px-3 py-1.5 bg-surface-3 border-b border-line">
                <span className="text-2xs font-bold uppercase tracking-[.04em] text-muted">Column definitions</span>
                <span className="text-2xs text-muted ml-1.5">no data moves — this changes what the column accepts</span>
              </div>
              <div className="flex flex-col divide-y divide-line-soft">
                {plan.metadataChanges.map((m) => (
                  <div key={m.field} className="px-3 py-2 flex items-center gap-2 flex-wrap">
                    <Tag variant="column" size="sm">{m.field}</Tag>
                    <span className="text-sm2 text-text">{m.what}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {plan.dataLossFields.length > 0 && (
            <div className="rounded bg-red-light p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle size={14} className="text-red-ink shrink-0" />
                <span className="text-sm2 font-semibold text-red-ink">This will discard data</span>
              </div>
              <p className="text-sm2 text-text mb-2">
                These columns no longer exist in the Golden template and aren't a rename of anything new,
                so the values in them are dropped:
              </p>
              <div className="flex flex-col gap-1">
                {plan.dataLossFields.map((f) => (
                  <div key={f.field} className="text-sm2">
                    <Tag variant="column" size="sm">{f.field}</Tag>
                    <span className="text-muted ml-1.5">{f.rows} populated row{f.rows === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Section title={`Renamed — data carries across (${plan.renames.length})`} hide={!plan.renames.length}>
            {plan.renames.map((r) => (
              <div key={`${r.from}->${r.to}`} className="flex items-center gap-2 flex-wrap text-sm2 py-1">
                <Tag variant="column" size="sm">{r.from}</Tag>
                <ArrowRight size={12} className="text-muted" />
                <Tag variant="column" size="sm">{r.to}</Tag>
                <Tag variant={r.confidence === 'high' ? 'accent' : 'warn'} size="sm">{r.confidence}</Tag>
                {r.why && <span className="text-2xs text-muted">{r.why}</span>}
              </div>
            ))}
          </Section>

          <Section title={`New columns — start empty (${plan.added.length})`} hide={!plan.added.length}>
            <div className="flex flex-wrap gap-1.5">
              {plan.added.map((c) => <Tag key={c.field} variant="column" size="sm">{c.field}</Tag>)}
            </div>
          </Section>

          <Section title={`Removed (${plan.removed.length})`} hide={!plan.removed.length}>
            <div className="flex flex-wrap gap-1.5">
              {plan.removed.map((c) => <Tag key={c.field} variant="neutral" size="sm">{c.field}</Tag>)}
            </div>
          </Section>

          {plan.reordered && (
            <p className="text-sm2 text-muted">Column order also changes to match the Golden template.</p>
          )}

          <p className="text-2xs text-muted">
            Approving creates a new <strong>draft</strong> version — nothing is published until you publish it,
            so you can review the result first.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function Section({ title, hide, children }: { title: string; hide?: boolean; children: React.ReactNode }) {
  if (hide) return null;
  return (
    <div>
      <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1.5">{title}</div>
      <div className="rounded shadow-[inset_0_0_0_1px_var(--line)] p-3">{children}</div>
    </div>
  );
}

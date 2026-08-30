import { useMemo, useState } from 'react';
import { Minus, Plus, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../../../components/Button';
import { Pane } from '../../../components/Pane';
import { Tag } from '../../../components/Tag';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { fmtDateTime } from '../../../lib/format';
import { bumpVersion } from '../../../lib/fmdDraft';
import { diffXrefStructures } from '../../../lib/xrefHealth';
import type { XrefVersion } from '../../../types/entities';

/** The unreleased draft: what it would change, and the only place it gets published.
 *
 * The FMD's Draft tab lists PENDING CHANGES with a checkbox each, because an FMD draft is a set of
 * individually-selectable cell edits sitting on a published version. An XREF draft is not that: the
 * designer saves a whole structure, so there is nothing to select between — publishing releases the
 * structure as saved, all of it. Presenting checkboxes here would offer a choice the model cannot
 * honour.
 *
 * What it shows instead is the same question answered a different way: what changes if this is
 * released. That is a diff against the live version, computed by the same function the Compare
 * dialog uses, so the two can never disagree about what the draft does.
 *
 * The tab only exists while a draft does — its absence is how you know there is nothing pending. */
export function XrefDraftTab({ versions, onPublish, publishing }: {
  /** Newest first. */
  versions: XrefVersion[];
  onPublish: () => void;
  publishing: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  const draft = versions.find((v) => !v.publishedAt);
  const live = versions.find((v) => v.publishedAt);

  const diff = useMemo(
    () => diffXrefStructures(live?.structure, draft?.structure),
    [live, draft],
  );

  if (!draft) {
    return (
      <p className="text-sm2 text-muted py-16 text-center">
        No draft is open. Edits made in the Golden XREF designer appear here before they are published.
      </p>
    );
  }

  // The number it will publish under, computed the same way publishDraft computes it — so the
  // number offered before publishing is by construction the number that gets written.
  const nextVersion = live ? bumpVersion(live.version) : 'v1.0.0';

  const counts = [
    { label: 'added', n: diff.added.length },
    { label: 'removed', n: diff.removed.length },
    { label: 'changed', n: diff.changed.length },
  ].filter((c) => c.n > 0);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-bg shadow-[inset_0_0_0_1px_var(--amber-ink)] px-4 py-3 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-sm2 font-semibold text-amber-ink">
            Publishing releases this as <span className="font-mono">{nextVersion}</span>
          </div>
          <p className="text-2xs text-amber-ink/90 mt-0.5">
            {live
              ? <>The programme is using <span className="font-mono font-semibold">{live.version}</span> until then. Once published the structure is frozen — the next edit starts a fresh draft.</>
              : <>Nothing has been released yet, so no table can be built from this template until you publish.</>}
          </p>
        </div>
        <Button variant="primary" size="sm" className="shrink-0" onClick={() => setConfirming(true)} disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <span className="text-2xs text-muted">
          Saved by <span className="font-semibold text-text">{draft.createdBy ?? '—'}</span>
          {draft.createdAt && <> · {fmtDateTime(draft.createdAt)}</>}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {counts.length === 0
            ? <Tag variant="neutral" size="sm">No structural change</Tag>
            : counts.map((c) => <Tag key={c.label} variant="warn" size="sm">{c.n} {c.label}</Tag>)}
          {diff.reordered && <Tag variant="neutral" size="sm">Reordered</Tag>}
        </span>
      </div>

      <Pane title={live ? `What changes from ${live.version}` : 'What this template will contain'} className="flex-1 min-h-0" bodyClassName="p-3.5 overflow-auto">
        {!live ? (
          <p className="text-sm2 text-muted">
            This is the first version — everything in it is new. Review it on the Cross Reference tab
            before publishing.
          </p>
        ) : diff.identical ? (
          <p className="text-sm2 text-muted">
            The draft is identical to <span className="font-mono font-semibold text-text">{live.version}</span> —
            same fields, same order, same descriptions. Publishing it would create a version that
            changes nothing.
          </p>
        ) : (
          <div className="flex flex-col gap-3.5">
            <DiffList title="Added" icon={Plus} tone="added" items={diff.added.map((f) => ({ key: f, field: f }))} />
            <DiffList title="Removed" icon={Minus} tone="removed" items={diff.removed.map((f) => ({ key: f, field: f }))} />
            <DiffList title="Changed" icon={RefreshCw} tone="changed" items={diff.changed.map((c) => ({ key: c.field, field: c.field, detail: c.what }))} />
            {diff.reordered && (
              <p className="text-2xs text-muted border-t border-line-soft pt-2.5">
                Fields common to both versions are in a different order.
              </p>
            )}
          </div>
        )}
      </Pane>

      <ConfirmDialog
        open={confirming}
        title={`Publish ${nextVersion}?`}
        // Says what becomes irreversible, not just "are you sure". Publishing is a one-way door:
        // a DB trigger freezes the structure afterwards, so this is the last chance to change it.
        message={`This releases the draft as ${nextVersion} and freezes it — the structure can no longer be edited, only superseded by a new draft.${live ? ` The programme moves off ${live.version}.` : ''}`}
        confirmLabel="Publish"
        busy={publishing}
        onConfirm={() => { setConfirming(false); onPublish(); }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

const TONE = { added: 'text-green', removed: 'text-red', changed: 'text-amber-ink' } as const;

function DiffList({ title, icon: Icon, tone, items }: {
  title: string;
  icon: typeof Plus;
  tone: keyof typeof TONE;
  items: { key: string; field: string; detail?: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={13} className={TONE[tone]} />
        <span className="text-2xs font-bold uppercase tracking-[.04em] text-muted">{title}</span>
        <span className="text-2xs text-muted tabular-nums">{items.length}</span>
      </div>
      <div className="flex flex-col gap-1 pl-[18px]">
        {items.map((i) => (
          <div key={i.key} className="flex items-baseline gap-2 text-sm2 min-w-0">
            <span className={clsx('font-mono shrink-0', TONE[tone])}>{i.field}</span>
            {i.detail && <span className="text-2xs text-muted truncate">{i.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

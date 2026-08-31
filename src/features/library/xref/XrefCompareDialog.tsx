import { useMemo, useState } from 'react';
import { ArrowRight, Minus, Plus, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../../components/Dialog';
import { Select } from '../../../components/Select';
import { Tag } from '../../../components/Tag';
import { diffXrefStructures } from '../../../lib/xrefHealth';
import type { XrefVersion } from '../../../types/entities';

/** What changed between two versions of the Golden XREF template.
 *
 * The FMD's equivalent is SyncGoldenFmdDialog, which also WRITES — it rebuilds an FMD against the
 * current template. There is nothing to rebuild here: the Golden XREF is the template, and no
 * record is generated from it yet, so this reads and nothing else. Presenting it as a sync would
 * promise an apply step that has nothing to apply to.
 *
 * The baseline defaults to the previous version, because "what did this release change" is the
 * question you almost always have. */
export function XrefCompareDialog({ open, versions, selectedId, onClose }: {
  open: boolean;
  /** Newest first, as `useXrefVersions` returns them. */
  versions: XrefVersion[];
  /** The version being viewed — the right-hand side of the comparison. */
  selectedId?: string;
  onClose: () => void;
}) {
  const selectedIndex = Math.max(0, versions.findIndex((v) => v.id === selectedId));
  const selected = versions[selectedIndex];
  const [baselineId, setBaselineId] = useState<string | null>(null);

  // The version below the one on screen. Falls back to itself when there is no earlier one, which
  // reads as "nothing changed" — accurate for a first version, and the copy says so explicitly.
  const defaultBaseline = versions[selectedIndex + 1] ?? versions[selectedIndex];
  const baseline = versions.find((v) => v.id === baselineId) ?? defaultBaseline;

  const diff = useMemo(
    () => diffXrefStructures(baseline?.structure, selected?.structure),
    [baseline, selected],
  );

  const isFirst = versions.length <= 1 || baseline?.id === selected?.id;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Compare versions"
      subtitle="What the template gained, lost and moved between two versions."
      size="lg"
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-1.5 text-2xs text-muted">
            From
            <Select
              value={baseline?.id ?? ''}
              onChange={(e) => setBaselineId(e.target.value)}
              size="sm"
              mono
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.version}</option>
              ))}
            </Select>
          </label>
          <ArrowRight size={14} className="text-muted" />
          {/* The right-hand side is fixed to the version the dialog was opened on. Two free
              selectors here would be a second answer to "which version am I looking at", which the
              viewer deliberately has only one of. */}
          <span className="text-2xs text-muted">
            To <span className="font-mono font-semibold text-text">{selected?.version ?? '—'}</span>
          </span>
        </div>

        {isFirst ? (
          <p className="text-sm2 text-muted py-10 text-center">
            {versions.length <= 1
              ? 'This is the only version of the template — there is nothing to compare it against yet.'
              : 'Comparing a version against itself. Pick a different baseline on the left.'}
          </p>
        ) : diff.identical ? (
          <p className="text-sm2 text-muted py-10 text-center">
            Nothing changed between{' '}
            <span className="font-mono font-semibold text-text">{baseline?.version}</span> and{' '}
            <span className="font-mono font-semibold text-text">{selected?.version}</span> —
            same fields, same order, same descriptions. The version was released for another reason.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {diff.added.length > 0 && <Tag variant="accent" size="sm">{diff.added.length} added</Tag>}
              {diff.removed.length > 0 && <Tag variant="danger" size="sm">{diff.removed.length} removed</Tag>}
              {diff.changed.length > 0 && <Tag variant="warn" size="sm">{diff.changed.length} changed</Tag>}
              {diff.reordered && <Tag variant="neutral" size="sm">Reordered</Tag>}
            </div>

            <ChangeList
              title="Added" icon={Plus} tone="added"
              empty="No new fields."
              items={diff.added.map((f) => ({ key: f, field: f }))}
            />
            <ChangeList
              title="Removed" icon={Minus} tone="removed"
              empty="No fields were dropped."
              note="A renamed field shows here as a removal and an addition — nothing in a Golden XREF is populated, so no guess is made about which is which."
              items={diff.removed.map((f) => ({ key: f, field: f }))}
            />
            <ChangeList
              title="Changed" icon={RefreshCw} tone="changed"
              empty="No field changed section, colour or description."
              items={diff.changed.map((c) => ({ key: c.field, field: c.field, detail: c.what }))}
            />

            {diff.reordered && (
              <p className="text-2xs text-muted border-t border-line pt-2.5">
                Fields common to both versions appear in a different order. Order is compared over
                shared fields only, so this is a genuine move rather than a side effect of something
                being added.
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

const TONE = {
  added: 'text-green',
  removed: 'text-red',
  changed: 'text-amber-ink',
} as const;

function ChangeList({ title, icon: Icon, tone, items, empty, note }: {
  title: string;
  icon: typeof Plus;
  tone: keyof typeof TONE;
  items: { key: string; field: string; detail?: string }[];
  empty: string;
  note?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={13} className={TONE[tone]} />
        <span className="text-2xs font-bold uppercase tracking-[.04em] text-muted">{title}</span>
        <span className="text-2xs text-muted tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-2xs text-muted pl-[18px]">{empty}</p>
      ) : (
        <div className="flex flex-col gap-1 pl-[18px]">
          {items.map((i) => (
            <div key={i.key} className="flex items-baseline gap-2 text-sm2 min-w-0">
              <span className={clsx('font-mono shrink-0', TONE[tone])}>{i.field}</span>
              {i.detail && <span className="text-2xs text-muted truncate">{i.detail}</span>}
            </div>
          ))}
        </div>
      )}
      {note && items.length > 0 && <p className="text-2xs text-muted pl-[18px] mt-1.5">{note}</p>}
    </div>
  );
}

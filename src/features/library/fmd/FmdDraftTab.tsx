import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Lock } from 'lucide-react';
import { Button } from '../../../components/Button';
import { Pane } from '../../../components/Pane';
import { Tag } from '../../../components/Tag';
import { SelectAllToggle } from '../../../components/SelectAllToggle';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { fmtDateTime } from '../../../lib/format';
import type { FmdVersion } from '../../../types/entities';

type Change = NonNullable<FmdVersion['sheets']['pendingChanges']>[number];

/** The local part of an email, which is the part that identifies a colleague. Everyone in a
 * programme shares a domain, so `@client.com` repeated down forty rows is pure width. Full address
 * stays in the row's tooltip. */
const shortAuthor = (who?: string): string => (who ? who.split('@')[0] : '—');

/** `28 Aug 22:11` — enough to place an edit in a working week, in a column that never truncates.
 * The full timestamp is in the tooltip; the year is not what anyone scans a draft for. */
function shortStamp(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** Groups changes under the structure they belong to.
 *
 * An FMD carries several structures and edits land across all of them. Printing the structure ident
 * on every row repeated it dozens of times and made the list ragged — the one piece of context that
 * is constant for a run of rows belongs in a header, not in each row. */
function groupByStructure(changes: Change[]): [string, Change[]][] {
  const out = new Map<string, Change[]>();
  for (const c of changes) {
    const key = c.structureIdent ?? '—';
    out.set(key, [...(out.get(key) ?? []), c]);
  }
  return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** One edit, on ONE line, in fixed columns.
 *
 * The old row wrapped four things of wildly varying length through `flex-wrap` across two lines, so
 * no two rows lined up and a list of thirty looked like torn paper. Fixed columns mean the field
 * names form a column, the arrows form a column, and the eye can run down any one of them.
 *
 * The diff is deliberately quiet — muted strikethrough into plain emphasis, not red into green.
 * Red and green are DMS's error and success colours; spending them on every row of an ordinary edit
 * list makes thirty routine changes look like fifteen failures and fifteen wins. */
function ChangeRow({ change: c, selectable, checked, onToggle }: {
  change: Change;
  selectable: boolean;
  checked?: boolean;
  onToggle?: () => void;
}) {
  const body = (
    <>
      {selectable ? (
        <input
          type="checkbox" className="w-3.5 h-3.5 accent-[var(--blue)] shrink-0"
          checked={checked} onChange={onToggle}
          aria-label={`Publish the change to ${c.field}`}
        />
      ) : (
        <Lock size={12} className="w-3.5 shrink-0 text-muted" aria-label="Publishes with the version" />
      )}

      <span className="w-[180px] shrink-0 font-mono text-2xs text-muted truncate" title={c.rowLabel}>
        {c.rowLabel}
      </span>

      <Tag variant="column" size="sm" className="w-[150px] shrink-0 truncate">{c.field}</Tag>

      <span className="flex-1 min-w-0 flex items-baseline gap-1.5 text-sm2">
        <span className="text-muted line-through decoration-1 truncate max-w-[45%]" title={c.from || '—'}>
          {c.from || '—'}
        </span>
        <span className="text-muted shrink-0">→</span>
        <span className="text-text font-semibold truncate" title={c.to || '—'}>{c.to || '—'}</span>
      </span>

      {/* Two columns, not one string. `jordan.alvarez@client.com · Aug 28, 2026, 10:11 PM` is ~45
          characters and truncated to "jordan.alvarez@client.com · A…" — losing the date, which is
          the half people scan for. The date now has its own fixed column and can never be cut; the
          author truncates instead, and keeps the full address in its tooltip. */}
      <span className="w-[110px] shrink-0 text-2xs text-muted truncate text-right" title={c.by}>
        {shortAuthor(c.by)}
      </span>
      <span className="w-[112px] shrink-0 text-2xs text-muted text-right tabular-nums" title={fmtDateTime(c.at)}>
        {shortStamp(c.at)}
      </span>
    </>
  );

  if (!selectable) {
    return <div className="flex items-center gap-2.5 px-3 py-1.5 border-b border-line-soft last:border-b-0">{body}</div>;
  }
  return (
    <label className="flex items-center gap-2.5 px-3 py-1.5 border-b border-line-soft last:border-b-0 cursor-pointer hover:bg-blue-pale">
      {body}
    </label>
  );
}

function StructureHeading({ ident, count }: { ident: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2 px-3 py-1.5 bg-surface-2 border-b border-line-soft sticky top-0 z-[1]">
      <span className="text-2xs font-mono font-bold text-text">{ident}</span>
      <span className="text-2xs text-muted tabular-nums">{count} change{count === 1 ? '' : 's'}</span>
    </div>
  );
}

/** Everything about releasing a draft: the pending changes with checkboxes, the draft's own
 * metadata, and Publish — which lives ONLY here, not in the dialog toolbar, because it applies to
 * exactly one thing and only when that thing exists.
 *
 * The two kinds of change are shown in ONE list with one row format, split by a section heading.
 * They used to be two lists with unrelated treatments — selectable rows in `text-sm2` over two
 * lines, then "already in this version" crammed into `text-2xs` run-on one-liners — which read as
 * two half-finished features rather than one document's history.
 *
 * Owns its selection state. Before this was extracted, `selectedChanges` sat in the same scope as
 * the review filters and the field-view state, so any effect resetting one could clear another; now
 * a review filter physically cannot touch a publish selection. */
export function FmdDraftTab({
  draftVersion, lastPublished, nextVersion, pendingChanges, draftChangeSummary,
  mayPublish, publishing, reviewing, owner, onPublish,
}: {
  /** The unpublished working version. Undefined once everything is published. */
  draftVersion?: FmdVersion;
  /** Newest published version — what the draft is compared against, and what stays live until
   * someone publishes. */
  lastPublished?: FmdVersion;
  /** The number publishing would allocate. The draft itself has none — it isn't a version until
   * it's released — so this is what to show wherever a version number belongs. */
  nextVersion?: string;
  pendingChanges: NonNullable<FmdVersion['sheets']['pendingChanges']>;
  draftChangeSummary: string | null;
  mayPublish: boolean;
  publishing: boolean;
  /** Publishing and the mapping review both write `sheets` on the same row, so they're mutually
   * exclusive; the parent owns that coordination because the review is fired from the toolbar. */
  reviewing: boolean;
  owner?: string;
  onPublish: (selectedChangeIds: string[]) => void;
}) {
  const [selectedChanges, setSelectedChanges] = useState<string[]>([]);
  const [confirmPublish, setConfirmPublish] = useState(false);

  /** Edits recorded ON the unreleased version itself, as opposed to pending changes sitting on
   * top of a published one. Both end up in the released version; only the second kind is
   * selectable. */
  // `?? []` allocates a fresh array each render, so the grouping below has to key on the version
  // rather than on the value it read.
  const changeLog = useMemo(
    () => draftVersion?.sheets.changeLog ?? [],
    [draftVersion?.sheets.changeLog],
  );

  const pendingGroups = useMemo(() => groupByStructure(pendingChanges), [pendingChanges]);
  const logGroups = useMemo(() => groupByStructure(changeLog), [changeLog]);

  // Everything ticked by default: publishing all of it is the common case, and unticking the few
  // you want to hold back is less work than ticking the many you don't. Keyed on the draft and the
  // COUNT, not on `pendingChanges` itself — the array is rebuilt on every fetch, and depending on
  // it would re-tick everything each time someone saved a cell, silently undoing their unticks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSelectedChanges(pendingChanges.map((c) => c.id));
  }, [draftVersion?.id, pendingChanges.length]);

  const allSelected = selectedChanges.length === pendingChanges.length;
  const heldBack = pendingChanges.length - selectedChanges.length;
  const toggle = (id: string) => setSelectedChanges(
    (cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]),
  );

  return (
    <>
      <div className="h-full flex gap-4 min-h-0">
        {/* The changes ARE the content of this tab, so they get the space and the metadata
            is reduced to a sidebar. The earlier layout led with version/author/comment and
            pushed the list — the only thing you have to read to decide — below the fold. */}
        <Pane
          title="Changes to publish" className="flex-1 min-w-0"
          actions={
            draftVersion && pendingChanges.length > 0 ? (
              <>
                <span className="text-2xs text-muted tabular-nums">
                  {selectedChanges.length} of {pendingChanges.length} selected
                </span>
                <SelectAllToggle
                  className="ml-auto"
                  allSelected={allSelected}
                  onSelectAll={() => setSelectedChanges(pendingChanges.map((c) => c.id))}
                  onDeselectAll={() => setSelectedChanges([])}
                />
              </>
            ) : undefined
          }
        >
          {!draftVersion ? (
            <p className="text-sm2 text-muted py-10 text-center">Everything is published — there are no unreleased changes.</p>
          ) : (
            <>
              {pendingChanges.length === 0 ? (
                <div className="px-3 py-3">
                  <p className="text-sm2 text-text">
                    {draftChangeSummary ?? 'This FMD has never been published — publishing releases it for the first time.'}
                  </p>
                  {/* 'generated rather than hand-edited' was only ever true when nothing had been
                      edited since. The log below is the proof either way. */}
                  <p className="text-2xs text-muted mt-1">
                    {changeLog.length > 0
                      ? 'There is nothing to tick — the whole version publishes together. The edits inside it are listed below.'
                      : 'This draft was generated rather than hand-edited, so it publishes as a whole.'}
                  </p>
                </div>
              ) : (
                pendingGroups.map(([ident, items]) => (
                  <div key={ident}>
                    <StructureHeading ident={ident} count={items.length} />
                    {items.map((c) => (
                      <ChangeRow
                        key={c.id} change={c} selectable
                        checked={selectedChanges.includes(c.id)}
                        onToggle={() => toggle(c.id)}
                      />
                    ))}
                  </div>
                ))
              )}

              {/* Edits already inside this unreleased version. NOT selectable: publishing an
                  unreleased version releases the whole thing, so there is nothing to choose. The
                  padlock says that per row rather than a paragraph explaining it. */}
              {changeLog.length > 0 && (
                <>
                  <div className="flex items-baseline gap-2 px-3 py-2 bg-surface-3 border-y border-line">
                    <span className="text-2xs font-bold uppercase tracking-[.04em] text-muted">
                      Already in this version
                    </span>
                    <span className="text-2xs text-muted tabular-nums">{changeLog.length}</span>
                    <span className="text-2xs text-muted">· publishes together, nothing to select</span>
                  </div>
                  {logGroups.map(([ident, items]) => (
                    <div key={ident}>
                      <StructureHeading ident={ident} count={items.length} />
                      {items.map((c) => <ChangeRow key={c.id} change={c} selectable={false} />)}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </Pane>

        {draftVersion && (
          <Pane title="Draft" className="w-[300px] shrink-0" bodyClassName="p-3.5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag variant="danger" size="sm">Draft</Tag>
                <span className="text-2xs text-muted">not yet a version</span>
              </div>

              {/* A definition list, so the labels form a column instead of each line starting at a
                  different place. Four facts read as four facts; before, they read as prose. */}
              <dl className="flex flex-col gap-1.5 text-sm2">
                {nextVersion && (
                  <Fact label="Publishes as">
                    <span className="font-mono font-semibold text-blue-deep">{nextVersion}</span>
                  </Fact>
                )}
                {lastPublished && (
                  <Fact label="Live now"><span className="font-mono font-semibold">{lastPublished.version}</span></Fact>
                )}
                <Fact label="Started by">{draftVersion.createdBy ?? '—'}</Fact>
                <Fact label="Last edit">{fmtDateTime(draftVersion.changedAt ?? draftVersion.createdAt)}</Fact>
              </dl>

              {draftVersion.comment && (
                <div>
                  <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1">Comment</div>
                  <p className="text-sm2 whitespace-pre-wrap">{draftVersion.comment}</p>
                </div>
              )}

              <div className="border-t border-line pt-3 flex flex-col gap-2">
                <Button
                  variant="primary" size="sm" className="w-full" onClick={() => setConfirmPublish(true)}
                  disabled={publishing || reviewing || !mayPublish || (pendingChanges.length > 0 && selectedChanges.length === 0)}
                  title={reviewing ? 'A mapping review is running.' : undefined}
                >
                  <CheckCircle2 size={14} />
                  {pendingChanges.length > 0
                    ? `Publish ${selectedChanges.length} change${selectedChanges.length === 1 ? '' : 's'}`
                    : `Publish ${nextVersion ?? 'draft'}`}
                </Button>
                <p className="text-2xs text-muted">
                  {reviewing
                    ? 'Waiting for the mapping review to finish — both write to the same version.'
                    : mayPublish
                      ? 'Publishing freezes this version — its mapping content can never be edited again.'
                      : `Only ${owner ?? 'the object owner (assign one in Scope > Scope Register)'} or a program lead can publish.`}
                </p>
              </div>
            </div>
          </Pane>
        )}
      </div>

      <ConfirmDialog
        open={confirmPublish} title={`Publish ${nextVersion ?? 'draft'}`} busy={publishing}
        confirmLabel="Publish" onCancel={() => setConfirmPublish(false)}
        onConfirm={() => onPublish(selectedChanges)}
        message={
          <>
            <p className="mb-2">This creates <span className="font-mono font-semibold">{nextVersion}</span> and makes it the active version for everyone with access to this FMD.</p>
            {heldBack > 0 && (
              <p className="mb-2">
                The {heldBack} change{heldBack === 1 ? '' : 's'} you left unticked stay unpublished, in a new draft on top of this version.
              </p>
            )}
            <p className="text-muted">Its mapping content is frozen afterwards — further edits start a new draft instead. This can't be undone.</p>
          </>
        }
      />
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-2xs text-muted w-[76px] shrink-0">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

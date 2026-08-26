import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/Button';
import { Pane } from '../../../components/Pane';
import { Tag } from '../../../components/Tag';
import { SelectAllToggle } from '../../../components/SelectAllToggle';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { fmtDateTime } from '../../../lib/format';
import type { FmdVersion } from '../../../types/entities';

/** Everything about releasing a draft: the pending changes with checkboxes, the draft's own
 * metadata, and Publish — which lives ONLY here, not in the dialog toolbar, because it applies to
 * exactly one thing and only when that thing exists.
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

  // Everything ticked by default: publishing all of it is the common case, and unticking the few
  // you want to hold back is less work than ticking the many you don't.
  useEffect(() => {
    setSelectedChanges(pendingChanges.map((c) => c.id));
  }, [draftVersion?.id, pendingChanges.length]);

  const allSelected = selectedChanges.length === pendingChanges.length;
  const heldBack = pendingChanges.length - selectedChanges.length;

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
                <span className="text-2xs text-muted">{selectedChanges.length} of {pendingChanges.length} selected</span>
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
          ) : pendingChanges.length === 0 ? (
            <div className="p-4">
              <p className="text-sm2 text-text">
                {draftChangeSummary ?? 'This FMD has never been published — publishing releases it for the first time.'}
              </p>
              <p className="text-2xs text-muted mt-1.5">
                This draft was generated rather than hand-edited, so it publishes as a whole.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {pendingChanges.map((c) => (
                <label key={c.id} className="flex items-start gap-2.5 px-3 py-2.5 border-b border-line-soft last:border-b-0 cursor-pointer hover:bg-blue-pale">
                  <input
                    type="checkbox" className="w-3.5 h-3.5 accent-[var(--blue)] mt-0.5 shrink-0"
                    checked={selectedChanges.includes(c.id)}
                    onChange={() => setSelectedChanges((cur) => cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id])}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {c.structureIdent && <span className="text-sm2 font-mono font-semibold">{c.structureIdent}</span>}
                      <span className="text-sm2 font-mono text-muted">{c.rowLabel}</span>
                      <Tag variant="column" size="sm">{c.field}</Tag>
                      <span className="text-2xs text-muted ml-auto shrink-0">{c.by} · {fmtDateTime(c.at)}</span>
                    </div>
                    <div className="text-sm2 mt-1 flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-red line-through decoration-1">{c.from || '—'}</span>
                      <span className="text-muted">→</span>
                      <span className="text-green font-semibold">{c.to || '—'}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </Pane>

        {draftVersion && (
          <Pane title="Draft" className="w-[300px] shrink-0" bodyClassName="p-3.5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag variant="danger" size="sm">Draft</Tag>
                <span className="text-2xs text-muted">not yet a version</span>
              </div>
              {nextVersion && (
                <div className="text-sm2">
                  <span className="text-muted">Publishes as</span>{' '}
                  <span className="font-mono font-semibold text-blue-deep">{nextVersion}</span>
                </div>
              )}
              <div className="text-sm2"><span className="text-muted">Started by</span> <span className="font-semibold">{draftVersion.createdBy ?? '—'}</span></div>
              <div className="text-sm2"><span className="text-muted">Last edit</span> {fmtDateTime(draftVersion.changedAt ?? draftVersion.createdAt)}</div>
              {lastPublished && (
                <div className="text-sm2"><span className="text-muted">Live now</span> <span className="font-mono font-semibold">{lastPublished.version}</span></div>
              )}
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
                  {pendingChanges.length > 0 ? `Publish ${selectedChanges.length} change${selectedChanges.length === 1 ? '' : 's'}` : `Publish ${nextVersion ?? 'draft'}`}
                </Button>
                <p className="text-2xs text-muted">
                  {reviewing
                            ? 'Waiting for the mapping review to finish — both write to the same version.'
                            : mayPublish
                    ? 'Publishing freezes this version — its mapping content can never be edited again.'
                    : `Only ${owner ?? 'the object owner (assign one in Scope > Criteria)'} or a programme lead can publish.`}
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

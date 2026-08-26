import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { useToast } from '../../components/Toast';
import { REVIEW_POINT_CATEGORIES } from '../../lib/reviewPointCategories';

export interface ReviewPointTarget {
  structureId: string; structureIdent: string; rowKey: string; rowLabel: string;
  /** The specific cell this was raised from — omitted for a whole-row point. */
  field?: string;
  /** The cell's current value, shown read-only so the author can see what they're commenting on. */
  value?: string;
}

/** Composer for a review point raised from a table cell. Deliberately shows the target (structure,
 * row, field and the value itself) rather than trusting the author to remember which cell they
 * right-clicked — the grid is dense and the dialog covers it. */
export function AddReviewPointDialog({ target, canAdd, onSubmit, onClose }: {
  target: ReviewPointTarget | null;
  /** False when the current user isn't the FMD owner — the dialog explains rather than silently
   * refusing, since the right-click affordance is visible to everyone. */
  canAdd: boolean;
  onSubmit: (tag: string, body: string) => Promise<void>;
  onClose: () => void;
}) {
  const toast = useToast();
  const [tag, setTag] = useState<string>('todo');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setTag('todo'); setBody(''); }, [target?.structureId, target?.rowKey, target?.field]);

  if (!target) return null;

  const save = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await onSubmit(tag, body.trim());
      toast.success('Review point added.');
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Could not add the review point.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!target} onClose={onClose} title="Add review point" size="md"
      unsavedWarning={body.trim() ? 'Your review point has not been added yet.' : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving || !body.trim() || !canAdd}>
            {saving ? 'Adding…' : 'Add review point'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] p-3.5 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Tag variant="table">{target.structureIdent}</Tag>
            <span className="text-sm2 font-mono font-bold">{target.rowLabel}</span>
            {target.field && <><span className="text-muted">·</span><Tag variant="column">{target.field}</Tag></>}
          </div>
          {target.field && (
            <div>
              <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-0.5">Current value</div>
              <div className="text-sm2 whitespace-pre-wrap break-words">{target.value || <span className="text-muted">— empty —</span>}</div>
            </div>
          )}
        </div>

        <div>
          <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1.5">Category</div>
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_POINT_CATEGORIES.map((c) => (
              <button
                key={c.key} onClick={() => setTag(c.key)} title={c.hint}
                className={clsx(
                  'text-sm2 font-semibold px-3 py-1.5 rounded-[8px] border',
                  tag === c.key ? 'bg-blue text-white border-blue' : 'bg-surface text-text border-line-strong hover:border-blue-mid/40',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-2xs text-muted mt-1.5">{REVIEW_POINT_CATEGORIES.find((c) => c.key === tag)?.hint}</p>
        </div>

        <div>
          <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1.5">Review point</div>
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)} rows={4} autoFocus disabled={!canAdd}
            placeholder="What needs attention on this field?"
            className="w-full text-sm2 bg-surface border border-line-strong rounded-[8px] px-[11px] py-2 resize-y disabled:opacity-60"
          />
        </div>

        {!canAdd && (
          <p className="text-2xs text-amber-ink bg-amber-bg rounded-[8px] px-3 py-2">
            Only this FMD's owner can add review points. Claim ownership from the viewer's header first.
          </p>
        )}
      </div>
    </Dialog>
  );
}

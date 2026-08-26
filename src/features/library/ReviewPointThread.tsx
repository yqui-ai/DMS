import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, CornerDownRight, MessageSquare, Send } from 'lucide-react';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { fmtDateTime } from '../../lib/format';
import { reviewPointCategory } from '../../lib/reviewPointCategories';
import type { FmdFieldNote } from '../../types/entities';

/** One review point and its comment thread. Anyone with access to the FMD can reply and can raise
 * points — only resolution is a deliberate act, so that's the single control kept distinct.
 * `compact` drops the meta line to fit the narrow field-level panel. */
export function ReviewPointThread({ point, replies, onReply, onToggleResolved, meta, compact, collapsible }: {
  point: FmdFieldNote;
  replies: FmdFieldNote[];
  onReply: (parent: FmdFieldNote, body: string) => Promise<void>;
  onToggleResolved: (noteId: string, resolved: boolean) => Promise<void>;
  /** Extra identifying content (structure / row / "not in this version") rendered under the header. */
  meta?: React.ReactNode;
  compact?: boolean;
  /** Lets the whole point fold to its header. Closed points start folded — settled work shouldn't
   * cost the same screen space as work still outstanding. */
  collapsible?: boolean;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [expanded, setExpanded] = useState(!point.resolved);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const cat = reviewPointCategory(point.tag);
  const open = !collapsible || expanded;

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await onReply(point, draft.trim());
      setDraft('');
      setReplyOpen(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={clsx('shrink-0 border-b border-line-soft last:border-b-0', point.resolved && 'opacity-60')}>
      <div className={compact ? 'p-2' : 'p-2.5'}>
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          {collapsible && (
            <button onClick={() => setExpanded((o) => !o)} aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'} className="text-muted hover:text-text shrink-0">
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
          <Tag variant={cat.variant}>{cat.label}</Tag>
          {point.field && <Tag variant="column">{point.field}</Tag>}
          {point.resolved && <Tag variant="accent">{cat.actionable ? 'Done' : 'Archived'}</Tag>}
          {!open && replies.length > 0 && <span className="text-2xs text-muted">{replies.length} comment{replies.length === 1 ? '' : 's'}</span>}
          <span className="text-2xs text-muted ml-auto shrink-0">{fmtDateTime(point.createdAt)}</span>
        </div>
        {meta}
        {/* Collapsed still shows one line of the body — a point identified only by category and
            field is rarely enough to recognise which one it is. */}
        <p className={clsx('text-sm2 text-text whitespace-pre-wrap mt-0.5', !open && 'truncate')}>{point.body}</p>
        {open && (
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
            <span className="text-2xs text-muted truncate">{point.createdBy}</span>
            <button onClick={() => setReplyOpen((o) => !o)} className="text-2xs font-semibold text-blue hover:underline flex items-center gap-1">
              <MessageSquare size={10} /> Comment{replies.length > 0 ? ` (${replies.length})` : ''}
            </button>
            <button onClick={() => onToggleResolved(point.id, !point.resolved)} className="text-2xs font-semibold text-blue hover:underline ml-auto shrink-0">
              {point.resolved ? 'Reopen' : cat.actionable ? 'Mark done' : 'Archive'}
            </button>
          </div>
        )}
      </div>

      {open && replies.length > 0 && (
        <div className="border-t border-line flex flex-col">
          {replies.map((r) => (
            <div key={r.id} className={clsx('flex gap-1.5 border-b border-line last:border-b-0', compact ? 'px-2 py-1.5' : 'px-2.5 py-2')}>
              <CornerDownRight size={11} className="text-muted shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm2 text-text whitespace-pre-wrap">{r.body}</p>
                <div className="text-2xs text-muted mt-0.5">{r.createdBy} · {fmtDateTime(r.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && replyOpen && (
        <div className="border-t border-line p-2 flex items-end gap-1.5">
          <textarea
            value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} autoFocus placeholder="Add a comment…"
            className="flex-1 text-sm2 bg-surface border border-line-strong rounded-[8px] px-2 py-1.5 resize-none"
          />
          <Button variant="primary" size="sm" onClick={send} disabled={sending || !draft.trim()} aria-label="Post comment">
            <Send size={13} />
          </Button>
        </div>
      )}
    </div>
  );
}

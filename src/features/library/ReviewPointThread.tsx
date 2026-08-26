import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, MessageSquare, Send } from 'lucide-react';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { fmtDateTime } from '../../lib/format';
import { reviewPointCategory } from '../../lib/reviewPointCategories';
import type { FmdFieldNote } from '../../types/entities';

/** How far replies keep stepping right before they stop.
 *
 * The DATA nests without limit — `parent_id` is self-referencing and `reply()` accepts any note as
 * a parent — but the indent can't, or a long argument walks off the right edge of a 300px panel.
 * Three levels is what a discussion actually uses: the point, an answer, and a response to that
 * answer. Deeper replies still render, in the right order, at the third level's indent. */
const MAX_INDENT = 2;

/** One comment, plus everything said in response to it.
 *
 * Recursion is the point: this component used to render one flat list of direct replies, so a reply
 * TO a reply was stored correctly and displayed nowhere — the note existed, and nobody could see it. */
function Reply({ note, childrenOf, depth, replyingTo, setReplyingTo, onReply, compact }: {
  note: FmdFieldNote;
  childrenOf: Map<string, FmdFieldNote[]>;
  depth: number;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  onReply: (parent: FmdFieldNote, body: string) => Promise<void>;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const children = childrenOf.get(note.id) ?? [];
  const isReplying = replyingTo === note.id;

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await onReply(note, draft.trim());
      setDraft('');
      setReplyingTo(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={clsx(depth > 0 && 'border-l border-line', depth > 0 && (compact ? 'pl-2 ml-1' : 'pl-2.5 ml-1.5'))}>
      <div className="min-w-0 py-1">
        <p className="text-sm2 text-text whitespace-pre-wrap break-words">{note.body}</p>
        <div className="flex items-center gap-2.5 mt-0.5">
          <span className="text-2xs text-muted truncate">{note.createdBy} · {fmtDateTime(note.createdAt)}</span>
          <button
            onClick={() => setReplyingTo(isReplying ? null : note.id)}
            className="text-2xs font-semibold text-blue hover:underline shrink-0"
          >
            Reply
          </button>
        </div>

        {isReplying && (
          <div className="flex items-end gap-1.5 mt-1.5">
            <textarea
              value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} autoFocus
              placeholder={`Reply to ${note.createdBy}…`}
              className="flex-1 text-sm2 bg-surface border border-line-strong rounded-[8px] px-2 py-1.5 resize-none"
            />
            <Button variant="primary" size="sm" onClick={send} disabled={sending || !draft.trim()} aria-label="Post reply">
              <Send size={13} />
            </Button>
          </div>
        )}
      </div>

      {children.map((child) => (
        <Reply
          key={child.id} note={child} childrenOf={childrenOf}
          // Stop stepping right at the cap; the nesting is still real, it just stops costing width.
          depth={Math.min(depth + 1, MAX_INDENT)}
          replyingTo={replyingTo} setReplyingTo={setReplyingTo} onReply={onReply} compact={compact}
        />
      ))}
    </div>
  );
}

/** One review point and its comment thread. Anyone with access to the FMD can reply and can raise
 * points — only resolution is a deliberate act, so that's the single control kept distinct.
 * `compact` drops the meta line to fit the narrow field-level panel. */
export function ReviewPointThread({ point, allNotes, onReply, onToggleResolved, meta, compact, collapsible, onOpenField }: {
  point: FmdFieldNote;
  /** Every note in scope, at any depth. The thread selects its own descendants rather than being
   * handed a pre-flattened list of direct replies — which is what limited it to two levels. */
  allNotes: FmdFieldNote[];
  onReply: (parent: FmdFieldNote, body: string) => Promise<void>;
  onToggleResolved: (noteId: string, resolved: boolean) => Promise<void>;
  /** Extra identifying content (structure / row / "not in this version") rendered under the header. */
  meta?: React.ReactNode;
  compact?: boolean;
  /** Lets the whole point fold to its header. Closed points start folded — settled work shouldn't
   * cost the same screen space as work still outstanding. */
  collapsible?: boolean;
  /** Double-click the point's header to open the field it was written against. Omitted when the
   * row no longer exists in the selected version, so there's nowhere to go. */
  onOpenField?: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!point.resolved);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const cat = reviewPointCategory(point.tag);
  const open = !collapsible || expanded;

  const childrenOf = useMemo(() => {
    const m = new Map<string, FmdFieldNote[]>();
    for (const n of allNotes) {
      if (!n.parentId) continue;
      m.set(n.parentId, [...(m.get(n.parentId) ?? []), n]);
    }
    // Oldest first, so a thread reads in the order it was written at every level.
    for (const list of m.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return m;
  }, [allNotes]);

  const topReplies = childrenOf.get(point.id) ?? [];
  /** Everything under this point, however deep — the collapsed header's count has to mean "the whole
   * conversation", not "the answers that happen to be direct". */
  const replyCount = useMemo(() => {
    let n = 0;
    const walk = (id: string) => { for (const c of childrenOf.get(id) ?? []) { n += 1; walk(c.id); } };
    walk(point.id);
    return n;
  }, [childrenOf, point.id]);

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
        {/* Only the identifying part of the point opens the field — not the replies below it, where
            a double-click is someone selecting a word in their own draft. */}
        <div
          onDoubleClick={onOpenField}
          title={onOpenField ? 'Double-click to open this field' : undefined}
          className={clsx(onOpenField && 'cursor-pointer')}
        >
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {collapsible && (
              <button onClick={() => setExpanded((o) => !o)} aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'} className="text-muted hover:text-text shrink-0">
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            )}
            <Tag variant={cat.variant}>{cat.label}</Tag>
            {point.field && <Tag variant="column">{point.field}</Tag>}
            {point.resolved && <Tag variant="accent">{cat.actionable ? 'Done' : 'Archived'}</Tag>}
            {!open && replyCount > 0 && <span className="text-2xs text-muted">{replyCount} comment{replyCount === 1 ? '' : 's'}</span>}
            <span className="text-2xs text-muted ml-auto shrink-0">{fmtDateTime(point.createdAt)}</span>
          </div>
          {meta}
          {/* Collapsed still shows one line of the body — a point identified only by category and
              field is rarely enough to recognise which one it is. */}
          <p className={clsx('text-sm2 text-text whitespace-pre-wrap mt-0.5', !open && 'truncate')}>{point.body}</p>
        </div>
        {open && (
          <>
            {/* Author on its own line. Sharing the action row meant three items competing for a
                250px panel: it wrapped, and "Mark done" landed alone on a right-aligned line of its
                own, which is the ragged edge that made this list look untidy. */}
            <div className="text-2xs text-muted truncate mt-0.5">{point.createdBy}</div>
            <div className="flex items-center gap-3 mt-1">
              <button onClick={() => setReplyOpen((o) => !o)} className="text-2xs font-semibold text-blue hover:underline flex items-center gap-1">
                <MessageSquare size={10} /> Comment{replyCount > 0 ? ` (${replyCount})` : ''}
              </button>
              <button onClick={() => onToggleResolved(point.id, !point.resolved)} className="text-2xs font-semibold text-blue hover:underline ml-auto shrink-0">
                {point.resolved ? 'Reopen' : cat.actionable ? 'Mark done' : 'Archive'}
              </button>
            </div>
          </>
        )}
      </div>

      {open && topReplies.length > 0 && (
        // Indented under a single rule rather than a bordered row each. One line down the left says
        // "these belong to the point above" for the whole run.
        <div className={clsx('flex flex-col border-l border-line ml-4 mb-2', compact ? 'pl-2' : 'pl-2.5')}>
          {topReplies.map((r) => (
            <Reply
              key={r.id} note={r} childrenOf={childrenOf} depth={0}
              replyingTo={replyingTo} setReplyingTo={setReplyingTo} onReply={onReply} compact={compact}
            />
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

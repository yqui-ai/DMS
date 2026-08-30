import { useMemo, useState } from 'react';
import { ChevronDown, MessageSquarePlus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Pane } from '../../../components/Pane';
import { Tag } from '../../../components/Tag';
import { Button } from '../../../components/Button';
import { Select } from '../../../components/Select';
import { useToast } from '../../../components/Toast';
import { fmtDateTime } from '../../../lib/format';
import { REVIEW_POINT_CATEGORIES, isActionable, reviewPointCategory } from '../../../lib/reviewPointCategories';
import { flattenXref } from '../../../lib/xrefHealth';
import { By, Fact, Group } from '../fmd/versionFacts';
import { useXrefReviewMutations, useXrefReviewPoints, type XrefReviewPoint } from '../../../lib/queries/xrefReview';
import type { LibraryXrefRow } from '../../../lib/queries/rules';
import type { XrefVersion } from '../../../types/entities';

/** ⚠ NOT MOUNTED YET — for the non-Golden XREF viewer, which does not exist.
 *
 * Removed from the Golden XREF viewer for the reason the FMD makes the same split: its Versions tab
 * is labelled "Versions & Review" only for CUSTOM FMDs. A review is something you write about a
 * document being built for a subproject; the Golden template is what those are generated from, and
 * it has the designer's change comments instead. The Golden viewer now renders `XrefVersionsTab`
 * (details only); this is what a Standard XREF's viewer will render.
 *
 * The backing table and queries (`xref_review_points`, migration 0060, `queries/xrefReview.ts`) are
 * live — they were kept when this tab was unmounted, so wiring this up later needs no schema work.
 *
 * ── What it does ─────────────────────────────────────────────────────────────────────────────
 * The selected version's facts, beside the review of the template.
 *
 * Mirrors the FMD's Versions & Review tab: version details on the left, review points on the right,
 * both in the shared `Pane` so their headers sit on one baseline. The FMD has a third pane for the
 * AI's auto review — there is deliberately no XREF equivalent, because that review reads MAPPING
 * data (a rule per row, a source and a target) and a template has none. An empty pane labelled
 * "Auto review" would be a promise the data cannot keep.
 *
 * Review points attach to the TABLE, not to a version — a point about the template survives the
 * next release, which is the whole reason it is worth writing one. That is why the list is not
 * filtered by the version selected in the header. */
export function XrefReviewTab({ xref, versions, selected }: {
  xref: LibraryXrefRow;
  versions: XrefVersion[];
  selected?: XrefVersion;
}) {
  const latest = versions[0];
  const { data: points = [], isLoading } = useXrefReviewPoints(xref.id);

  const roots = useMemo(() => points.filter((p) => !p.parentId), [points]);
  const repliesOf = useMemo(() => {
    const m = new Map<string, XrefReviewPoint[]>();
    for (const p of points) if (p.parentId) m.set(p.parentId, [...(m.get(p.parentId) ?? []), p]);
    return m;
  }, [points]);

  const open = roots.filter((p) => !p.resolved && isActionable(p.tag)).length;

  return (
    <div className="h-full flex gap-3 min-h-0">
      <Pane title="Version details" className="w-[320px] shrink-0 min-h-0" bodyClassName="p-3.5 overflow-auto">
        {selected ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-sm2 text-blue-deep w-fit bg-blue-pale px-2 py-0.5 rounded">
                {selected.version}
              </span>
              {!selected.publishedAt
                ? <Tag variant="danger">Draft</Tag>
                : selected.id === latest?.id && <Tag variant="accent">Latest</Tag>}
            </div>

            <Group>
              <Fact label="Modified by"><By who={selected.createdBy} at={selected.createdAt} /></Fact>
              <Fact label="Published by">
                {selected.publishedAt
                  ? <By who={selected.publishedBy} at={selected.publishedAt} />
                  : <span className="text-muted">Not published yet</span>}
              </Fact>
            </Group>

            <Group>
              <Fact label="Class">{xref.class}</Fact>
              <Fact label="Reference">{xref.reference}</Fact>
              <Fact label="Fields">{flattenXref(selected.structure).length}</Fact>
              <Fact label="Versions">{versions.length}</Fact>
            </Group>

            <Group>
              <Fact label="Comment">
                {selected.comment || <span className="text-muted">No comment provided</span>}
              </Fact>
            </Group>
          </div>
        ) : (
          <p className="text-sm2 text-muted">No versions yet.</p>
        )}
      </Pane>

      <Pane
        title="Review points"
        className="flex-1 min-w-0 min-h-0"
        actions={
          open > 0
            ? <Tag variant="warn" size="sm">{open} open</Tag>
            : <Tag variant="accent" size="sm">Nothing outstanding</Tag>
        }
      >
        <div className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <p className="text-sm2 text-muted p-3.5">Loading…</p>
            ) : roots.length === 0 ? (
              <p className="text-sm2 text-muted p-3.5">
                Nothing raised yet. A review point records what needs changing about the template, or
                why it is the way it is — it stays attached across releases.
              </p>
            ) : (
              roots.map((p) => (
                <PointRow
                  key={p.id} point={p} replies={repliesOf.get(p.id) ?? []} xrefId={xref.id}
                />
              ))
            )}
          </div>
          <Composer xref={xref} structure={selected?.structure} />
        </div>
      </Pane>
    </div>
  );
}

/** One point and its thread. Resolved points start folded — they are the record, not the work. */
function PointRow({ point, replies, xrefId }: {
  point: XrefReviewPoint;
  replies: XrefReviewPoint[];
  xrefId: string;
}) {
  const cat = reviewPointCategory(point.tag);
  const [openThread, setOpenThread] = useState(!point.resolved);
  const [replyText, setReplyText] = useState('');
  const mutations = useXrefReviewMutations(xrefId);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, failure: string) => {
    setBusy(true);
    try { await fn(); } catch (err: any) { toast.error(err.message ?? failure); } finally { setBusy(false); }
  };

  return (
    <div className={clsx('border-b border-line-soft last:border-b-0 px-3.5 py-2.5', point.resolved && 'opacity-70')}>
      <button
        type="button"
        onClick={() => setOpenThread((v) => !v)}
        className="flex items-start gap-2 w-full text-left"
      >
        <Tag variant={cat.variant} size="sm">{cat.label}</Tag>
        {/* The anchor, when there is one. A point about the whole template says so rather than
            being silently indistinguishable from one about a field. */}
        <span className="text-2xs text-muted font-mono shrink-0 pt-0.5">
          {point.field ?? 'whole template'}
        </span>
        <span className={clsx('flex-1 min-w-0 text-sm2', !openThread && 'truncate')}>{point.body}</span>
        {point.resolved && <Tag variant="neutral" size="sm">Resolved</Tag>}
        <ChevronDown size={14} className={clsx('shrink-0 text-muted transition-transform mt-0.5', openThread && 'rotate-180')} />
      </button>

      {openThread && (
        <div className="pl-1 mt-2 flex flex-col gap-2">
          <div className="text-2xs text-muted">
            {point.createdBy} · {fmtDateTime(point.createdAt)}
          </div>

          {replies.map((r) => (
            <div key={r.id} className="border-l-2 border-line pl-2.5">
              <div className="text-sm2">{r.body}</div>
              <div className="text-2xs text-muted">{r.createdBy} · {fmtDateTime(r.createdAt)}</div>
            </div>
          ))}

          <div className="flex items-center gap-1.5">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Reply…"
              className="flex-1 min-w-0 text-sm2 bg-surface border border-line-strong rounded px-2 py-1"
            />
            <Button
              variant="quiet" size="sm" disabled={busy || !replyText.trim()}
              onClick={() => run(async () => { await mutations.reply(point, replyText); setReplyText(''); }, 'Could not post the reply.')}
            >
              Reply
            </Button>
            {/* Resolving is open to anyone, like the FMD's — RLS already decides who reaches the
                template at all, and gating comments on ownership only suppresses the review you
                want. Ownership gates CHANGING the document, which is the designer, not this. */}
            <Button
              variant="quiet" size="sm" disabled={busy}
              onClick={() => run(() => mutations.setResolved(point.id, !point.resolved), 'Could not update the point.')}
            >
              {point.resolved ? 'Reopen' : 'Resolve'}
            </Button>
            <Button
              variant="quiet" size="sm" disabled={busy}
              onClick={() => run(() => mutations.remove(point.id), 'Could not delete the point.')}
              title="Delete this point and its replies"
            >
              <Trash2 size={13} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Raise a point. Pinned to a field, or to the template as a whole. */
function Composer({ xref, structure }: { xref: LibraryXrefRow; structure?: XrefVersion['structure'] }) {
  const mutations = useXrefReviewMutations(xref.id);
  const toast = useToast();
  const [tag, setTag] = useState<string>(REVIEW_POINT_CATEGORIES[0].key);
  const [field, setField] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const fields = useMemo(() => flattenXref(structure), [structure]);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const picked = fields.find((f) => f.field === field);
      await mutations.add(tag, body, picked?.sectionName, picked?.field);
      setBody('');
    } catch (err: any) {
      toast.error(err.message ?? 'Could not raise the review point.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-line p-2.5 flex flex-wrap items-center gap-1.5 shrink-0">
      <Select value={tag} onChange={(e) => setTag(e.target.value)} size="sm">
        {REVIEW_POINT_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </Select>
      <Select value={field} onChange={(e) => setField(e.target.value)} size="sm" mono>
        <option value="">Whole template</option>
        {fields.map((f) => <option key={f.field} value={f.field}>{f.field}</option>)}
      </Select>
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
        placeholder="What needs saying about this template?"
        className="flex-1 min-w-[160px] text-sm2 bg-surface border border-line-strong rounded px-2.5 py-1.5"
      />
      <Button size="sm" onClick={submit} disabled={busy || !body.trim()}>
        <MessageSquarePlus size={13} /> Raise
      </Button>
    </div>
  );
}

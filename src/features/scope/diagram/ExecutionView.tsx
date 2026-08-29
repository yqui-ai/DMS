import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, GripVertical } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { getLayerTheme, LAYER_BAND_TEXT } from '../../../lib/layerTheme';
import { sequenceFromLayers, type GraphNode } from '../../../lib/scopeGraph';

/** The load sequence, derived from the layering rather than typed in.
 *
 * Layer 0 loads first because it needs nothing else in scope; layer 1 next, and so on. Everything
 * inside one wave is independent by definition, so those can run together — which is the schedule
 * people actually want out of a dependency graph, and the reason this view exists instead of a flat
 * numbered list.
 *
 * Rows drag to reorder, but only within their own wave. Free reordering across waves is the one
 * edit that can produce an order which fails on the day: an object placed before something it
 * requires. Constraining the drag means every order this screen can produce is a valid one, so
 * there is no violations warning to write and none to ignore. */
export function ExecutionView({ nodes, cycles = [], savedOrder, onSave, busy, canEdit = true }: {
  nodes: GraphNode[];
  /** Each dependency cycle, as the objects that form it — see findCycles. Named rather than
   * counted: 'four objects are in a cycle' could be one tangle or two, and which it is decides
   * whether breaking one link fixes half the problem. */
  cycles?: string[][];
  /** Object ids in the order currently persisted as `load_seq`. */
  savedOrder: string[];
  onSave?: (order: string[]) => void;
  busy?: boolean;
  canEdit?: boolean;
}) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const derived = useMemo(() => sequenceFromLayers(nodes, draft ?? savedOrder), [nodes, draft, savedOrder]);
  const order = draft ?? derived;

  const waves = useMemo(() => {
    const grouped = new Map<number, string[]>();
    for (const id of order) {
      const node = byId.get(id);
      if (!node) continue;
      grouped.set(node.layer, [...(grouped.get(node.layer) ?? []), id]);
    }
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [order, byId]);

  /** The saved sequence is out of date when it does not list the same objects in the same order —
   * a new object added to the scope leaves it stale just as surely as a reorder does. */
  const unsaved = order.join() !== savedOrder.join();

  const drop = (targetId: string) => {
    if (!dragging || dragging === targetId) return setDragging(null);
    // Same wave only. A cross-wave drop is silently ignored rather than clamped: moving a row to a
    // position it cannot legally occupy has no sensible "nearest valid" answer.
    if (byId.get(dragging)?.layer !== byId.get(targetId)?.layer) return setDragging(null);
    const next = [...order];
    next.splice(next.indexOf(targetId), 0, ...next.splice(next.indexOf(dragging), 1));
    setDraft(next);
    setDragging(null);
  };

  if (nodes.length === 0) {
    return <EmptyState title="Nothing to sequence" description="Select the objects to migrate and their load order is worked out here." />;
  }

  let running = 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-sm2 text-text">
          <span className="font-bold tabular-nums">{waves.length}</span> wave{waves.length === 1 ? '' : 's'},{' '}
          <span className="font-bold tabular-nums">{nodes.length}</span> object{nodes.length === 1 ? '' : 's'}.
          <span className="text-muted"> Everything in one wave can load in parallel.</span>
        </p>
        <div className="ml-auto flex items-center gap-2">
          {draft && (
            <Button variant="quiet" size="sm" onClick={() => setDraft(null)} disabled={busy}>
              Reset to derived order
            </Button>
          )}
          {canEdit && onSave && (
            unsaved ? (
              <Button variant="primary" size="sm" onClick={() => { onSave(order); setDraft(null); }} disabled={busy}>
                {busy ? 'Saving…' : 'Save load sequence'}
              </Button>
            ) : (
              <span className="text-2xs text-green flex items-center gap-1.5">
                <CheckCircle2 size={13} /> Saved sequence matches
              </span>
            )
          )}
        </div>
      </div>

      {cycles.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg bg-amber-bg shadow-[inset_0_0_0_1px_var(--amber-ink)] px-3.5 py-2.5">
          <AlertTriangle size={15} className="text-amber-ink shrink-0 mt-px" />
          <div className="text-2xs text-amber-ink min-w-0">
            <span className="font-semibold">
              {cycles.length} dependency cycle{cycles.length === 1 ? '' : 's'}.
            </span>{' '}
            A cycle has no valid load order, so the waves below are a best guess for the objects in
            one. Nothing is reordered to hide it — break the loop by taking a dependency out of
            scope or marking it optional.
            {/* Named, one line each, so it is obvious which links to look at. */}
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {cycles.map((cycle, i) => (
                <li key={i} className="font-mono font-semibold break-words">
                  {cycle.map((id) => byId.get(id)?.ident ?? id).join(' → ')}
                  {cycle.length > 1 ? ` → ${byId.get(cycle[0])?.ident ?? cycle[0]}` : ' (itself)'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Waves are a SCHEDULE, so they are laid out like one: a continuous coloured spine down the
          left, and a quiet header per wave.

          Every wave used to be a full-bleed saturated bar. Seven of them stacked turned a load plan
          into a colour chart — the bars were the loudest thing on the page while carrying one word
          and a count each, and the object rows they exist to introduce read as an afterthought. The
          layer hue still identifies the wave, but as a 3px spine and a small chip: enough to track
          one wave down the page, not enough to compete with its contents. */}
      <div className="flex flex-col">
        {waves.map(([layer, ids], waveIndex) => {
          const theme = getLayerTheme(layer);
          const last = waveIndex === waves.length - 1;
          return (
            <section key={layer} className="flex gap-3">
              <div className="shrink-0 flex flex-col items-center w-[3px]">
                <span className="w-[3px] flex-1 rounded-full" style={{ background: theme.band }} />
                {!last && <span className="w-[3px] h-2.5" style={{ background: `${theme.band}55` }} />}
              </div>

              <div className={clsx('min-w-0 flex-1', !last && 'pb-3')}>
                <div className="flex items-baseline gap-2 py-1.5">
                  <span
                    className="text-2xs font-bold rounded-pill px-2 py-0.5 shrink-0"
                    style={{ background: theme.band, color: LAYER_BAND_TEXT }}
                  >
                    Wave {layer + 1}
                  </span>
                  <span className="text-2xs text-muted tabular-nums">
                    {ids.length} object{ids.length === 1 ? '' : 's'}
                  </span>
                  <span className="text-2xs text-muted ml-auto shrink-0">
                    {layer === 0 ? 'No prerequisites in scope' : `Waits for wave ${layer}`}
                  </span>
                </div>

                <div className="divide-y divide-line-soft bg-surface rounded shadow-[inset_0_0_0_1px_var(--line)]">
                {ids.map((id) => {
                  const node = byId.get(id)!;
                  running += 1;
                  return (
                    <div
                      key={id}
                      draggable={canEdit}
                      onDragStart={() => setDragging(id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => drop(id)}
                      onDragEnd={() => setDragging(null)}
                      className={clsx(
                        'flex items-center gap-2.5 px-3 py-1.5',
                        canEdit && 'cursor-grab active:cursor-grabbing',
                        dragging === id && 'opacity-40',
                      )}
                    >
                      {canEdit && <GripVertical size={12} className="text-muted shrink-0" />}
                      <span className="text-2xs font-bold text-muted w-7 tabular-nums shrink-0">{running}</span>
                      <span className="text-sm2 font-mono font-bold shrink-0" style={{ color: theme.ink }}>{node.ident}</span>
                      <span className="text-sm2 text-text truncate flex-1">{node.name}</span>
                      {node.requires.length > 0 && (
                        <span className="text-2xs text-muted shrink-0" title="Prerequisites in scope">
                          needs {node.requires.length}
                        </span>
                      )}
                      {/* No per-row cycle flag. Cycles are named once in the banner above — badging
                          every member turned two objects into six warnings on one screen. */}
                    </div>
                  );
                })}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {canEdit && <p className="text-2xs text-muted">Drag a row to reorder it within its wave. Waves themselves are fixed by the dependencies.</p>}
    </div>
  );
}

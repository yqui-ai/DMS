import { useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowDown, ArrowUp, Box, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { getLayerTheme, LAYER_BAND_TEXT } from '../../../lib/layerTheme';
import { sequenceFromLayers, type GraphEdge, type GraphNode } from '../../../lib/scopeGraph';

/* Node geometry.
 *
 * These are exact because React Flow positions absolutely — a box shorter than its content clips it
 * with no scrollbar and no warning, which is what happened to every object whose name wrapped to a
 * second line ("Supplier - extend existing record by new org levels" lost its whole bottom row).
 * NODE_H is budgeted for the worst case rather than the common one: header 24 + padding 12 + two
 * title lines 30 + ident 15 + meta row 21 = 102, rounded up. Widening to 240 also means most names
 * now fit on one line, so the worst case is rarer than it was. */
const NODE_W = 240;
const NODE_H = 106;
const ROW_GAP = 18;
const STAGE_GAP = 60;
const STAGE_HEADER = 46;
const STAGE_PAD = 14;

/** One object. Component badge, name, ident, type, and the two counts people chase: how many things
 * it needs, and how many need it. */
function ObjectNode({ data }: { data: Record<string, unknown> }) {
  const theme = getLayerTheme(data.layer as number);
  const cyclic = data.cyclic as boolean;
  return (
    <div
      className="rounded bg-surface overflow-hidden text-left flex flex-col"
      style={{
        width: NODE_W,
        height: NODE_H,
        // 1.5px, not 1: at 1px a saturated hue on white reads as grey once the canvas zooms out.
        boxShadow: `inset 0 0 0 1.5px ${cyclic ? 'var(--red)' : theme.ink}`,
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-0" />
      {/* Saturated band, white text — the pairing the palette verifies. Never put `ink` on `band`. */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 text-2xs font-bold shrink-0"
        style={{ background: cyclic ? 'var(--red)' : theme.band, color: LAYER_BAND_TEXT }}
      >
        <Box size={11} className="shrink-0" />
        <span className="truncate">{(data.component as string) || '—'}</span>
        {cyclic && <span className="ml-auto shrink-0" title="Part of a dependency cycle">↻</span>}
      </div>
      <div className="px-2.5 py-1.5 flex flex-col flex-1 min-h-0">
        <div className="text-2xs font-semibold text-text leading-[1.25] line-clamp-2">{data.name as string}</div>
        <div className="text-2xs font-mono text-muted truncate">{data.ident as string}</div>
        <div className="flex items-center gap-2 mt-auto pt-1">
          {!!data.category && (
            <span className="text-2xs text-muted rounded-xs px-1 py-px truncate" style={{ background: theme.wash }}>
              {data.category as string}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5 text-2xs text-muted tabular-nums shrink-0">
            <span className="flex items-center gap-0.5" title="Objects that need this"><ArrowUp size={9} />{data.requiredBy as number}</span>
            <span className="flex items-center gap-0.5" title="Prerequisites in scope"><ArrowDown size={9} />{data.requires as number}</span>
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-0" />
    </div>
  );
}

function StageBand({ data }: { data: Record<string, unknown> }) {
  const layer = data.layer as number;
  const theme = getLayerTheme(layer);
  const count = data.count as number;
  return (
    <div
      className="rounded-lg w-full h-full overflow-hidden"
      style={{ background: theme.wash, boxShadow: `inset 0 0 0 1px ${theme.ink}33` }}
    >
      {/* The stage label is the saturated band itself, so which stage you are looking at is legible
          from across the canvas rather than only when zoomed in on a pale tint. */}
      <div
        className="flex items-baseline gap-2 px-3 shrink-0"
        style={{ height: STAGE_HEADER, background: theme.band, color: LAYER_BAND_TEXT }}
      >
        <span className="text-2xs font-bold uppercase tracking-[.08em] opacity-75">Load Stage</span>
        <span className="text-md font-bold">L{layer}</span>
        <span className="ml-auto text-2xs font-semibold opacity-85 tabular-nums">
          {count} object{count === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

const nodeTypes = { object: ObjectNode, stage: StageBand };

/** Step 5 — the executable load order, as a diagram.
 *
 * Stages run left to right and the arrows run prerequisite → dependent, so the picture reads in the
 * direction the load actually executes. Everything inside one stage is independent by definition and
 * can run in parallel — which is the schedule people want out of a dependency graph, and what a flat
 * numbered list cannot show.
 *
 * A circular prerequisite is drawn dotted and EXCLUDED from staging rather than resolved. There is no
 * correct stage for an object in a cycle; inventing one would produce a plan that fails on the day
 * while looking settled. It is named underneath instead. */
export function LoadSequenceStep({
  nodes, edges, cycles, savedOrder, onSave, busy,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cycles: string[][];
  savedOrder: string[];
  onSave: (order: string[]) => void;
  busy?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const derived = useMemo(() => sequenceFromLayers(nodes, savedOrder), [nodes, savedOrder]);
  const unsaved = derived.join() !== savedOrder.join();

  /** Edge ids that close a cycle — drawn dotted, and never allowed to imply an order. */
  const cyclicEdges = useMemo(() => {
    const inCycle = new Set(cycles.flat());
    return new Set(
      edges.filter((e) => inCycle.has(e.source) && inCycle.has(e.target)).map((e) => e.id),
    );
  }, [edges, cycles]);

  /** Everything reachable from the selected node, both directions — its full lineage. */
  const lineage = useMemo(() => {
    if (!selected) return null;
    const up = new Set<string>();
    const down = new Set<string>();
    const walk = (id: string, dir: 'up' | 'down', seen: Set<string>) => {
      if (seen.has(id)) return;
      seen.add(id);
      const node = byId.get(id);
      if (!node) return;
      for (const next of dir === 'down' ? node.requires : node.requiredBy) walk(next, dir, seen);
    };
    walk(selected, 'up', up);
    walk(selected, 'down', down);
    return new Set([...up, ...down]);
  }, [selected, byId]);

  const { rfNodes, rfEdges } = useMemo(() => {
    const byLayer = new Map<number, GraphNode[]>();
    for (const n of nodes) byLayer.set(n.layer, [...(byLayer.get(n.layer) ?? []), n]);
    const stages = [...byLayer.entries()].sort((a, b) => a[0] - b[0]);

    const out: Node[] = [];
    let x = 0;
    const tallest = Math.max(...stages.map(([, s]) => s.length), 1);
    const bandHeight = STAGE_HEADER + STAGE_PAD + tallest * NODE_H + (tallest - 1) * ROW_GAP + STAGE_PAD;

    for (const [layer, stageNodes] of stages) {
      stageNodes.sort((a, b) => a.ident.localeCompare(b.ident));
      const bandWidth = NODE_W + STAGE_PAD * 2;

      out.push({
        id: `stage-${layer}`,
        type: 'stage',
        position: { x, y: 0 },
        data: { layer, count: stageNodes.length },
        style: { width: bandWidth, height: bandHeight, zIndex: -1 },
        draggable: false,
        selectable: false,
      });

      stageNodes.forEach((n, i) => {
        const dimmed = !!lineage && !lineage.has(n.id);
        out.push({
          id: n.id,
          type: 'object',
          parentId: `stage-${layer}`,
          extent: 'parent',
          position: { x: STAGE_PAD, y: STAGE_HEADER + STAGE_PAD + i * (NODE_H + ROW_GAP) },
          style: { opacity: dimmed ? 0.25 : 1, transition: 'opacity .15s' },
          data: {
            ident: n.ident, name: n.name, layer: n.layer, component: n.component,
            category: n.category, requires: n.requires.length, requiredBy: n.requiredBy.length,
            cyclic: n.cyclic,
          },
        });
      });

      x += bandWidth + STAGE_GAP;
    }

    const visible = new Set(nodes.map((n) => n.id));
    const rfEdges: Edge[] = edges
      .filter((e) => visible.has(e.source) && visible.has(e.target))
      .map((e) => {
        const circular = cyclicEdges.has(e.id);
        const dimmed = !!lineage && !(lineage.has(e.source) && lineage.has(e.target));
        const colour = circular ? 'var(--muted)' : e.mandatory ? 'var(--red)' : 'var(--line-strong)';
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          /* Hidden rather than faded, matching the other two diagrams. A ghost line at 0.12 is
             still a line, and a load-sequence graph has enough of them that the lineage had to be
             found among its own shadows. Nodes stay put so the shape survives; only the edges that
             are not part of the answer go. */
          hidden: dimmed,
          style: {
            stroke: colour,
            // Heavier on the traced path — it is the only thing drawn, so it carries the emphasis.
            strokeWidth: lineage ? (circular ? 1.4 : 2.2) : (circular ? 1 : e.mandatory ? 1.4 : 1.1),
            strokeDasharray: circular ? '2 4' : e.mandatory ? undefined : '5 4',
            opacity: 1,
          },
          markerEnd: circular ? undefined : { type: MarkerType.ArrowClosed, width: 12, height: 12, color: colour },
        };
      });

    return { rfNodes: out, rfEdges };
  }, [nodes, edges, cyclicEdges, lineage]);

  if (nodes.length === 0) {
    return (
      <EmptyState
        title="Nothing to sequence"
        description="Confirm some objects and their load order is worked out here."
      />
    );
  }

  const stageCount = new Set(nodes.map((n) => n.layer)).size;

  return (
    // Same unbroken flex-1/min-h-0 chain as the other steps: the canvas takes whatever height is
    // left rather than a vh guess, so it never runs under the wizard's Back/Next footer.
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap shrink-0">
        <span className="flex items-baseline gap-1.5">
          <span className="text-md font-bold tabular-nums text-text">{stageCount}</span>
          <span className="text-2xs text-muted">Load Stages</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-md font-bold tabular-nums text-text">{nodes.length}</span>
          <span className="text-2xs text-muted">Total Objects</span>
        </span>
        {selected && (
          <button type="button" onClick={() => setSelected(null)} className="text-2xs text-blue font-semibold">
            Clear lineage
          </button>
        )}
        <div className="ml-auto">
          {unsaved ? (
            <Button variant="primary" size="sm" disabled={busy} onClick={() => onSave(derived)}>
              {busy ? 'Saving…' : 'Save load sequence'}
            </Button>
          ) : (
            <span className="text-2xs text-green flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Saved sequence matches
            </span>
          )}
        </div>
      </div>

      <p className="text-2xs text-muted shrink-0">
        Arrows run prerequisite → dependent. Click a node to trace its full lineage.
      </p>

      <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden bg-surface-2 flex-1 min-h-0">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          onNodeClick={(_, node) => setSelected((cur) => (cur === node.id ? null : node.id))}
          onPaneClick={() => setSelected(null)}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} color="var(--line)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div className="flex items-center gap-5 flex-wrap text-2xs text-muted shrink-0">
        <Legend colour="var(--red)" label="Mandatory prerequisite" />
        <Legend colour="var(--line-strong)" dash="5 4" label="Optional prerequisite" />
        <Legend colour="var(--muted)" dash="2 3" label="Circular — excluded from staging" />
      </div>

      {cycles.length > 0 && (
        <p className="text-2xs text-amber-ink shrink-0">
          <span className="font-semibold">Circular prerequisite{cycles.length === 1 ? '' : 's'}:</span>{' '}
          {cycles.map((cycle, i) => (
            <span key={i} className="font-mono font-semibold">
              {i > 0 && ' · '}
              {cycle.map((id) => byId.get(id)?.ident ?? id).join(' ⇄ ')}
            </span>
          ))}
          <span className="ml-1.5 font-normal">
            — no valid order exists for these, so they are left where they are rather than staged
            into an answer that would fail on the day.
          </span>
        </p>
      )}
    </div>
  );
}

function Legend({ colour, dash, label }: { colour: string; dash?: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="26" height="6" aria-hidden className="shrink-0">
        <line x1="0" y1="3" x2="26" y2="3" stroke={colour} strokeWidth="1.6" strokeDasharray={dash} />
      </svg>
      {label}
    </span>
  );
}

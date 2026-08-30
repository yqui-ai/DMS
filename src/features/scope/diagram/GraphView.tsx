import { useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, Handle, Position, MarkerType,
  type Edge, type Node, type NodeProps, type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { MousePointerClick, Search, Sparkles, Sun, X } from 'lucide-react';
import clsx from 'clsx';
import { ColorTag } from '../../../components/ColorTag';
import { componentMainGroup } from '../../../lib/tagColor';
import { useDismiss } from '../../../components/useDismiss';
import { useErdTheme, type ErdTheme } from '../../../lib/erdTheme';
import { getLayerTheme, LAYER_BAND_TEXT } from '../../../lib/layerTheme';
import type { GraphEdge, GraphNode } from '../../../lib/scopeGraph';

/* Node geometry matches Library > Migration Object's diagram so the two read as one picture drawn
 * twice, not two pictures. React Flow positions absolutely: a box shorter than its content clips it
 * silently, so the height covers ident + a three-line description + the tag row. */
const NODE_W = 260;
const NODE_H = 118;
const COL_GAP = 28;
const ROW_GAP = 24;
/** A layer wider than this wraps onto another row inside its own band. One 40-object row is
 * 10,000px of horizontal panning to read a single layer; wrapping keeps a layer readable as a
 * block, which is how people actually use it. */
const MAX_COLS = 8;
const BAND_HEADER = 34;
const BAND_PAD = 14;
const BAND_GAP = 30;

const FUTURISTIC_RED = '#ff5470';
const FUTURISTIC_CYAN = '#4fd1ff';

interface ScopeNodeData extends Record<string, unknown> {
  ident: string;
  name: string;
  layer: number;
  component?: string;
  category?: string;
  /** Kept for filtering/telemetry only — the card deliberately does not draw it. */
  cyclic: boolean;
  requires: number;
  requiredBy: number;
  theme: ErdTheme;
  selected: boolean;
  dimmed: boolean;
  /** Lit as part of a lineage — a selection is active and this node is in it. */
  lit: boolean;
  /** Joined to the selected node by a MANDATORY edge. Only meaningful while `lit`. */
  mandatory: boolean;
  onOpen?: () => void;
}

/** One object, in the Library diagram's card shape.
 *
 * The old node was an ident and a two-line name in a 224×76 box — enough to place a dot on a graph,
 * not enough to decide anything from. This carries the same payload as Library > Migration Object's
 * diagram: the ident (clickable, opens the object), the description, and the category/component
 * tags, so the picture answers "what IS this" without a round-trip.
 *
 * Colour rule note: `ColorTag`'s hash-derived colour is allowed here and only here — in a diagram it
 * separates node types rather than labelling a row. See the `design-system` skill. */
function ScopeNode({ data }: NodeProps<Node<ScopeNodeData>>) {
  const futuristic = data.theme === 'futuristic';
  const layer = getLayerTheme(data.layer);
  // Cycle membership is NOT drawn on the node. It is stated once, as a note under the diagram —
  // marking every member turned two objects into six red flags on one screen.
  const accent = FUTURISTIC_CYAN;

  return (
    <div
      style={{
        width: NODE_W, height: NODE_H,
        ...(futuristic
          ? {
            // A lit node is lighter than its neighbours, but both stay dark: the glow IS the
            // signal in this theme, and a glow only reads against a dark ground.
            backgroundImage: data.lit
              ? 'linear-gradient(160deg, #223060 0%, #141c3a 100%)'
              : 'linear-gradient(160deg, #161d38 0%, #0d1226 100%)',
            border: `1px solid ${data.mandatory ? FUTURISTIC_RED : accent}`,
            boxShadow: data.selected
              ? `0 0 22px 0 ${accent}, inset 0 0 24px -10px ${accent}`
              : data.mandatory
                ? `0 0 18px -2px ${FUTURISTIC_RED}, inset 0 0 20px -12px ${FUTURISTIC_RED}`
                : `0 0 14px -2px ${accent}99, inset 0 0 20px -12px ${accent}`,
          }
          : {
            /* A lit node goes WHITE. Every node normally carries a pale tint of its layer hue, and
             * once the rest of the canvas is drained to 22% grayscale those tints are the only
             * colour left — so the lineage read as "slightly less pale" rather than as the answer.
             * White against the washed-out field is the strongest contrast available and costs
             * nothing, because the layer identity is still on the ring and the band. */
            background: data.lit ? 'var(--surface)' : layer.surface,
            /* Red ring for a MANDATORY prerequisite of the selected object. Mandatory versus
             * optional is the distinction the lineage exists to surface — one is a scheduling
             * preference, the other is a load that fails without it — and it was only readable by
             * following each arrow back to the legend. */
            boxShadow: data.mandatory
              ? 'inset 0 0 0 2px var(--red)'
              : `inset 0 0 0 1.5px ${layer.ink}`,
          }),
      }}
      className={clsx(
        'flex flex-col justify-center gap-1 px-3.5 py-2.5 rounded-lg transition-all cursor-pointer',
        !futuristic && 'hover:shadow-[inset_0_0_0_2.5px_var(--blue-deep)]',
        futuristic && 'hover:brightness-125',
        // Opacity ALONE was not enough. At 30% a saturated layer ring is still a coloured shape, so
        // eight dimmed nodes still read as eight colours competing with the two you selected.
        // Draining the colour is what makes the lineage the only coloured thing on the canvas.
        data.dimmed && 'opacity-[.22] grayscale',
        data.selected && !futuristic && 'ring-2 ring-blue ring-offset-2 ring-offset-surface',
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />

      <div className="flex items-center gap-2 min-w-0">
        <span
          onClick={(e) => { e.stopPropagation(); data.onOpen?.(); }}
          title={data.onOpen ? `Open ${data.ident}` : data.ident}
          className={clsx(
            'font-mono font-bold text-sm2 truncate min-w-0 flex-1',
            data.onOpen && 'hover:underline',
          )}
          style={futuristic ? { color: '#ffffff' } : { color: layer.ink }}
        >
          {data.ident}
        </span>
        {/* The two counts people chase: how many things need this, and how many it needs. */}
        <span
          className={clsx('text-2xs tabular-nums shrink-0', futuristic ? 'text-white/50' : 'text-muted')}
          title={`${data.requiredBy} object(s) need this · needs ${data.requires} in scope`}
        >
          ↑{data.requiredBy} ↓{data.requires}
        </span>
      </div>

      <div
        className={clsx('text-2xs leading-snug line-clamp-3', futuristic ? 'text-white/60' : 'text-muted')}
        title={data.name}
      >
        {data.name || '—'}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {data.category && <ColorTag colorKey={data.category} className="text-[10px] px-1.5 py-px">{data.category}</ColorTag>}
        {data.component && (
          <ColorTag colorKey={componentMainGroup(data.component)} className="text-[10px] px-1.5 py-px">
            {data.component}
          </ColorTag>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  );
}

/** The band a layer's nodes sit in — the one thing this diagram has that the Library's does not.
 *
 * The Library diagram is a star: one root and its direct prerequisites, so there is no depth to
 * show. A scope is a whole graph, and its depth IS the answer — how many loads deep the plan goes. */
function LayerBand({ data }: { data: Record<string, unknown> }) {
  const layer = data.layer as number;
  const theme = getLayerTheme(layer);
  const futuristic = data.theme === 'futuristic';
  const count = data.count as number;
  const dimmed = data.dimmed as boolean;

  return (
    <div
      // Bands dim with their contents. They were left at full saturation while the nodes faded,
      // which made the loudest things on screen the layers you were NOT looking at — the selection
      // read as "some boxes went pale" rather than "here is the lineage".
      className={clsx('rounded-lg w-full h-full overflow-hidden transition-all', dimmed && 'opacity-25 grayscale')}
      style={futuristic
        ? { background: `${theme.band}1a`, boxShadow: `inset 0 0 0 1px ${theme.band}5c` }
        : { background: theme.wash, boxShadow: `inset 0 0 0 1px ${theme.ink}33` }}
    >
      <div
        className="text-2xs font-bold px-3 flex items-center gap-2"
        style={{ height: BAND_HEADER, background: theme.band, color: LAYER_BAND_TEXT }}
      >
        <span className="text-sm2">Layer {layer}</span>
        <span className="opacity-80 font-semibold tabular-nums">
          {count} object{count === 1 ? '' : 's'}
        </span>
        <span className="opacity-75 font-medium">
          {layer === 0 ? '· loads first, needs nothing in scope' : `· needs layer ${layer - 1} loaded`}
        </span>
      </div>
    </div>
  );
}

const nodeTypes = { object: ScopeNode, layerBand: LayerBand };

function Legend({ theme }: { theme: ErdTheme }) {
  const futuristic = theme === 'futuristic';
  return (
    <div
      className={clsx(
        'absolute top-2.5 right-2.5 z-10 rounded shadow-cardHover px-3 py-2 flex flex-col gap-1.5',
        futuristic ? 'bg-[#0f1730]/95 text-white' : 'bg-surface/95 text-text',
      )}
    >
      <div className="flex items-center gap-2 text-2xs">
        <span className="w-5 border-t-[2.5px]" style={{ borderColor: futuristic ? FUTURISTIC_RED : 'var(--red)' }} />
        Mandatory prerequisite
      </div>
      <div className="flex items-center gap-2 text-2xs">
        <span className="w-5 border-t-[2.5px] border-dashed" style={{ borderColor: futuristic ? FUTURISTIC_CYAN : '#9aa4b2' }} />
        Optional prerequisite
      </div>
    </div>
  );
}

function ThemeToggle({ theme, onChange }: { theme: ErdTheme; onChange: (t: ErdTheme) => void }) {
  const futuristic = theme === 'futuristic';
  return (
    <div className={clsx('absolute top-2.5 left-2.5 z-10 inline-flex rounded overflow-hidden shadow-cardHover', futuristic ? 'bg-[#0f1730]/95' : 'bg-surface/95')}>
      <button
        onClick={() => onChange('simple')}
        className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-semibold', !futuristic ? 'bg-blue text-white' : 'text-white/60 hover:text-white')}
      >
        <Sun size={12} /> Simple
      </button>
      <button
        onClick={() => onChange('futuristic')}
        className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-semibold', futuristic ? 'bg-blue text-white' : 'text-muted hover:text-text')}
      >
        <Sparkles size={12} /> Futuristic
      </button>
    </div>
  );
}

/** The dependency graph, drawn as layer bands.
 *
 * Same card style, legend, theme toggle and select-to-highlight interaction as Library >
 * Migration Object's diagram — deliberately, because they are the same kind of picture and looking
 * like two unrelated tools was making the app feel assembled rather than designed. What this one
 * adds is **layering**: the Library draws one root and its direct prerequisites, where there is no
 * depth to show; a scope is a whole graph and its depth is the point.
 *
 * `useErdTheme` is shared with the Library diagram on purpose: the visual style is a per-person
 * preference, and having to set it twice would mean it was never really one preference.
 *
 * Nodes stay draggable within their band so an awkward auto-layout can be nudged, but `extent:
 * 'parent'` means nothing can be dragged into the wrong layer. */
export function GraphView({ nodes, edges, height = '58vh', onOpenObject }: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  height?: string;
  /** Opens the object's details. Omitted where there is nowhere to open them. */
  onOpenObject?: (objectId: string) => void;
}) {
  const [theme, setTheme] = useErdTheme();
  const futuristic = theme === 'futuristic';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The live React Flow instance, captured on init.
   *
   * Kept in a ref rather than reached for with `useReactFlow()` because that hook only works inside
   * the provider — using it here would mean wrapping this component in a `ReactFlowProvider` purely
   * to move the viewport, which is a lot of restructuring for one call. */
  const flowRef = useRef<ReactFlowInstance | null>(null);

  /** Selects an object and moves the canvas to it.
   *
   * Selecting alone is not enough on a graph that runs several screens wide: on a scope of forty
   * objects the match you searched for lights up somewhere off-screen and the diagram looks like it
   * did nothing. `fitView` on a single node both centres and zooms; `maxZoom` stops it filling the
   * canvas with one card, and the padding keeps its neighbours in frame, which is the point of
   * finding it. */
  const focusNode = (id: string) => {
    setSelectedId(id);
    flowRef.current?.fitView({ nodes: [{ id }], duration: 450, padding: 0.55, maxZoom: 1.1 });
  };

  /** The selected node and everything directly joined to it. Selection highlights ONE hop, not the
   * whole lineage: on a layered graph a full ancestry walk usually lights up most of the diagram,
   * which answers nothing. Load Sequence is where full lineage lives. */
  const neighbourhood = useMemo(() => {
    if (!selectedId) return null;
    const keep = new Set<string>([selectedId]);
    for (const e of edges) {
      if (e.source === selectedId) keep.add(e.target);
      if (e.target === selectedId) keep.add(e.source);
    }
    return keep;
  }, [selectedId, edges]);

  /** Of the lit neighbours, the ones joined to the selection by a MANDATORY edge.
   *
   * This is the distinction the lineage exists to surface: an optional prerequisite is a scheduling
   * preference, a mandatory one is a load that fails without it. Tracing a lineage and being unable
   * to tell them apart without following each arrow back to the legend is most of the work. */
  const mandatoryNeighbours = useMemo(() => {
    if (!selectedId) return null;
    const out = new Set<string>();
    for (const e of edges) {
      if (!e.mandatory) continue;
      if (e.source === selectedId) out.add(e.target);
      if (e.target === selectedId) out.add(e.source);
    }
    return out;
  }, [selectedId, edges]);

  const { rfNodes, rfEdges } = useMemo(() => {
    const byLayer = new Map<number, GraphNode[]>();
    for (const n of nodes) byLayer.set(n.layer, [...(byLayer.get(n.layer) ?? []), n]);
    const layers = [...byLayer.entries()].sort((a, b) => a[0] - b[0]);

    const visible = new Set(nodes.map((n) => n.id));
    // Which layers the lineage actually touches — those bands stay lit, the rest recede. Dimming
    // every band equally would hide the one piece of context the selection needs: how deep it runs.
    const litLayers = neighbourhood
      ? new Set(nodes.filter((n) => neighbourhood.has(n.id)).map((n) => n.layer))
      : null;
    const out: Node[] = [];
    let y = 0;

    for (const [layer, layerNodes] of layers) {
      layerNodes.sort((a, b) => a.ident.localeCompare(b.ident));
      const cols = Math.min(MAX_COLS, layerNodes.length);
      const rows = Math.ceil(layerNodes.length / cols);
      const bandW = cols * NODE_W + (cols - 1) * COL_GAP + BAND_PAD * 2;
      const bandH = BAND_HEADER + BAND_PAD + rows * NODE_H + (rows - 1) * ROW_GAP + BAND_PAD;

      out.push({
        id: `band-${layer}`,
        type: 'layerBand',
        position: { x: 0, y },
        data: { layer, count: layerNodes.length, theme, dimmed: !!litLayers && !litLayers.has(layer) },
        style: { width: bandW, height: bandH, zIndex: -1 },
        draggable: false,
        selectable: false,
      });

      layerNodes.forEach((n, i) => {
        out.push({
          id: n.id,
          type: 'object',
          parentId: `band-${layer}`,
          extent: 'parent',
          position: {
            x: BAND_PAD + (i % cols) * (NODE_W + COL_GAP),
            y: BAND_HEADER + BAND_PAD + Math.floor(i / cols) * (NODE_H + ROW_GAP),
          },
          data: {
            ident: n.ident, name: n.name, layer: n.layer,
            component: n.component, category: n.category, cyclic: n.cyclic,
            requires: n.requires.length, requiredBy: n.requiredBy.length,
            theme,
            selected: n.id === selectedId,
            dimmed: !!neighbourhood && !neighbourhood.has(n.id),
            lit: !!neighbourhood && neighbourhood.has(n.id),
            mandatory: !!mandatoryNeighbours && mandatoryNeighbours.has(n.id),
            onOpen: onOpenObject ? () => onOpenObject(n.id) : undefined,
          } satisfies ScopeNodeData,
        });
      });

      y += bandH + BAND_GAP;
    }

    const mandatoryColour = futuristic ? FUTURISTIC_RED : 'var(--red)';
    const optionalColour = futuristic ? FUTURISTIC_CYAN : '#9aa4b2';

    const rfEdges: Edge[] = edges
      .filter((e) => visible.has(e.source) && visible.has(e.target))
      .map((e) => {
        const onPath = !!selectedId && (e.source === selectedId || e.target === selectedId);
        const dimmed = !!selectedId && !onPath;
        const colour = e.mandatory ? mandatoryColour : optionalColour;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          /* Hidden, not faded to 0.07. A dense graph kept every other edge on the canvas as a
             ghost, and on a layered diagram that is dozens of lines the lineage still has to be
             picked out from. The nodes stay visible and drained of colour, so the shape of the
             graph is not lost — only the edges that are not the answer go. */
          hidden: dimmed,
          style: {
            stroke: colour,
            // Heavier when traced: it is the only line left, and should read as the answer rather
            // than as whatever survived the filter.
            strokeWidth: onPath ? 3.5 : 1.5,
            // An optional prerequisite is drawn dashed: the picture should say which arrows are
            // negotiable without anyone having to click one.
            strokeDasharray: e.mandatory ? undefined : '5,4',
            opacity: 1,
            ...(futuristic ? { filter: `drop-shadow(0 0 ${onPath ? 6 : 3}px ${colour})` } : {}),
          },
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: colour },
        };
      });

    return { rfNodes: out, rfEdges };
  }, [nodes, edges, theme, futuristic, selectedId, neighbourhood, mandatoryNeighbours, onOpenObject]);

  return (
    <div className="flex flex-col gap-2" style={{ height }}>
      <div
        className="relative flex-1 min-h-0 rounded-lg overflow-hidden"
        style={futuristic
          ? { backgroundImage: 'linear-gradient(135deg, #0e1526 0%, #140f2b 55%, #0d1730 100%)' }
          : { boxShadow: 'inset 0 0 0 1px var(--line)', background: 'var(--surface)' }}
      >
        {/* One overlay cluster top-left. Two independently positioned floats would collide the
            moment either grew. */}
        <div className="absolute top-2.5 left-2.5 z-10 flex items-start gap-2">
          <ThemeToggle theme={theme} onChange={setTheme} />
          <NodeSearch nodes={nodes} theme={theme} onPick={focusNode} />
        </div>
        <Legend theme={theme} />
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.05}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
          onInit={(instance) => { flowRef.current = instance; }}
          onNodeClick={(_, node) => {
            if (node.type !== 'object') return;
            setSelectedId((id) => (id === node.id ? null : node.id));
          }}
          onPaneClick={() => setSelectedId(null)}
        >
          <Background gap={16} color={futuristic ? 'rgba(255,255,255,0.08)' : '#e3e7ec'} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="flex items-center gap-1.5 text-2xs text-muted shrink-0">
        <MousePointerClick size={12} className="shrink-0" />
        {onOpenObject
          ? 'Click the object ID to open its details · Click the box to highlight what it connects to · Drag to rearrange within a layer.'
          : 'Click a box to highlight what it connects to · Drag to rearrange within a layer.'}
      </div>
    </div>
  );
}

/** Find an object on the canvas by ident or description.
 *
 * A scope of forty objects is several screens wide at readable zoom, so "where is SIF_VENDOR_2"
 * was a panning exercise. Picking a result both selects it — lighting its lineage, which is what
 * you wanted it for — and moves the viewport to it, because selecting something off-screen looks
 * exactly like the search doing nothing.
 *
 * Results are capped and the list only renders while open: this sits over a canvas that is already
 * rendering hundreds of positioned elements. */
function NodeSearch({ nodes, theme, onPick }: {
  nodes: GraphNode[];
  theme: ErdTheme;
  onPick: (id: string) => void;
}) {
  const futuristic = theme === 'futuristic';
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes
      .filter((n) => n.ident.toLowerCase().includes(q) || (n.name ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        // An exact ident first: typing a full ident and getting it third reads as broken.
        const ae = a.ident.toLowerCase() === q ? 0 : 1;
        const be = b.ident.toLowerCase() === q ? 0 : 1;
        return ae - be || a.ident.localeCompare(b.ident);
      })
      .slice(0, 8);
  }, [nodes, query]);

  const pick = (id: string) => { onPick(id); setOpen(false); setQuery(''); };

  return (
    <div ref={ref} className="relative shrink-0">
      <div
        className={clsx(
          'flex items-center gap-1.5 rounded shadow-cardHover px-2 h-[30px] w-[212px]',
          futuristic ? 'bg-[#0f1730]/95 text-white' : 'bg-surface/95 text-text',
        )}
      >
        <Search size={13} className={futuristic ? 'text-white/50 shrink-0' : 'text-muted shrink-0'} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) pick(matches[0].id);
            if (e.key === 'Escape') { setOpen(false); setQuery(''); }
          }}
          placeholder="Find an object…"
          aria-label="Find an object on the diagram"
          className={clsx(
            'flex-1 min-w-0 bg-transparent text-2xs outline-none',
            futuristic ? 'placeholder:text-white/40' : 'placeholder:text-muted',
          )}
        />
        {query && (
          <button
            type="button" onClick={() => { setQuery(''); setOpen(false); }}
            aria-label="Clear search"
            className={futuristic ? 'text-white/50 hover:text-white shrink-0' : 'text-muted hover:text-text shrink-0'}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {open && !!query.trim() && (
        <div
          className={clsx(
            'absolute left-0 right-0 mt-1 rounded shadow-cardHover overflow-hidden',
            futuristic ? 'bg-[#0f1730]/98 text-white' : 'bg-surface text-text',
          )}
        >
          {matches.length === 0 ? (
            <p className={clsx('text-2xs px-2.5 py-2', futuristic ? 'text-white/50' : 'text-muted')}>
              No object in scope matches that.
            </p>
          ) : matches.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => pick(n.id)}
              className={clsx(
                'w-full text-left px-2.5 py-1.5 flex items-center gap-2',
                futuristic ? 'hover:bg-white/10' : 'hover:bg-blue-pale',
              )}
            >
              <span
                className="text-2xs font-bold rounded-pill px-1.5 shrink-0 tabular-nums"
                style={{ background: getLayerTheme(n.layer).band, color: LAYER_BAND_TEXT }}
              >
                L{n.layer}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-2xs font-mono font-semibold truncate">{n.ident}</span>
                <span className={clsx('block text-2xs truncate', futuristic ? 'text-white/50' : 'text-muted')}>
                  {n.name || '—'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

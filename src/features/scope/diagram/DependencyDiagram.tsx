import { useMemo, useState } from 'react';
import { LayoutGrid, ListOrdered, Maximize2, Network } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Select } from '../../../components/Select';
import { Segmented } from '../../../components/Segmented';
import { MultiSelectFilter } from '../../../components/MultiSelectFilter';
import { EmptyState } from '../../../components/EmptyState';
import {
  buildScopeGraph, componentsOf, findCycles, partitionGraph, VIEW_LIMITS, type GraphNode,
} from '../../../lib/scopeGraph';
import type { MigrationObject, SubprojectObject } from '../../../types/entities';
import type { ScopeDependency } from '../../../lib/queries/scope';
import { GraphView } from './GraphView';
import { CardsView } from './CardsView';
import { ExecutionView } from './ExecutionView';

export type DiagramView = 'graph' | 'cards' | 'execution';

/** Three views, not four.
 *
 * **Hierarchy was removed.** It rendered the graph as an expandable tree, and a dependency graph is
 * not a tree: every object that several others need got re-drawn under each of them, with its whole
 * subtree, every time. A six-object scope produced twenty-odd rows in which `SIF_BANK_2` appeared
 * five times and `SIF_VENDOR_2` four — the same facts repeating until the screen said nothing.
 * Graph shows the shape, Cards show the contents, Execution shows the schedule; none of them repeat
 * an object. Do not reintroduce a tree view of this data. */
const VIEWS = [
  { value: 'graph' as const, label: <span className="flex items-center gap-1.5"><Network size={13} /> Graph</span>, title: 'The dependency graph, drawn in layers' },
  { value: 'cards' as const, label: <span className="flex items-center gap-1.5"><LayoutGrid size={13} /> Cards</span>, title: 'The same objects as a readable list, grouped by layer' },
  { value: 'execution' as const, label: <span className="flex items-center gap-1.5"><ListOrdered size={13} /> Execution</span>, title: 'The load sequence the dependencies imply' },
];

/** The dependency diagram: one graph, three ways of reading it.
 *
 * Ported from the sap-dependency-analyzer reference. The views are not decoration — each answers a
 * question the others answer badly. Graph shows shape, Cards show contents, Execution shows the
 * schedule. Filters and the partition tabs apply across all three, so narrowing in one view stays
 * narrowed when you switch.
 *
 * The standalone ERD Diagram tab renders this. Graph deliberately shares its card style, legend,
 * theme toggle and select-to-highlight behaviour with Library > Migration Object's diagram: they
 * are the same kind of picture, and looking like two unrelated tools made the app feel assembled
 * rather than designed. */
export function DependencyDiagram({
  objects, inScope, dependencies,
  savedOrder = [], onSaveSequence, busy, canEdit = true,
  defaultView = 'graph', onOpenObject,
}: {
  objects: MigrationObject[];
  inScope: SubprojectObject[];
  dependencies: ScopeDependency[];
  savedOrder?: string[];
  onSaveSequence?: (order: string[]) => void;
  busy?: boolean;
  canEdit?: boolean;
  defaultView?: DiagramView;
  /** Opens an object's details from the graph. Omitted where there is nowhere to open them. */
  onOpenObject?: (objectId: string) => void;
}) {
  const [view, setView] = useState<DiagramView>(defaultView);
  const [layer, setLayer] = useState('all');
  const [components, setComponents] = useState<string[]>([]);
  const [partitionIndex, setPartitionIndex] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);

  const { nodes, edges } = useMemo(
    () => buildScopeGraph(objects, inScope, dependencies),
    [objects, inScope, dependencies],
  );

  // Computed here as well as in the wizard so both places name the same cycles — a graph that
  // reports none while the step beside it reports two is worse than neither reporting.
  const cycles = useMemo(
    () => findCycles(inScope.map((w) => w.migrationObjectId), dependencies),
    [inScope, dependencies],
  );

  const componentOptions = useMemo(() => componentsOf(nodes), [nodes]);
  const layerOptions = useMemo(
    () => [...new Set(nodes.map((n) => n.layer))].sort((a, b) => a - b),
    [nodes],
  );

  const filtered = useMemo(() => nodes.filter((n) => (
    (layer === 'all' || n.layer === Number(layer))
    && (components.length === 0 || (!!n.component && components.includes(n.component)))
  )), [nodes, layer, components]);

  /** Only the canvas needs splitting — the other three views cap themselves and stay responsive
   * because they render plain DOM rather than a positioned, edge-connected canvas. */
  const partitions = useMemo(
    () => (view === 'graph' ? partitionGraph(filtered, VIEW_LIMITS.graphSoftLimit, VIEW_LIMITS.graphHardLimit) : []),
    [filtered, view],
  );
  const activePartition = partitions[Math.min(partitionIndex, Math.max(0, partitions.length - 1))];
  const graphNodes: GraphNode[] = partitions.length > 1 ? (activePartition?.nodes ?? []) : filtered;

  const hasFilters = layer !== 'all' || components.length > 0;
  const clearFilters = () => { setLayer('all'); setComponents([]); setPartitionIndex(0); };

  if (nodes.length === 0) {
    return (
      <EmptyState
        title="No objects in scope"
        description="Select the objects to migrate and their dependencies are drawn here."
      />
    );
  }

  const body = (
    <>
      {view === 'graph' && (
        <GraphView
          nodes={graphNodes} edges={edges} height={fullScreen ? '100%' : '58vh'}
          onOpenObject={onOpenObject}
        />
      )}
      {view === 'cards' && <CardsView nodes={filtered} />}
      {view === 'execution' && (
        <ExecutionView
          nodes={filtered} cycles={cycles} savedOrder={savedOrder} onSave={onSaveSequence} busy={busy} canEdit={canEdit}
        />
      )}
    </>
  );

  /** Circular prerequisites, said ONCE, underneath.
   *
   * They used to be marked on every node in every view — a red ring in Graph, an icon in Cards, a
   * "cycle" row wherever Hierarchy re-drew the object. The same two objects were flagged five or six
   * times on one screen, which made a rare condition look like a widespread failure and buried the
   * one thing worth knowing: which objects, and that their stage is a guess. A cycle is a note about
   * the graph, not a property to repeat on each member. */
  const cycleNote = cycles.length > 0 && (
    <p className="text-2xs text-amber-ink">
      <span className="font-semibold">
        Circular prerequisite{cycles.length === 1 ? '' : 's'}:
      </span>{' '}
      {cycles.map((cycle, i) => (
        <span key={i} className="font-mono font-semibold">
          {i > 0 && ' · '}
          {cycle.map((id) => nodes.find((n) => n.id === id)?.ident ?? id).join(' ⇄ ')}
        </span>
      ))}
      <span className="ml-1.5 font-normal">
        — these have no valid load order between them, so their layer is a best guess. Break the loop
        by taking one dependency out of scope or marking it optional.
      </span>
    </p>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Segmented options={VIEWS} value={view} onChange={setView} />

        <Select
          size="sm" quiet={layer === 'all'} value={layer}
          onChange={(e) => { setLayer(e.target.value); setPartitionIndex(0); }}
          aria-label="Filter by dependency layer"
        >
          <option value="all">All layers</option>
          {layerOptions.map((l) => <option key={l} value={l}>Layer {l}</option>)}
        </Select>

        {componentOptions.length > 1 && (
          <MultiSelectFilter
            label="Component" options={componentOptions} selected={components}
            onChange={(next) => { setComponents(next); setPartitionIndex(0); }}
          />
        )}

        {hasFilters && (
          <button type="button" onClick={clearFilters} className="text-2xs text-blue font-semibold">
            Clear filters
          </button>
        )}

        <span className="text-2xs text-muted">
          {filtered.length.toLocaleString()} of {nodes.length.toLocaleString()} objects
          {' · '}{layerOptions.length} layer{layerOptions.length === 1 ? '' : 's'}
        </span>

        {view === 'graph' && !fullScreen && (
          <Button variant="quiet" size="sm" className="ml-auto" onClick={() => setFullScreen(true)}>
            <Maximize2 size={14} /> Full screen
          </Button>
        )}
      </div>

      {/* Partition tabs — only when the canvas had to be split. A single set gets no tab strip,
          because a tab you cannot switch away from is just a label. */}
      {view === 'graph' && partitions.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-line">
          {partitions.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPartitionIndex(i)}
              className={clsx(
                'whitespace-nowrap border-b-2 px-3 py-1.5 text-sm2 font-semibold transition-colors -mb-px',
                i === partitionIndex ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text',
              )}
            >
              {p.title}
              <span className="ml-1.5 rounded-pill bg-surface-2 px-1.5 py-px text-2xs tabular-nums">{p.nodes.length}</span>
            </button>
          ))}
        </div>
      )}

      {body}

      {cycleNote}

      <Dialog open={fullScreen} onClose={() => setFullScreen(false)} title="Dependency Diagram" size="win">
        <div className="h-full [&>div]:h-full">
          <GraphView nodes={graphNodes} edges={edges} height="100%" onOpenObject={onOpenObject} />
        </div>
      </Dialog>
    </div>
  );
}

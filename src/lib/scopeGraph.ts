import type { MigrationObject, SubprojectObject } from '../types/entities';
import type { ScopeDependency } from './queries/scope';

/** How much of a dependency graph each view will draw before it stops being useful — and, past
 * the hard limit, before the browser stops being responsive. Taken from the sap-dependency-analyzer
 * reference, which learned them on real SAP object counts.
 *
 * A project with 300 in-scope objects is normal. Rendering 300 React Flow nodes with edges in one
 * canvas does not fail loudly — it just goes slow enough that people stop opening the screen. */
export const VIEW_LIMITS = {
  cards: 100,
  hierarchy: 100,
  graphSoftLimit: 100,
  graphHardLimit: 500,
} as const;

export interface GraphNode {
  id: string;
  /** The catalogue ident — SIF_MATERIAL and friends. */
  ident: string;
  name: string;
  /** Dependency depth: 0 = needs nothing else in scope. */
  layer: number;
  component?: string;
  category?: string;
  approach?: string;
  /** In-scope object ids this one requires. */
  requires: string[];
  /** In-scope object ids that require this one. */
  requiredBy: string[];
  /** Sits in a dependency cycle — its layer is a guess, not a fact. */
  cyclic: boolean;
  loadSeq?: number;
  mappingStatus?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  mandatory: boolean;
}

/** Longest-path depth for every id: an object sits one layer below the deepest thing it requires.
 *
 * An arbitrary layout would draw the same edges while hiding the one thing the picture is for —
 * how deep the chain runs, and therefore what has to load before what.
 *
 * Cycles cannot have a depth. Rather than recursing forever or dropping the nodes, a cycle member
 * resolves to the deepest layer its non-cyclic prerequisites allow and is reported in `cyclic`, so
 * the diagram still draws and the problem is still visible. */
export function computeLayers(
  ids: string[],
  dependencies: ScopeDependency[],
): { layers: Map<string, number>; cyclic: Set<string> } {
  const present = new Set(ids);
  const requires = new Map<string, string[]>();
  for (const d of dependencies) {
    if (!present.has(d.objectId) || !present.has(d.requiresId) || d.objectId === d.requiresId) continue;
    requires.set(d.objectId, [...(requires.get(d.objectId) ?? []), d.requiresId]);
  }

  const layers = new Map<string, number>();
  const cyclic = new Set<string>();
  const onPath = new Set<string>();

  const resolve = (id: string): number => {
    const known = layers.get(id);
    if (known !== undefined) return known;
    if (onPath.has(id)) {
      // Closing the loop. Everything currently on the path is part of it.
      for (const member of onPath) cyclic.add(member);
      return 0;
    }
    onPath.add(id);
    let depth = 0;
    for (const req of requires.get(id) ?? []) depth = Math.max(depth, resolve(req) + 1);
    onPath.delete(id);
    layers.set(id, depth);
    return depth;
  };

  for (const id of ids) resolve(id);
  return { layers, cyclic };
}

/** The in-scope objects as a graph: one node per object, layered, with both directions of its
 * dependencies already counted so no view has to walk the edge list again. */
export function buildScopeGraph(
  objects: MigrationObject[],
  inScope: SubprojectObject[],
  dependencies: ScopeDependency[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const rows = inScope.filter((w) => byId.has(w.migrationObjectId));
  const ids = rows.map((w) => w.migrationObjectId);
  const present = new Set(ids);

  const scoped = dependencies.filter(
    (d) => present.has(d.objectId) && present.has(d.requiresId) && d.objectId !== d.requiresId,
  );
  const { layers, cyclic } = computeLayers(ids, scoped);

  const requires = new Map<string, string[]>();
  const requiredBy = new Map<string, string[]>();
  for (const d of scoped) {
    requires.set(d.objectId, [...(requires.get(d.objectId) ?? []), d.requiresId]);
    requiredBy.set(d.requiresId, [...(requiredBy.get(d.requiresId) ?? []), d.objectId]);
  }

  const nodes: GraphNode[] = rows.map((w) => {
    const o = byId.get(w.migrationObjectId)!;
    return {
      id: o.id,
      ident: o.objectId,
      name: o.description ?? '—',
      layer: layers.get(o.id) ?? 0,
      component: o.component,
      category: o.category,
      approach: o.approach,
      requires: requires.get(o.id) ?? [],
      requiredBy: requiredBy.get(o.id) ?? [],
      cyclic: cyclic.has(o.id),
      loadSeq: w.loadSeq,
      mappingStatus: w.mappingStatus,
    };
  });

  const edges: GraphEdge[] = scoped.map((d, i) => ({
    id: `${d.requiresId}->${d.objectId}-${i}`,
    source: d.requiresId,
    target: d.objectId,
    mandatory: d.mandatory,
  }));

  return { nodes, edges };
}

export interface GraphPartition {
  id: string;
  title: string;
  startLayer: number;
  endLayer: number;
  nodes: GraphNode[];
}

/** Splits a graph into sets of whole layers, each small enough to draw.
 *
 * Layers are never split across partitions unless a single layer is itself over the hard limit —
 * a partition that shows half of layer 3 is worse than no partition at all, because the missing
 * half is exactly the context the visible half needs. */
export function partitionGraph(
  nodes: GraphNode[],
  softLimit: number = VIEW_LIMITS.graphSoftLimit,
  hardLimit: number = VIEW_LIMITS.graphHardLimit,
): GraphPartition[] {
  if (nodes.length === 0) return [];

  const byLayer = new Map<number, GraphNode[]>();
  for (const node of nodes) byLayer.set(node.layer, [...(byLayer.get(node.layer) ?? []), node]);
  const sortedLayers = [...byLayer.entries()].sort((a, b) => a[0] - b[0]);

  const partitions: GraphPartition[] = [];
  let current: GraphNode[] = [];
  let startLayer = -1;
  let endLayer = -1;

  const flush = () => {
    if (current.length === 0) return;
    partitions.push({
      id: `set-${partitions.length + 1}`,
      title: startLayer === endLayer ? `Layer ${startLayer}` : `Layers ${startLayer}–${endLayer}`,
      startLayer,
      endLayer,
      nodes: current,
    });
    current = [];
    startLayer = -1;
    endLayer = -1;
  };

  for (const [layer, layerNodes] of sortedLayers) {
    // One layer bigger than the hard limit gets a partition to itself. Splitting it would be
    // arbitrary; at least this way the tab label tells you why it is slow.
    if (layerNodes.length > hardLimit) {
      flush();
      partitions.push({
        id: `set-${partitions.length + 1}`,
        title: `Layer ${layer}`,
        startLayer: layer,
        endLayer: layer,
        nodes: layerNodes,
      });
      continue;
    }
    if (startLayer === -1) startLayer = layer;
    if (current.length > 0 && current.length + layerNodes.length > softLimit) {
      flush();
      startLayer = layer;
    }
    current.push(...layerNodes);
    endLayer = layer;
  }
  flush();
  return partitions;
}

/** The load order the layering implies: everything in layer 0, then layer 1, and so on.
 *
 * Within a layer nothing depends on anything else, so the order there is free — it keeps whatever
 * order the objects are already saved in, falling back to ident. That is what makes re-running this
 * stable: an object only moves if a dependency actually forced it to. */
export function sequenceFromLayers(nodes: GraphNode[], currentOrder: string[] = []): string[] {
  const rank = new Map(currentOrder.map((id, i) => [id, i]));
  return [...nodes]
    .sort((a, b) => (
      a.layer - b.layer
      || (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      || a.ident.localeCompare(b.ident)
    ))
    .map((n) => n.id);
}

/** Every distinct component across the nodes, sorted — the diagram's component filter. */
export const componentsOf = (nodes: GraphNode[]): string[] =>
  [...new Set(nodes.map((n) => n.component).filter((c): c is string => !!c))].sort();

/** Every dependency cycle, each as the objects that form it.
 *
 * `computeLayers` already refuses to loop, but it reports a single flat set of "everything caught in
 * a cycle" — with two independent cycles in a scope that reads as one big tangle, and there is no
 * way to see that breaking one link fixes half of it.
 *
 * Tarjan's strongly-connected-components: a component with more than one member is a cycle, and a
 * single member is one only if it depends on itself. Iterative rather than recursive, because a deep
 * dependency chain would otherwise blow the stack on the very graphs that most need this.
 *
 * NOTE, don't resolve: a cycle has no valid load order and the app does not invent one. It is named
 * so a person can break it by taking a dependency out of scope or marking it optional. */
export function findCycles(ids: string[], dependencies: ScopeDependency[]): string[][] {
  const present = new Set(ids);
  const out = new Map<string, string[]>();
  for (const d of dependencies) {
    if (!present.has(d.objectId) || !present.has(d.requiresId)) continue;
    out.set(d.objectId, [...(out.get(d.objectId) ?? []), d.requiresId]);
  }

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let counter = 0;

  for (const root of ids) {
    if (index.has(root)) continue;

    // Explicit work stack: each frame is a node plus how many of its edges we have walked.
    const work: { node: string; edge: number }[] = [{ node: root, edge: 0 }];
    index.set(root, counter); low.set(root, counter); counter += 1;
    stack.push(root); onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const edges = out.get(frame.node) ?? [];

      if (frame.edge < edges.length) {
        const next = edges[frame.edge];
        frame.edge += 1;
        if (!index.has(next)) {
          index.set(next, counter); low.set(next, counter); counter += 1;
          stack.push(next); onStack.add(next);
          work.push({ node: next, edge: 0 });
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(next)!));
        }
        continue;
      }

      // Every edge walked. If this node started a component, pop it.
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = [];
        for (;;) {
          const popped = stack.pop()!;
          onStack.delete(popped);
          component.push(popped);
          if (popped === frame.node) break;
        }
        const selfDependent = component.length === 1
          && (out.get(component[0]) ?? []).includes(component[0]);
        if (component.length > 1 || selfDependent) cycles.push(component.reverse());
      }

      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
    }
  }

  // Deterministic order, so the same scope always reports its cycles the same way.
  return cycles
    .map((c) => [...c].sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
}

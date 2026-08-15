import type { EtlNode, EtlEdge, RunOptions } from '../../types/entities';

export type RunEvent =
  | { kind: 'node-start'; nodeId: string }
  | { kind: 'node-done'; nodeId: string; rows: number; elapsedMs: number; rejects?: number }
  | { kind: 'log'; stream: 'trace' | 'error'; line: string }
  | { kind: 'finished'; status: 'success' | 'rejects' | 'failed' };

export interface ExecutionEngine {
  run(nodes: EtlNode[], edges: EtlEdge[], objectName: string, opts: RunOptions): AsyncIterable<RunEvent>;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const clock = () => new Date().toTimeString().slice(0, 8);

/** Phase-1 engine: mirrors the prototype's simulation exactly (460ms cadence). */
export const simulatedEngine: ExecutionEngine = {
  async *run(nodes, edges, objectName, opts) {
    const order = topoOrder(nodes, edges);
    const byId = new Map(nodes.map(n => [n.id, n]));
    const rowsOut = new Map<string, number>();

    yield { kind: 'log', stream: 'trace', line: `(${clock()}) JOB: ${objectName} started on ${opts.jobServer} · config ${opts.sysConfig}` };
    yield { kind: 'log', stream: 'trace', line: `(${clock()}) Global variables: ${Object.entries(opts.globals).map(([k, v]) => `${k}=${v}`).join(', ')}` };
    yield { kind: 'log', stream: 'trace', line: `(${clock()}) Degree of parallelism ${opts.dop}${opts.recovery ? ' · recovery enabled' : ''}` };

    let rejects = false;
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const node = byId.get(id)!;
      yield { kind: 'node-start', nodeId: id };
      await sleep(380);

      const ups = edges.filter(e => e.toNode === id);
      let rows = ups.length
        ? ups.reduce((a, e) => a + (rowsOut.get(e.fromNode) ?? 0), 0)
        : parseInt(String(node.data.rows ?? '').replace(/[^0-9]/g, ''), 10) || 0;
      if (!rows) rows = 8000 + (id.length * 1373) % 52000;
      if (ups.some(e => e.condition === 'Fail')) rows = Math.max(1, Math.round(rows * 0.004));
      if (node.type === 'validation' || node.type === 'tablecomp') rows = Math.round(rows * 0.996);
      rowsOut.set(id, rows);

      const isRejectTarget = node.type === 'target' && String(node.data.mode ?? '').includes('Reject') && rows > 0;
      if (isRejectTarget) rejects = true;

      yield { kind: 'node-done', nodeId: id, rows, elapsedMs: Math.round((0.4 + i * 0.7) * 1000), rejects: isRejectTarget ? rows : undefined };
      yield { kind: 'log', stream: 'trace', line: `(${clock()}) ${node.type} ${node.name}: ${rows.toLocaleString('en-US')} rows` };
      if (isRejectTarget) {
        yield { kind: 'log', stream: 'error', line: `(${clock()}) ${node.name}: ${rows.toLocaleString('en-US')} rows rejected — see overflow file` };
      }
      await sleep(80);
    }

    yield { kind: 'log', stream: 'trace', line: `(${clock()}) JOB: ${objectName} completed${rejects ? ' with rejects' : ' successfully'}` };
    yield { kind: 'finished', status: rejects ? 'rejects' : 'success' };
  },
};

function topoOrder(nodes: EtlNode[], edges: EtlEdge[]): string[] {
  const indeg = new Map(nodes.map(n => [n.id, 0]));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    indeg.set(e.toNode, (indeg.get(e.toNode) ?? 0) + 1);
    adj.set(e.fromNode, [...(adj.get(e.fromNode) ?? []), e.toNode]);
  }
  const queue = nodes.filter(n => !indeg.get(n.id)).map(n => n.id);
  const seen = new Set<string>(); const order: string[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur); order.push(cur);
    for (const nxt of adj.get(cur) ?? []) {
      indeg.set(nxt, (indeg.get(nxt) ?? 1) - 1);
      if ((indeg.get(nxt) ?? 0) <= 0) queue.push(nxt);
    }
  }
  for (const n of nodes) if (!seen.has(n.id)) order.push(n.id);   // unreachable last
  return order;
}

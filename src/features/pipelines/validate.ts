import type { EtlNode, EtlEdge } from '../../types/entities';

export interface CheckItem { sev: 'Error' | 'Warning'; where: string; msg: string; nodeId?: string }

const STARTERS = new Set(['source', 'file', 'script']);
const ENDERS = new Set(['target', 'template', 'script']);

export function checkGraph(nodes: EtlNode[], edges: EtlEdge[], stagedTables: Set<string>): CheckItem[] {
  const out: CheckItem[] = [];
  for (const n of nodes) {
    const inc = edges.filter(e => e.toNode === n.id).length;
    const outc = edges.filter(e => e.fromNode === n.id).length;
    if (!inc && !STARTERS.has(n.type)) out.push({ sev: 'Error', where: n.name, nodeId: n.id, msg: `No input connected to this ${n.type}.` });
    if (!outc && !ENDERS.has(n.type)) out.push({ sev: 'Warning', where: n.name, nodeId: n.id, msg: 'Output is not connected — rows produced here go nowhere.' });
    if (n.type === 'source' && String(n.data.table ?? '').includes('_STG')) {
      const base = String(n.data.table).replace(/^[A-Z0-9]{2,4}_/, '').replace(/_STG$/, '');
      if (!stagedTables.has(base)) out.push({ sev: 'Warning', where: n.name, nodeId: n.id, msg: 'Staging table has no matching ingested table in the Staging Area.' });
    }
    if (n.type === 'query' && (n.data.schemaOut ?? []).some(c => !c.map)) out.push({ sev: 'Error', where: n.name, nodeId: n.id, msg: 'Output columns without a mapping expression.' });
    if (n.type === 'target' && !n.data.table) out.push({ sev: 'Error', where: n.name, nodeId: n.id, msg: 'No target table selected.' });
    if (n.type === 'validation' && !(n.data.rules ?? []).length) out.push({ sev: 'Warning', where: n.name, nodeId: n.id, msg: 'Validation transform has no rules — every row passes.' });
  }
  return out;
}

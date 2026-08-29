import assert from 'node:assert/strict';
import { computeLayers, findCycles, partitionGraph, sequenceFromLayers, type GraphNode } from './scopeGraph';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (e: any) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
};

const dep = (objectId: string, requiresId: string, mandatory = true) => ({ objectId, requiresId, mandatory });

console.log('computeLayers');

test('nothing required -> everything at layer 0', () => {
  const { layers, cyclic } = computeLayers(['a', 'b'], []);
  assert.equal(layers.get('a'), 0);
  assert.equal(layers.get('b'), 0);
  assert.equal(cyclic.size, 0);
});

test('a chain deepens one layer per link', () => {
  const { layers } = computeLayers(['a', 'b', 'c'], [dep('b', 'a'), dep('c', 'b')]);
  assert.equal(layers.get('a'), 0);
  assert.equal(layers.get('b'), 1);
  assert.equal(layers.get('c'), 2);
});

test('longest path wins, not the first one found', () => {
  // d needs b (layer 1) and c (layer 2) -> d must be 3, not 2.
  const { layers } = computeLayers(
    ['a', 'b', 'c', 'd'],
    [dep('b', 'a'), dep('c', 'b'), dep('d', 'b'), dep('d', 'c')],
  );
  assert.equal(layers.get('d'), 3);
});

test('dependencies pointing outside the id set are ignored', () => {
  const { layers } = computeLayers(['a'], [dep('a', 'not-in-scope')]);
  assert.equal(layers.get('a'), 0);
});

test('a self-dependency is not a cycle and does not deepen', () => {
  const { layers, cyclic } = computeLayers(['a'], [dep('a', 'a')]);
  assert.equal(layers.get('a'), 0);
  assert.equal(cyclic.size, 0);
});

test('a two-node cycle terminates and is reported', () => {
  const { layers, cyclic } = computeLayers(['a', 'b'], [dep('a', 'b'), dep('b', 'a')]);
  assert.ok(cyclic.has('a') && cyclic.has('b'), 'both members flagged');
  assert.ok(layers.get('a') !== undefined && layers.get('b') !== undefined, 'both still get a layer');
});

test('a cycle does not swallow the acyclic objects around it', () => {
  const { layers, cyclic } = computeLayers(
    ['root', 'a', 'b', 'tail'],
    [dep('a', 'root'), dep('a', 'b'), dep('b', 'a'), dep('tail', 'root')],
  );
  assert.equal(layers.get('root'), 0);
  assert.equal(layers.get('tail'), 1);
  assert.ok(cyclic.has('a') && cyclic.has('b'));
  assert.ok(!cyclic.has('root') && !cyclic.has('tail'), 'clean nodes stay clean');
});

test('every id gets a layer, whatever the input order', () => {
  const ids = ['e', 'd', 'c', 'b', 'a'];
  const { layers } = computeLayers(ids, [dep('a', 'b'), dep('b', 'c'), dep('c', 'd'), dep('d', 'e')]);
  for (const id of ids) assert.ok(layers.has(id), id + ' has a layer');
  assert.equal(layers.get('a'), 4);
});

console.log('partitionGraph');

const node = (id: string, layer: number): GraphNode => ({
  id, ident: id.toUpperCase(), name: id, layer,
  requires: [], requiredBy: [], cyclic: false,
});

test('empty graph -> no partitions', () => {
  assert.deepEqual(partitionGraph([]), []);
});

test('under the soft limit -> one partition spanning every layer', () => {
  const nodes = [node('a', 0), node('b', 1), node('c', 2)];
  const parts = partitionGraph(nodes, 100, 500);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].title, 'Layers 0–2');
  assert.equal(parts[0].nodes.length, 3);
});

test('one layer only -> title names the single layer', () => {
  const parts = partitionGraph([node('a', 0), node('b', 0)], 100, 500);
  assert.equal(parts[0].title, 'Layer 0');
});

test('over the soft limit -> splits, and never mid-layer', () => {
  const nodes = [
    ...Array.from({ length: 6 }, (_, i) => node('l0-' + i, 0)),
    ...Array.from({ length: 6 }, (_, i) => node('l1-' + i, 1)),
    ...Array.from({ length: 6 }, (_, i) => node('l2-' + i, 2)),
  ];
  const parts = partitionGraph(nodes, 10, 500);
  assert.ok(parts.length > 1, 'it split');
  for (const p of parts) {
    const layers = new Set(p.nodes.map((n) => n.layer));
    for (const l of layers) {
      const inPart = p.nodes.filter((n) => n.layer === l).length;
      const inAll = nodes.filter((n) => n.layer === l).length;
      assert.equal(inPart, inAll, 'layer ' + l + ' is whole inside its partition');
    }
  }
  assert.equal(parts.reduce((n, p) => n + p.nodes.length, 0), nodes.length, 'nothing lost');
});

test('a single layer over the hard limit gets its own partition', () => {
  const nodes = [
    node('small', 0),
    ...Array.from({ length: 12 }, (_, i) => node('big-' + i, 1)),
    node('after', 2),
  ];
  const parts = partitionGraph(nodes, 100, 10);
  const big = parts.find((p) => p.nodes.length === 12);
  assert.ok(big, 'the oversized layer is its own set');
  assert.equal(big!.startLayer, 1);
  assert.equal(big!.endLayer, 1);
  assert.equal(parts.reduce((n, p) => n + p.nodes.length, 0), nodes.length, 'nothing lost');
});

test('partition ids are unique', () => {
  const nodes = Array.from({ length: 30 }, (_, i) => node('n' + i, i));
  const parts = partitionGraph(nodes, 5, 500);
  assert.equal(new Set(parts.map((p) => p.id)).size, parts.length);
});

console.log('sequenceFromLayers');

test('orders by layer first', () => {
  const nodes = [node('c', 2), node('a', 0), node('b', 1)];
  assert.deepEqual(sequenceFromLayers(nodes), ['a', 'b', 'c']);
});

test('within a layer, the existing saved order is kept', () => {
  const nodes = [node('x', 0), node('y', 0), node('z', 0)];
  assert.deepEqual(sequenceFromLayers(nodes, ['z', 'y', 'x']), ['z', 'y', 'x']);
});

test('an object not in the saved order sorts after those that are, by ident', () => {
  const nodes = [node('new', 0), node('known', 0)];
  assert.deepEqual(sequenceFromLayers(nodes, ['known']), ['known', 'new']);
});

test('re-running on its own output changes nothing', () => {
  const nodes = [node('c', 1), node('a', 0), node('b', 1)];
  const once = sequenceFromLayers(nodes, []);
  assert.deepEqual(sequenceFromLayers(nodes, once), once);
});

test('a dependency still outranks the saved order', () => {
  // b is layer 1, a is layer 0 — even though the saved order puts b first.
  const nodes = [node('b', 1), node('a', 0)];
  assert.deepEqual(sequenceFromLayers(nodes, ['b', 'a']), ['a', 'b']);
});


console.log('findCycles');

test('an acyclic graph has no cycles', () => {
  const cycles = findCycles(['a', 'b', 'c'], [dep('b', 'a'), dep('c', 'b')]);
  assert.deepEqual(cycles, []);
});

test('a two-node cycle is found', () => {
  const cycles = findCycles(['a', 'b'], [dep('a', 'b'), dep('b', 'a')]);
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0], ['a', 'b']);
});

test('a three-node cycle is found as one component', () => {
  const cycles = findCycles(['a', 'b', 'c'], [dep('a', 'b'), dep('b', 'c'), dep('c', 'a')]);
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0], ['a', 'b', 'c']);
});

test('TWO independent cycles are reported separately', () => {
  // The whole point: a flat set would report these five ids as one tangle.
  const cycles = findCycles(
    ['a', 'b', 'x', 'y', 'lone'],
    [dep('a', 'b'), dep('b', 'a'), dep('x', 'y'), dep('y', 'x')],
  );
  assert.equal(cycles.length, 2);
  assert.deepEqual(cycles[0], ['a', 'b']);
  assert.deepEqual(cycles[1], ['x', 'y']);
});

test('a self-dependency counts as a cycle', () => {
  assert.deepEqual(findCycles(['a'], [dep('a', 'a')]), [['a']]);
});

test('a node merely POINTING at a cycle is not in it', () => {
  const cycles = findCycles(['a', 'b', 'outside'], [dep('a', 'b'), dep('b', 'a'), dep('outside', 'a')]);
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0], ['a', 'b']);
});

test('edges pointing outside the id set are ignored', () => {
  assert.deepEqual(findCycles(['a'], [dep('a', 'gone'), dep('gone', 'a')]), []);
});

test('it terminates on a long chain rather than blowing the stack', () => {
  const ids = Array.from({ length: 5000 }, (_, i) => 'n' + i);
  const deps = ids.slice(1).map((id, i) => dep(id, ids[i]));
  assert.deepEqual(findCycles(ids, deps), []);
});

test('result order is stable', () => {
  const deps = [dep('x', 'y'), dep('y', 'x'), dep('a', 'b'), dep('b', 'a')];
  const first = findCycles(['x', 'y', 'a', 'b'], deps);
  const second = findCycles(['b', 'a', 'y', 'x'], deps);
  assert.deepEqual(first, second);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));

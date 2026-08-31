import assert from 'node:assert/strict';
import { analyseXrefStructure, diffXrefStructures, flattenXref } from './xrefHealth';
import type { GoldenFmdStructure } from '../types/entities';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (e: any) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
};

// `description` is a required string on GoldenFmdFieldDef — "missing" means blank, not absent, so
// the helper defaults it to '' rather than leaving it off.
const struct = (...sections: { name: string; color?: string; fields: { field: string; description?: string }[] }[]): GoldenFmdStructure =>
  ({ sections: sections.map((s, i) => ({
    id: `s${i}`, name: s.name, color: s.color ?? 'blue',
    fields: s.fields.map((f, j) => ({ id: `f${i}-${j}`, field: f.field, description: f.description ?? '' })),
  })) });

const pair = struct({
  name: 'Mapping',
  fields: [{ field: 'LEGACY_VALUE', description: 'The value in the legacy system' },
           { field: 'S4_VALUE', description: 'What it becomes in S/4' }],
});

const check = (s: GoldenFmdStructure | undefined, key: string, versions: { version: string; publishedAt?: string }[] = [{ version: 'v1.0.0', publishedAt: 'x' }]) =>
  analyseXrefStructure(s, versions).checks.find((c) => c.key === key)!;

console.log('analyseXrefStructure');

test('a healthy two-column template passes every check', () => {
  const health = analyseXrefStructure(pair, [{ version: 'v1.0.0', publishedAt: '2026-01-01' }]);
  assert.deepEqual(health.checks.filter((c) => c.status !== 'pass'), []);
  assert.equal(health.fields, 2);
  assert.equal(health.sections, 1);
  assert.equal(health.described, 2);
});

test('one column cannot map anything, and that is a failure not a warning', () => {
  // A cross reference with a single column has nothing to return. It looks like a work in progress
  // in the designer, which is exactly why it needs saying out loud.
  const one = struct({ name: 'Mapping', fields: [{ field: 'LEGACY_VALUE', description: 'x' }] });
  assert.equal(check(one, 'pair').status, 'fail');
  assert.equal(check(pair, 'pair').status, 'pass');
});

test('duplicate field names are caught across sections and ignoring case', () => {
  // The diff is keyed on the field name, so a duplicate makes an addition and a removal
  // indistinguishable — the comparison would report nothing changed.
  const dupe = struct(
    { name: 'A', fields: [{ field: 'MATNR', description: 'x' }] },
    { name: 'B', fields: [{ field: 'matnr', description: 'x' }] },
  );
  const health = analyseXrefStructure(dupe, [{ version: 'v1.0.0', publishedAt: 'x' }]);
  assert.deepEqual(health.duplicates, ['MATNR']);
  assert.equal(health.checks.find((c) => c.key === 'duplicates')!.status, 'fail');
});

test('an empty section warns rather than fails — it renders as a heading over nothing', () => {
  const withEmpty = struct(
    { name: 'Mapping', fields: [{ field: 'A', description: 'x' }, { field: 'B', description: 'x' }] },
    { name: 'Notes', fields: [] },
  );
  const health = analyseXrefStructure(withEmpty, [{ version: 'v1.0.0', publishedAt: 'x' }]);
  assert.deepEqual(health.emptySections, ['Notes']);
  assert.equal(health.checks.find((c) => c.key === 'empty-sections')!.status, 'warn');
});

test('missing descriptions are counted, not just flagged', () => {
  const partial = struct({ name: 'Mapping', fields: [{ field: 'A', description: 'x' }, { field: 'B' }] });
  const health = analyseXrefStructure(partial, [{ version: 'v1.0.0', publishedAt: 'x' }]);
  assert.equal(health.described, 1);
  assert.match(health.checks.find((c) => c.key === 'descriptions')!.detail, /1 of 2/);
});

test('a blank field name is a failure of its own, not a duplicate', () => {
  const blank = struct({ name: 'Mapping', fields: [{ field: 'A', description: 'x' }, { field: '  ' }] });
  assert.equal(check(blank, 'blank-names').status, 'fail');
});

test('a template that was never published fails, however complete it looks', () => {
  // The one check about state rather than content: nothing downstream can be built against a
  // template that only ever existed as a draft.
  assert.equal(check(pair, 'released', [{ version: 'Draft' }]).status, 'fail');
  assert.equal(check(pair, 'released', [{ version: 'v1.0.0', publishedAt: 'x' }]).status, 'pass');
});

test('an undefined structure grades instead of throwing', () => {
  const health = analyseXrefStructure(undefined, []);
  assert.equal(health.fields, 0);
  assert.equal(health.checks.find((c) => c.key === 'sections')!.status, 'fail');
});

console.log('diffXrefStructures');

test('identical structures report identical', () => {
  assert.equal(diffXrefStructures(pair, pair).identical, true);
});

test('two empty versions are identical, not empty-and-therefore-changed', () => {
  assert.equal(diffXrefStructures(undefined, undefined).identical, true);
});

test('added and removed fields are reported separately, and a rename shows as both', () => {
  // Deliberately NOT guessed at: nothing in a Golden XREF is populated, so a rename costs nothing
  // to report honestly and a wrong guess would invent a change that never happened.
  const renamed = struct({ name: 'Mapping', fields: [{ field: 'LEGACY_VALUE', description: 'The value in the legacy system' }, { field: 'TARGET_VALUE', description: 'What it becomes in S/4' }] });
  const d = diffXrefStructures(pair, renamed);
  assert.deepEqual(d.added, ['TARGET_VALUE']);
  assert.deepEqual(d.removed, ['S4_VALUE']);
  assert.equal(d.identical, false);
});

test('adding a field is not also reported as a reorder', () => {
  // Comparing the raw lists would call every addition a reorder too, turning one real change into
  // two and telling you nothing about either.
  const extra = struct({ name: 'Mapping', fields: [
    { field: 'LEGACY_VALUE', description: 'The value in the legacy system' },
    { field: 'S4_VALUE', description: 'What it becomes in S/4' },
    { field: 'VALID_FROM' },
  ] });
  const d = diffXrefStructures(pair, extra);
  assert.deepEqual(d.added, ['VALID_FROM']);
  assert.equal(d.reordered, false);
});

test('swapping two existing fields IS a reorder', () => {
  const swapped = struct({ name: 'Mapping', fields: [
    { field: 'S4_VALUE', description: 'What it becomes in S/4' },
    { field: 'LEGACY_VALUE', description: 'The value in the legacy system' },
  ] });
  assert.equal(diffXrefStructures(pair, swapped).reordered, true);
});

test('a moved or re-described field is a real change even though the field list matches', () => {
  const moved = struct(
    { name: 'Source', fields: [{ field: 'LEGACY_VALUE', description: 'The value in the legacy system' }] },
    { name: 'Target', fields: [{ field: 'S4_VALUE', description: 'Rewritten' }] },
  );
  const d = diffXrefStructures(pair, moved);
  assert.deepEqual(d.added, []);
  assert.deepEqual(d.removed, []);
  assert.equal(d.identical, false);
  assert.equal(d.changed.length, 2);
  assert.match(d.changed.find((c) => c.field === 'S4_VALUE')!.what, /description/);
  assert.match(d.changed.find((c) => c.field === 'LEGACY_VALUE')!.what, /section Mapping → Source/);
});

console.log('flattenXref');

test('fields come out in template order, carrying their section', () => {
  const flat = flattenXref(pair);
  assert.deepEqual(flat.map((f) => f.field), ['LEGACY_VALUE', 'S4_VALUE']);
  assert.equal(flat[0].sectionName, 'Mapping');
});

console.log(`\n${passed} passed`);

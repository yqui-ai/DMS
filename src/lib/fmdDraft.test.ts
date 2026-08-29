import assert from 'node:assert/strict';
import { draftOverlayVersion, DRAFT_VERSION_ID } from './fmdDraft';
import type { FmdDraft, FmdVersion, MappingReviewFinding } from '../types/entities';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (e: any) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
};

const finding = (over: Partial<MappingReviewFinding> = {}): MappingReviewFinding => ({
  id: 'f1', structureId: 's1', structureIdent: 'MARA', rowIndex: 3, field: 'TGT_FIELD',
  severity: 'error', issue: 'MIGRATION_SCOPE is blank', ...over,
});

const base = (findings: MappingReviewFinding[]): FmdVersion => ({
  id: 'ver-live', fmdId: 'fmd-1', version: 'v1.0.3', state: 'Approved',
  publishedBy: 'a@b.c', publishedAt: '2026-01-01T00:00:00Z',
  sheets: {
    generatedTables: [{
      structureId: 's1', structureIdent: 'MARA',
      rows: [{}, {}, {}, { TGT_FIELD: 'old', SRC_FIELD: 'X' }],
    }] as any,
    mappingReviews: [{ id: 'r1', reviewedBy: 'ai', reviewedAt: '2026-01-02T00:00:00Z', findings }],
  },
});

const draft = (changes: any[]): FmdDraft => ({ pendingChanges: changes } as FmdDraft);
const change = (over: any = {}) => ({
  id: 'c1', structureId: 's1', rowIndex: 3, field: 'TGT_FIELD', rowLabel: 'X',
  from: 'old', to: 'new', by: 'me@x.com', at: '2026-02-01T00:00:00Z', ...over,
});

console.log('draftOverlayVersion — inherited review');

test('the review is carried onto the draft, not blanked', () => {
  const v = draftOverlayVersion(base([finding()]), draft([change()]));
  assert.equal(v.sheets.mappingReviews?.length, 1);
  assert.equal(v.sheets.mappingReviews![0].findings.length, 1);
});

test('it is stamped with the version it actually assessed', () => {
  const v = draftOverlayVersion(base([finding()]), draft([change()]));
  assert.deepEqual(v.sheets.mappingReviews![0].inheritedFrom, { versionId: 'ver-live', version: 'v1.0.3' });
});

test('a finding whose exact cell was edited is marked', () => {
  const v = draftOverlayVersion(base([finding()]), draft([change()]));
  assert.equal(v.sheets.mappingReviews![0].findings[0].editedInDraft, true);
});

test('a finding on an untouched cell is NOT marked', () => {
  const v = draftOverlayVersion(base([finding({ field: 'SRC_FIELD' })]), draft([change()]));
  assert.equal(v.sheets.mappingReviews![0].findings[0].editedInDraft, undefined);
});

test('same field, different row -> not marked', () => {
  const v = draftOverlayVersion(base([finding({ rowIndex: 9 })]), draft([change()]));
  assert.equal(v.sheets.mappingReviews![0].findings[0].editedInDraft, undefined);
});

test('same row and field, different structure -> not marked', () => {
  const v = draftOverlayVersion(base([finding({ structureId: 's2' })]), draft([change()]));
  assert.equal(v.sheets.mappingReviews![0].findings[0].editedInDraft, undefined);
});

test('a batch-level finding with no field is never marked', () => {
  const v = draftOverlayVersion(base([finding({ field: undefined })]), draft([change()]));
  assert.equal(v.sheets.mappingReviews![0].findings[0].editedInDraft, undefined);
});

test('addressed state survives the carry-over', () => {
  const stamp = { by: 'me@x.com', at: '2026-01-05T00:00:00Z' };
  const v = draftOverlayVersion(base([finding({ addressed: stamp })]), draft([change()]));
  assert.deepEqual(v.sheets.mappingReviews![0].findings[0].addressed, stamp);
});

test('the finding id is preserved, so marking addressed still matches', () => {
  const v = draftOverlayVersion(base([finding()]), draft([change()]));
  assert.equal(v.sheets.mappingReviews![0].id, 'r1');
  assert.equal(v.sheets.mappingReviews![0].findings[0].id, 'f1');
});

test('the BASE version is not mutated by the overlay', () => {
  const b = base([finding()]);
  draftOverlayVersion(b, draft([change()]));
  assert.equal(b.sheets.mappingReviews![0].inheritedFrom, undefined, 'no inheritedFrom on the stored shape');
  assert.equal(b.sheets.mappingReviews![0].findings[0].editedInDraft, undefined, 'no editedInDraft on the stored shape');
});

test('the legacy single mappingReview key is inherited too', () => {
  const b = base([]);
  b.sheets.mappingReviews = undefined;
  b.sheets.mappingReview = { id: 'legacy', reviewedBy: 'ai', reviewedAt: 'x', findings: [finding()] };
  const v = draftOverlayVersion(b, draft([change()]));
  assert.equal(v.sheets.mappingReview?.inheritedFrom?.version, 'v1.0.3');
  assert.equal(v.sheets.mappingReview?.findings[0].editedInDraft, true);
});

test('no review at all stays undefined rather than becoming an empty one', () => {
  const b = base([]);
  b.sheets.mappingReviews = undefined;
  const v = draftOverlayVersion(b, draft([change()]));
  assert.equal(v.sheets.mappingReviews, undefined);
  assert.equal(v.sheets.mappingReview, undefined);
});

test('the draft still looks like a draft', () => {
  const v = draftOverlayVersion(base([finding()]), draft([change()]));
  assert.equal(v.id, DRAFT_VERSION_ID);
  assert.equal(v.publishedAt, undefined);
  assert.equal((v.sheets.generatedTables as any)[0].rows[3].TGT_FIELD, 'new', 'the edit is applied');
});


console.log('draftOverlayVersion — the base version\u2019s change log stays with the base');

test('a draft does not inherit the published version\u2019s change log', () => {
  const b = base([]);
  b.sheets.changeLog = [change({ id: 'old-1' }), change({ id: 'old-2' })] as any;
  const v = draftOverlayVersion(b, draft([change()]));
  // Spreading `base.sheets` used to carry this in, so every fresh draft opened showing the
  // released version's edits under "Already in this version" — and publishing re-inherited them.
  assert.equal(v.sheets.changeLog, undefined);
});

test('the draft\u2019s own history is its pending changes', () => {
  const v = draftOverlayVersion(base([]), draft([change({ id: 'c9' })]));
  assert.equal(v.sheets.pendingChanges?.length, 1);
  assert.equal(v.sheets.pendingChanges![0].id, 'c9');
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));

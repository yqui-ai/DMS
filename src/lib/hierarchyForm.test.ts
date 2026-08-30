import assert from 'node:assert/strict';
import {
  d, dateForInput, isClosedStatus, isOpenEnded, payloadFor, statusName,
  type HierarchyForm,
} from './hierarchyForm';
import type { RefStatus } from '../types/entities';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (e: any) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
};

const form = (over: Partial<HierarchyForm> = {}): HierarchyForm => ({
  code: ' W1 ', name: ' Wave 1 ', ...over,
});

console.log('isOpenEnded / dateForInput');

test('9999 is the open-ended sentinel, not a date', () => {
  // Printed in a list it reads as a data error; loaded into a date input it turns an unset end
  // date into one the user has to clear by hand, or saves back unnoticed.
  assert.ok(isOpenEnded('9999-12-31'));
  assert.ok(isOpenEnded(undefined));
  assert.ok(isOpenEnded(''));
  assert.ok(!isOpenEnded('2026-12-31'));
});

test('an open-ended date reaches a date input as blank', () => {
  assert.equal(dateForInput('9999-12-31'), '');
  assert.equal(dateForInput(undefined), '');
  assert.equal(dateForInput('2026-03-20'), '2026-03-20');
});

console.log('d — empty string to null');

test('a cleared date input becomes null, not an empty string', () => {
  // Postgres rejects '' for a date rather than treating it as absent, which surfaced as an
  // opaque 22007 on save.
  assert.equal(d(''), null);
  assert.equal(d('   '), null);
  assert.equal(d(undefined), null);
  assert.equal(d('2026-03-20'), '2026-03-20');
});

console.log('payloadFor');

test('seq is never sent, at any level', () => {
  // It used to go as `form.seq ?? 1` with nothing ever setting form.seq, so every row was written
  // at seq 1 AND every edit reset it to 1. The lists order by seq, so the hierarchy had no stable
  // order at all. The column is `not null default 1`; leaving it out is what keeps a meaningful
  // value safe from someone editing a name.
  for (const level of ['PRGM', 'PRJT', 'SPRJ', 'CYCL'] as const) {
    assert.ok(!('seq' in payloadFor(level, form())), `${level} still sends seq`);
  }
});

test('code and name are trimmed', () => {
  const row = payloadFor('PRJT', form());
  assert.equal(row.code, 'W1');
  assert.equal(row.name, 'Wave 1');
});

test('blank optional text becomes null rather than an empty string', () => {
  const row = payloadFor('PRJT', form({ description: '   ', status: '' }));
  assert.equal(row.description, null);
  assert.equal(row.status, null);
});

test('a program carries its two leads and nothing about dates below it', () => {
  const row = payloadFor('PRGM', form({ owner: ' a@b.com ', coLead: '' }));
  assert.equal(row.owner, 'a@b.com');
  assert.equal(row.co_lead, null);
  assert.ok(!('prep_start_date' in row), 'a program has no preparation dates');
  assert.ok(!('mig_start' in row), 'a program has no migration dates');
});

test('a subproject carries preparation and freeze dates; a cycle carries migration dates', () => {
  // Sending a column the level does not have is rejected by the database, so the split matters.
  const sp = payloadFor('SPRJ', form({ prepStartDate: '2026-01-05', freezeDate: '2026-03-20' }));
  assert.equal(sp.prep_start_date, '2026-01-05');
  assert.equal(sp.freeze_date, '2026-03-20');
  assert.ok(!('mig_start' in sp));

  const cy = payloadFor('CYCL', form({ migStart: '2026-04-01', dataFreeze: '2026-03-31' }));
  assert.equal(cy.mig_start, '2026-04-01');
  assert.equal(cy.data_freeze, '2026-03-31');
  assert.ok(!('prep_start_date' in cy));
});

test('cleared dates go as null at every level', () => {
  const sp = payloadFor('SPRJ', form({ startDate: '', endDate: '', freezeDate: '' }));
  assert.equal(sp.start_date, null);
  assert.equal(sp.end_date, null);
  assert.equal(sp.freeze_date, null);
});

console.log('statusName / isClosedStatus');

const statuses: RefStatus[] = [
  { type: 'SPRJ', code: 'ACT', name: 'Active', seq: 1, isDefault: true, isClosed: false },
  { type: 'SPRJ', code: 'CLO', name: 'Closed', seq: 2, isDefault: false, isClosed: true },
  { type: 'PRJT', code: 'ACT', name: 'Running', seq: 1, isDefault: true, isClosed: false },
];

test('a status is named within its own level, not across levels', () => {
  // ACT exists at two levels with different names; picking the wrong one would mislabel the row.
  assert.equal(statusName(statuses, 'SPRJ', 'ACT'), 'Active');
  assert.equal(statusName(statuses, 'PRJT', 'ACT'), 'Running');
});

test('an unknown status falls back to its code, then to a dash', () => {
  assert.equal(statusName(statuses, 'SPRJ', 'XXX'), 'XXX');
  assert.equal(statusName(statuses, 'SPRJ', undefined), '—');
});

test('closed is read from the status table, never guessed from the name', () => {
  assert.ok(isClosedStatus(statuses, 'SPRJ', 'CLO'));
  assert.ok(!isClosedStatus(statuses, 'SPRJ', 'ACT'));
  assert.ok(!isClosedStatus(statuses, 'SPRJ', 'XXX'));
});

console.log('');
console.log(passed + ' passed');

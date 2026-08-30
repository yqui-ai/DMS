import assert from 'node:assert/strict';
import {
  describeChange, entityLabel, fieldChangeShape, fieldLabel, formatValue,
  isDocumentField, looksLikeUuid, summaryCoversFields,
  type ChangeEntry,
} from './changeLogText';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (e: any) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
};

const UUID = 'ba201d27-4f8b-455b-b480-fb47de6f708e';
const OTHER = '69904630-539d-4d80-99f8-3855bbea5ef6';

/** One log entry. `summary` is what the trigger stored; everything the UI shows is derived. */
const entry = (over: Partial<ChangeEntry> = {}): ChangeEntry => ({
  id: '1', at: '2026-08-30T14:48:00Z', actor: 'jordan.alvarez@client.com',
  entity: 'subproject_objects', op: 'update', summary: 'Updated SIF_CUSTOMER_2 (consultant)',
  fields: [], ...over,
});

console.log('entityLabel');

test('maps a known table to what a person calls it', () => {
  assert.equal(entityLabel('subproject_objects'), 'Scope entry');
  assert.equal(entityLabel('fmds'), 'Field Mapping');
});

test('an unmapped table still reads as words, never as snake_case', () => {
  // The floor, not a substitute for a real entry — but it must never leak an underscore.
  assert.equal(entityLabel('widget_things'), 'Widget thing');
  assert.ok(!entityLabel('widget_things').includes('_'));
});

console.log('fieldLabel');

test('maps a column whose name is not its meaning', () => {
  assert.equal(fieldLabel('fmd_id'), 'Field Mapping');
  assert.equal(fieldLabel('based_on_golden_version_id'), 'Golden template version');
});

test('an unmapped column is de-snake-cased, and never shows an underscore', () => {
  assert.equal(fieldLabel('some_new_column'), 'Some new column');
  assert.ok(!fieldLabel('another_unmapped_thing').includes('_'));
});

test('ETL stays capitalised rather than becoming Etl', () => {
  assert.equal(fieldLabel('etl_developer'), 'ETL developer');
});

console.log('formatValue');

test('null, undefined and empty all read as a dash', () => {
  assert.equal(formatValue(null), '—');
  assert.equal(formatValue(undefined), '—');
  assert.equal(formatValue(''), '—');
});

test('a uuid is never shown — it names nothing to a reader', () => {
  assert.equal(formatValue(UUID), '—');
});

test('an ISO timestamp is rendered, not dumped', () => {
  const out = formatValue('2026-08-30T13:20:31.018+00:00');
  assert.ok(!out.includes('T13:20:31'), 'raw ISO leaked: ' + out);
  assert.ok(/2026/.test(out), 'year missing from ' + out);
});

test('numbers and booleans survive as themselves', () => {
  assert.equal(formatValue(0), '0');
  assert.equal(formatValue(false), 'false');
});

test('long JSON is truncated rather than filling the row', () => {
  const big = { pendingChanges: Array.from({ length: 200 }, (_, i) => ({ i })) };
  const out = formatValue(big);
  assert.ok(out.length <= 241, 'not truncated: ' + out.length);
  assert.ok(out.endsWith('…'));
});

console.log('fieldChangeShape');

test('a reference reports the transition, never "— → —"', () => {
  // The bug this exists for: from null to a uuid, both sides render as a dash, so the diff
  // asserted that nothing changed on a row whose whole point was that something did.
  assert.deepEqual(fieldChangeShape('fmd_id', null, UUID), { kind: 'word', word: 'set' });
  assert.deepEqual(fieldChangeShape('fmd_id', UUID, null), { kind: 'word', word: 'cleared' });
  assert.deepEqual(fieldChangeShape('fmd_id', UUID, OTHER), { kind: 'word', word: 'changed' });
});

test('a uuid value is treated as a reference even when the column name does not say so', () => {
  assert.equal(fieldChangeShape('whatever', null, UUID).kind, 'word');
});

test('a document column says it changed rather than printing itself', () => {
  assert.deepEqual(fieldChangeShape('draft', { a: 1 }, { a: 2 }), { kind: 'word', word: 'changed' });
  assert.ok(isDocumentField('sheets'));
});

test('an ordinary value keeps the arrow', () => {
  assert.deepEqual(
    fieldChangeShape('status', 'Pending', 'Cancelled'),
    { kind: 'move', from: 'Pending', to: 'Cancelled' },
  );
});

test('a cleared ordinary value still reads as a move, not as "cleared"', () => {
  // Only references collapse to a word — losing "was Jordan" here would lose the audit.
  assert.deepEqual(
    fieldChangeShape('consultant', 'jordan@client.com', null),
    { kind: 'move', from: 'jordan@client.com', to: '—' },
  );
});

console.log('describeChange');

test('an insert names the record', () => {
  assert.equal(
    describeChange(entry({ op: 'insert', summary: 'Created FMDCST-14', fields: [] })),
    'Created FMDCST-14',
  );
});

test('a uuid-named record is described by what it IS, never by its id', () => {
  const out = describeChange(entry({ op: 'insert', summary: `Created ${UUID}`, fields: [] }));
  assert.ok(!out.includes(UUID), 'uuid leaked: ' + out);
  assert.equal(out, 'Created a scope entry');
});

test('publishing is named as publishing', () => {
  const out = describeChange(entry({
    entity: 'fmd_versions', summary: 'Updated FMDCST-9 v1.0.2 (published_at, published_by)',
    fields: [{ field: 'published_at', from: null, to: '2026-08-30T10:00:00Z' }],
  }));
  assert.equal(out, 'Published FMDCST-9 v1.0.2');
});

test('finalizing and re-opening a scope are told apart by the value', () => {
  const base = { entity: 'subprojects', summary: 'Updated W1A (scope_finalized)' };
  assert.match(
    describeChange(entry({ ...base, fields: [{ field: 'scope_finalized', from: false, to: true }] })),
    /^Scope finalized/,
  );
  assert.match(
    describeChange(entry({ ...base, fields: [{ field: 'scope_finalized', from: true, to: false }] })),
    /^Scope re-opened/,
  );
});

test('archiving and restoring are told apart by the value', () => {
  const base = { entity: 'projects', summary: 'Updated W1 (archived_at)' };
  assert.match(
    describeChange(entry({ ...base, fields: [{ field: 'archived_at', from: null, to: '2026-08-30T10:00:00Z' }] })),
    /^Archived/,
  );
  assert.match(
    describeChange(entry({ ...base, fields: [{ field: 'archived_at', from: '2026-08-30T10:00:00Z', to: null }] })),
    /^Restored/,
  );
});

test('assigning and removing a Field Mapping read differently', () => {
  const base = { summary: 'Updated SIF_CUST_EXT_2 (fmd_id)' };
  assert.match(
    describeChange(entry({ ...base, fields: [{ field: 'fmd_id', from: null, to: UUID }] })),
    /^Field Mapping assigned on SIF_CUST_EXT_2$/,
  );
  assert.match(
    describeChange(entry({ ...base, fields: [{ field: 'fmd_id', from: UUID, to: null }] })),
    /^Field Mapping removed from SIF_CUST_EXT_2$/,
  );
});

test('a person assignment names the person', () => {
  const out = describeChange(entry({
    summary: 'Updated SIF_CUSTOMER_2 (consultant)',
    fields: [{ field: 'consultant', from: null, to: 'jordan.alvarez@client.com' }],
  }));
  assert.equal(out, 'Consultant on SIF_CUSTOMER_2 set to jordan.alvarez@client.com');
});

test('the generic case names the fields in words, not column names', () => {
  const out = describeChange(entry({
    entity: 'archive_requests', summary: 'Updated a request (decided_at, status)',
    fields: [
      { field: 'decided_at', from: null, to: '2026-08-30T13:20:31Z' },
      { field: 'status', from: 'Pending', to: 'Cancelled' },
    ],
  }));
  assert.ok(!out.includes('_'), 'a column name leaked: ' + out);
  assert.ok(out.includes('Decided at') && out.includes('Status'));
});

test('more than three changed fields are summarised rather than listed', () => {
  const out = describeChange(entry({
    fields: ['a_one', 'b_two', 'c_three', 'd_four', 'e_five']
      .map((field) => ({ field, from: 1, to: 2 })),
  }));
  assert.match(out, /and 2 more/);
});

console.log('summaryCoversFields');

test('inserts and deletes never want a diff line', () => {
  assert.equal(summaryCoversFields(entry({ op: 'insert' })), true);
  assert.equal(summaryCoversFields(entry({ op: 'delete' })), true);
});

test('a change the sentence already explains suppresses its own diff', () => {
  // "Field Mapping assigned on X" + "Field Mapping: set" is one fact twice.
  assert.equal(
    summaryCoversFields(entry({ fields: [{ field: 'fmd_id', from: null, to: UUID }] })),
    true,
  );
});

test('a change the sentence only lists still shows its diff', () => {
  assert.equal(
    summaryCoversFields(entry({
      entity: 'archive_requests',
      fields: [
        { field: 'decided_at', from: null, to: '2026-08-30T13:20:31Z' },
        { field: 'status', from: 'Pending', to: 'Cancelled' },
      ],
    })),
    false,
  );
});

console.log('looksLikeUuid');

test('recognises a uuid and nothing else', () => {
  assert.ok(looksLikeUuid(UUID));
  assert.ok(!looksLikeUuid('SIF_CUSTOMER_2'));
  assert.ok(!looksLikeUuid('v1.0.5'));
  assert.ok(!looksLikeUuid(''));
});

console.log('');
console.log(passed + ' passed');

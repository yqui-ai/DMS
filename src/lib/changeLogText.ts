import { fmtDateTime } from './format';

/* The change log's DISPLAY rules, with no database client anywhere near them.

   Split out of queries/changeLog.ts so they can be tested. That module imports the Supabase
   client, which reads import.meta.env and therefore cannot be loaded outside Vite — so the pure
   logic that decides how an entry READS was untestable purely by association. These are total
   functions over a recorded entry; see changeLogText.test.ts, and the change-log-writing skill
   for the rules they implement.

   queries/changeLog.ts re-exports all of this, so no caller needs to know about the split. */
export type ChangeOp = 'insert' | 'update' | 'delete';

/** One column that moved, as the log recorded it. */
export interface FieldChange { field: string; from: unknown; to: unknown }

export interface ChangeEntry {
  id: string;
  at: string;
  actor: string;
  /** The table. Rendered through `ENTITY_LABEL` — nobody outside the repo knows what
   * `subproject_objects` is. */
  entity: string;
  entityId?: string;
  op: ChangeOp;
  /** Deterministic sentence written by the trigger. Always present. */
  summary?: string;
  fields: FieldChange[];
  programId?: string;
  subprojectId?: string;
}

/** Table name → what a person calls it. A log that says `fmd_field_notes` is a log for developers. */
export const ENTITY_LABEL: Record<string, string> = {
  programs: 'Program',
  projects: 'Project',
  subprojects: 'Subproject',
  cycles: 'Cycle',
  fmds: 'Field Mapping',
  fmd_versions: 'FMD version',
  fmd_field_notes: 'Review point',
  rules: 'Rule',
  xref_tables: 'Cross reference',
  xref_versions: 'XREF version',
  subproject_objects: 'Scope entry',
  scope_candidates: 'Scope candidate',
  scope_waivers: 'Prerequisite waiver',
  memberships: 'Membership',
  archive_requests: 'Archive request',
  archive_approvals: 'Archive approval',
  plants: 'Plant',
  subproject_plants: 'Plant assignment',
};

/** Falls back to a de-snake-cased name rather than the raw table, so a newly logged table reads as
 * "Scope waiver" on the day it is registered instead of `scope_waivers`. Add a real entry above —
 * this is a floor, not a substitute. */
export const entityLabel = (entity: string) =>
  ENTITY_LABEL[entity] ?? sentenceCase(entity.replace(/s$/, ''));

/** Column → what a person calls it. See the `change-log-writing` skill: a log that says
 * `based_on_golden_version_id` is a log for developers. */
export const FIELD_LABEL: Record<string, string> = {
  fmd_id: 'Field Mapping',
  etl_developer: 'ETL developer',
  consultant: 'Consultant',
  in_scope: 'In scope',
  load_seq: 'Load sequence',
  scope_finalized: 'Scope finalized',
  based_on_golden_version_id: 'Golden template version',
  standard_ref_version_id: 'Standard FMD version',
  published_at: 'Published',
  published_by: 'Published by',
  migration_object_id: 'Migration object',
  subproject_id: 'Subproject',
  program_id: 'Program',
  project_id: 'Project',
  plant_id: 'Plant',
  display_id: 'ID',
  hist_source_name: 'Source file',
  hist_plant: 'Source plant',
  waiver_reason: 'Waiver reason',
  mapping_status: 'Mapping status',
  role_id: 'Role',
  user_id: 'User',
  archived_at: 'Archived',
  archived_by: 'Archived by',
  draft: 'Draft contents',
  sheets: 'Mapping contents',
  structure: 'Structure',
};

const sentenceCase = (s: string) => {
  const words = s.replace(/_id$/, '').split('_').filter(Boolean);
  if (words.length === 0) return s;
  // ETL is the one acronym that appears often enough for "Etl developer" to look like a bug.
  const first = words[0].toLowerCase() === 'etl' ? 'ETL' : words[0][0].toUpperCase() + words[0].slice(1);
  return [first, ...words.slice(1)].join(' ');
};

export const fieldLabel = (field: string) => FIELD_LABEL[field] ?? sentenceCase(field);

/** Columns whose value is a whole document rather than a datum. Reported as "changed", never
 * printed: 400 characters of `{"baseVersionId":…}` buries every readable entry around it. */
const JSON_FIELDS = new Set(['draft', 'sheets', 'structure', 'changes', 'approvals']);
export const isDocumentField = (field: string) => JSON_FIELDS.has(field);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const looksLikeUuid = (s: string) => UUID_RE.test(s.trim());

/** The record's name, or a description of what it is — never its uuid.
 *
 * The trigger stores a summary shaped `Created <label>` / `Updated <label> (<cols>)`, and for rows
 * with no naming column of their own that label IS the uuid. `change_log` is append-only, so those
 * sentences cannot be rewritten in place — they are unpicked here instead, which fixes entries
 * already recorded as well as new ones. */
function recordName(e: ChangeEntry): string {
  const raw = (e.summary ?? '')
    .replace(/^(Created|Updated|Deleted)\s+/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
  if (raw && !looksLikeUuid(raw)) return raw;
  // No usable name. Say what the record is, in lower case, so the sentence reads as prose:
  // "A scope entry was changed" beats "Updated ba201d27-…".
  return `a ${entityLabel(e.entity).toLowerCase()}`;
}

/** True when `describeChange`'s sentence already says everything a diff line would.
 *
 * "Field Mapping assigned on SIF_CUST_EXT_2" followed by "Field Mapping: set" is the same fact
 * twice, and repetition in a log is worse than terseness — it doubles the reading for none of the
 * information. Every signature case below is one `describeChange` fully explains. */
export function summaryCoversFields(e: ChangeEntry): boolean {
  if (e.op !== 'update') return true; // inserts and deletes carry no field diff at all
  const changed = new Set(e.fields.map((f) => f.field));
  if (changed.has('published_at') || changed.has('scope_finalized') || changed.has('archived_at')) return true;
  if (changed.size === 1 && (changed.has('fmd_id') || changed.has('consultant') || changed.has('etl_developer'))) return true;
  if (changed.size === 1 && isDocumentField(e.fields[0].field)) return true;
  return false;
}

/** One entry as a sentence a person can read.
 *
 * Built from `entity`, `op` and the field diff rather than shown straight from `summary` — see the
 * `change-log-writing` skill. Recognised field signatures get the verb that names the real action
 * ("Published", "Assigned"); everything else falls back to naming the record and what moved. */
export function describeChange(e: ChangeEntry): string {
  const name = recordName(e);
  const named = name.startsWith('a ') ? name : `${name}`;
  const changed = new Set(e.fields.map((f) => f.field));

  if (e.op === 'insert') return `Created ${named}`;
  if (e.op === 'delete') return `Deleted ${named}`;

  // ── Field signatures: a write whose columns match a known shape gets its real verb.
  if (changed.has('published_at')) return `Published ${named}`;
  if (changed.has('scope_finalized')) {
    const on = e.fields.find((f) => f.field === 'scope_finalized')?.to === true;
    return on ? `Scope finalized for ${named}` : `Scope re-opened for ${named}`;
  }
  if (changed.has('archived_at')) {
    const on = !!e.fields.find((f) => f.field === 'archived_at')?.to;
    return on ? `Archived ${named}` : `Restored ${named}`;
  }
  if (changed.size === 1 && changed.has('fmd_id')) {
    const to = e.fields[0]?.to;
    return to ? `Field Mapping assigned on ${named}` : `Field Mapping removed from ${named}`;
  }
  if (changed.size === 1 && (changed.has('consultant') || changed.has('etl_developer'))) {
    const f = e.fields[0];
    const who = typeof f.to === 'string' && f.to ? f.to : null;
    return who
      ? `${fieldLabel(f.field)} on ${named} set to ${who}`
      : `${fieldLabel(f.field)} cleared on ${named}`;
  }
  if (changed.size === 1 && isDocumentField(e.fields[0].field)) {
    return `${fieldLabel(e.fields[0].field)} changed on ${named}`;
  }

  // ── Generic: name the record and what moved, in words.
  const labels = e.fields.map((f) => fieldLabel(f.field));
  if (labels.length === 0) return `Changed ${named}`;
  const list = labels.length <= 3
    ? labels.join(', ')
    : `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more`;
  return `${list} changed on ${named}`;
}


/** A readable rendering of one recorded value.
 *
 * JSONB round-trips everything as a string, an object or null, and printing `[object Object]` in an
 * audit trail is worse than printing nothing. Long JSON is truncated here rather than in the markup
 * so the same limit applies wherever a value is shown. */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') {
    if (v === '') return '—';
    if (looksLikeUuid(v)) return '—';
    // Timestamps come out of JSONB as ISO strings. `2026-08-30T13:20:31.018+00:00` in an audit
    // trail is a value nobody reads — it is the one field type where the raw form is strictly
    // worse than the rendered one.
    if (ISO_DATE_RE.test(v)) return fmtDateTime(v);
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const json = JSON.stringify(v);
  return json.length > 240 ? `${json.slice(0, 240)}…` : json;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** How one field's change should read: a movement, or a single word.
 *
 * `from → to` is right for values a person recognises, and useless for the ones they don't. A
 * foreign key moving from null to a uuid rendered as `— → —` — a diff asserting that nothing
 * changed, on a row whose whole point was that something did. Suppressing the uuid was correct;
 * still drawing the arrow around the hole was not.
 *
 * So references report the TRANSITION rather than the values: set, cleared, changed. Same for
 * documents, which are far too big to show. Everything else keeps the arrow. */
export type FieldChangeShape =
  | { kind: 'word'; word: string }
  | { kind: 'move'; from: string; to: string };

export function fieldChangeShape(field: string, from: unknown, to: unknown): FieldChangeShape {
  const had = from !== null && from !== undefined && from !== '';
  const has = to !== null && to !== undefined && to !== '';

  if (isDocumentField(field)) return { kind: 'word', word: 'changed' };

  // A reference: its value is an id, which names nothing to a reader. What matters is whether one
  // is now there. `describeChange` already says WHICH document in the sentence above.
  const isReference = field.endsWith('_id')
    || (typeof from === 'string' && looksLikeUuid(from))
    || (typeof to === 'string' && looksLikeUuid(to));
  if (isReference) {
    return { kind: 'word', word: has && had ? 'changed' : has ? 'set' : 'cleared' };
  }

  return { kind: 'move', from: formatValue(from), to: formatValue(to) };
}


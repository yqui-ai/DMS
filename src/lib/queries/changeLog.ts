import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

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

/** Columns worth showing a value for. Everything else in a diff is plumbing. */
const isNoise = (field: string) => field === 'id' || field.endsWith('_vector');

const toEntry = (r: any): ChangeEntry => ({
  id: r.id,
  at: r.at,
  actor: r.actor,
  entity: r.entity,
  entityId: r.entity_id ?? undefined,
  op: r.op,
  summary: r.summary ?? undefined,
  fields: Object.entries((r.changes ?? {}) as Record<string, { from: unknown; to: unknown }>)
    .filter(([field]) => !isNoise(field))
    .map(([field, v]) => ({ field, from: v?.from, to: v?.to }))
    .sort((a, b) => a.field.localeCompare(b.field)),
  programId: r.program_id ?? undefined,
  subprojectId: r.subproject_id ?? undefined,
});

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

export interface ChangeLogFilter {
  entity?: string;
  programId?: string;
  /** Newest first, capped — the log grows without bound and nobody reads page 400. */
  limit?: number;
}

/** The system change log, newest first.
 *
 * Read-only by construction: the table has a SELECT policy and no INSERT or UPDATE policy, so there
 * is no mutation hook here and there never should be. History that can be edited is not history.
 *
 * RLS already limits this to records the user can reach, so nothing here needs a scope argument to
 * be safe — the filters below are for narrowing, not for permission. */
export function useChangeLog(filter: ChangeLogFilter = {}) {
  const { entity, programId, limit = 200 } = filter;
  return useQuery({
    queryKey: ['change-log', entity ?? '', programId ?? '', limit],
    queryFn: async (): Promise<ChangeEntry[]> => {
      let q = supabase
        .from('change_log')
        .select('id, at, actor, entity, entity_id, op, changes, summary, program_id, subproject_id')
        .order('at', { ascending: false })
        .limit(limit);
      if (entity) q = q.eq('entity', entity);
      if (programId) q = q.eq('program_id', programId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(toEntry);
    },
  });
}

/** Every entry for one record — the history of a single FMD, object or rule.
 *
 * The reason the detail view exists: an FMD changes far more often than anything else, and "what
 * happened to THIS document" is a different question from "what happened today". */
export function useEntityHistory(entity?: string, entityId?: string) {
  return useQuery({
    queryKey: ['change-log-entity', entity, entityId],
    enabled: !!entity && !!entityId,
    queryFn: async (): Promise<ChangeEntry[]> => {
      const { data, error } = await supabase
        .from('change_log')
        .select('id, at, actor, entity, entity_id, op, changes, summary, program_id, subproject_id')
        .eq('entity', entity!).eq('entity_id', entityId!)
        .order('at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map(toEntry);
    },
  });
}

/** A readable rendering of one recorded value.
 *
 * JSONB round-trips everything as a string, an object or null, and printing `[object Object]` in an
 * audit trail is worse than printing nothing. Long JSON is truncated here rather than in the markup
 * so the same limit applies wherever a value is shown. */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v === '' ? '—' : (looksLikeUuid(v) ? '—' : v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const json = JSON.stringify(v);
  return json.length > 240 ? `${json.slice(0, 240)}…` : json;
}

/** Plain-English one-liners for a batch of entries, from the shared edge function.
 *
 * **An enrichment, never the source of truth.** Every entry already carries the trigger's
 * deterministic summary; this replaces the wording where that sentence is accurate but unreadable
 * — an FMD publish records one changed `sheets` column when what happened was fourteen mapping
 * cells and a release. If the call fails, is not deployed, or has no key, the list is unaffected.
 *
 * Not a react-query mutation because it has no server state to invalidate: it returns text the
 * caller holds for the life of the screen. Nothing is written back to `change_log`, which is
 * append-only and trigger-written.
 */
export async function summariseChanges(entries: ChangeEntry[]): Promise<Record<string, string>> {
  if (entries.length === 0) return {};
  const { data, error } = await supabase.functions.invoke('convert-historical-fmd', {
    body: {
      task: 'change-summary',
      entries: entries.map((e) => ({
        id: e.id,
        entity: entityLabel(e.entity),
        op: e.op,
        // The trigger's summary already carries the record's name; the model is told not to invent
        // identifiers, so this is what it renames rather than something it has to guess at.
        label: e.summary,
        fields: e.fields.map((f) => f.field).slice(0, 12),
      })),
    },
  });
  if (error) throw error;
  const summaries = (data as any)?.summaries;
  return summaries && typeof summaries === 'object' ? summaries : {};
}

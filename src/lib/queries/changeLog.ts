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
};

export const entityLabel = (entity: string) => ENTITY_LABEL[entity] ?? entity;

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
  if (typeof v === 'string') return v === '' ? '—' : v;
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

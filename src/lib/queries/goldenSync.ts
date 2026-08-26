import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { invokeAiTask } from './aiEdgeFunction';
import type { FmdVersion, GeneratedColumn, GeneratedTable, GoldenFmdStructure } from '../../types/entities';

export interface GoldenSyncRename { from: string; to: string; confidence: string; why?: string }

export interface GoldenSyncPlan {
  /** Columns in the current Golden template, in its order — what the FMD will end up with. */
  nextColumns: GeneratedColumn[];
  added: GeneratedColumn[];
  removed: GeneratedColumn[];
  /** Fields present in both, but moved position. */
  reordered: boolean;
  /** Fields whose NAME is unchanged but whose section, colour or description moved. These don't
   * touch any data, but they're a real difference and they're why an FMD can read as outdated
   * while its column list is identical. */
  metadataChanges: { field: string; what: string }[];
  /** True when the Golden version pointer is stale but nothing about the structure actually
   * differs — the template moved for reasons that don't affect this FMD. Re-linking clears the
   * "Outdated" flag without producing a version nobody needs. */
  relinkOnly: boolean;
  renames: GoldenSyncRename[];
  /** Removed columns that carry data in this FMD and aren't covered by a rename — the ones where
   * syncing actually loses something. */
  dataLossFields: { field: string; rows: number }[];
  summary: string;
}

const flatten = (structure: GoldenFmdStructure): GeneratedColumn[] =>
  structure.sections.flatMap((s) => s.fields.map((f) => ({
    field: f.field, sectionName: s.name, color: s.color, description: f.description,
  })));

/** Builds the sync plan: what the Golden template changed, and what that costs this FMD.
 *
 * Everything structural is computed here in plain JS — which columns were added, removed, reordered,
 * and how many rows would lose data. The AI is asked exactly one question: which removed column is
 * which added column renamed. That's the only part with no correct mechanical answer, and getting
 * it right is what stops a rename from silently discarding a populated column. If the AI call
 * fails, the plan is still returned without renames rather than blocking the sync — the user just
 * sees the removals as removals. */
export function useGoldenSyncPlan() {
  return {
    async buildPlan(current: FmdVersion, goldenStructure: GoldenFmdStructure): Promise<GoldenSyncPlan> {
      const nextColumns = flatten(goldenStructure);
      const currentColumns = current.sheets.generatedColumns ?? [];
      const currentNames = new Set(currentColumns.map((c) => c.field));
      const nextNames = new Set(nextColumns.map((c) => c.field));

      const added = nextColumns.filter((c) => !currentNames.has(c.field));
      const removed = currentColumns.filter((c) => !nextNames.has(c.field));
      const shared = currentColumns.filter((c) => nextNames.has(c.field)).map((c) => c.field);
      const sharedNext = nextColumns.filter((c) => currentNames.has(c.field)).map((c) => c.field);
      const reordered = shared.join('|') !== sharedNext.join('|');

      // Same field name, different presentation. Detected explicitly so "nothing changed" can't be
      // reported when the template genuinely did change — just not in a way that moves data.
      const currentByField = new Map(currentColumns.map((c) => [c.field, c]));
      const metadataChanges: { field: string; what: string }[] = [];
      for (const next of nextColumns) {
        const prev = currentByField.get(next.field);
        if (!prev) continue;
        const bits: string[] = [];
        if (prev.sectionName !== next.sectionName) bits.push(`section ${prev.sectionName} → ${next.sectionName}`);
        if (prev.color !== next.color) bits.push('colour');
        if ((prev.description ?? '') !== (next.description ?? '')) bits.push('description');
        if (bits.length) metadataChanges.push({ field: next.field, what: bits.join(', ') });
      }

      let renames: GoldenSyncRename[] = [];
      let summary = '';
      if (added.length && removed.length) {
        try {
          const data = await invokeAiTask({
            task: 'golden-sync',
            removed: removed.map((c) => ({ field: c.field, description: c.description })),
            added: added.map((c) => ({ field: c.field, description: c.description })),
          });
          renames = ((data?.renames ?? []) as GoldenSyncRename[])
            // Trust nothing the model returns as a column name — only keep pairs that name a real
            // removed column and a real added one.
            .filter((r) => removed.some((c) => c.field === r.from) && added.some((c) => c.field === r.to));
          summary = typeof data?.summary === 'string' ? data.summary : '';
        } catch {
          summary = 'Could not reach the AI to check for renamed columns — removals below are treated as removals.';
        }
      }

      const renamedFrom = new Set(renames.map((r) => r.from));
      const tables = current.sheets.generatedTables ?? [];
      const dataLossFields = removed
        .filter((c) => !renamedFrom.has(c.field))
        .map((c) => ({
          field: c.field,
          rows: tables.reduce((n, t) => n + t.rows.filter((r) => (r[c.field] ?? '').trim() !== '').length, 0),
        }))
        .filter((x) => x.rows > 0);

      const relinkOnly = !added.length && !removed.length && !reordered && !metadataChanges.length;
      return { nextColumns, added, removed, reordered, metadataChanges, relinkOnly, renames, dataLossFields, summary };
    },
  };
}

/** Applies an approved plan as a NEW DRAFT version — never in place, so the sync is reviewable and
 * revertable like any other change, and a published version stays frozen. Renamed columns carry
 * their data across; genuinely removed columns are dropped; added columns start empty. */
export function useApplyGoldenSync(fmdId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return {
    /** Points the FMD at the current Golden version without touching its content. For when the
     * template moved but nothing about this FMD's structure differs — creating a version would add
     * an entry to the history that changed nothing. */
    async relink(goldenVersionId: string): Promise<void> {
      const { error } = await supabase
        .from('fmds').update({ based_on_golden_version_id: goldenVersionId }).eq('id', fmdId);
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fmds-library'] }),
        queryClient.invalidateQueries({ queryKey: ['golden-where-used'] }),
      ]);
    },
    async apply(current: FmdVersion, plan: GoldenSyncPlan, goldenVersionId: string, goldenVersionLabel: string): Promise<void> {
      const renameMap = new Map(plan.renames.map((r) => [r.to, r.from]));
      const nextTables: GeneratedTable[] = (current.sheets.generatedTables ?? []).map((t) => ({
        ...t,
        rows: t.rows.map((row) => {
          const next: Record<string, string> = {};
          for (const col of plan.nextColumns) {
            const source = renameMap.get(col.field) ?? col.field;
            next[col.field] = row[source] ?? '';
          }
          return next;
        }),
      }));

      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();
      const bits = [
        plan.added.length ? `${plan.added.length} added` : '',
        plan.renames.length ? `${plan.renames.length} renamed` : '',
        plan.dataLossFields.length ? `${plan.dataLossFields.length} removed with data` : '',
      ].filter(Boolean).join(', ');

      const { mappingReview: _l, mappingReviews: _r, pendingChanges: _p, ...carried } = current.sheets;
      const { error } = await supabase.from('fmd_versions').insert({
        fmd_id: fmdId,
        version: bumpPatch(current.version),
        state: 'Draft',
        sheets: { ...carried, generatedColumns: plan.nextColumns, generatedTables: nextTables },
        comment: `Synced to Golden FMD ${goldenVersionLabel}${bits ? ` — ${bits}` : ''}`,
        created_by: who, created_at: now,
      });
      if (error) throw error;

      // Point the FMD at the Golden version it now matches, so it stops reading as outdated.
      const { error: linkError } = await supabase
        .from('fmds').update({ based_on_golden_version_id: goldenVersionId }).eq('id', fmdId);
      if (linkError) throw linkError;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fmd-versions', fmdId] }),
        queryClient.invalidateQueries({ queryKey: ['fmd-version-latest', fmdId] }),
        queryClient.invalidateQueries({ queryKey: ['fmds-library'] }),
        queryClient.invalidateQueries({ queryKey: ['golden-where-used'] }),
      ]);
    },
  };
}

const bumpPatch = (version: string): string => {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? `v${m[1]}.${m[2]}.${Number(m[3]) + 1}` : 'v1.0.1';
};

import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { invokeAiTask } from './aiEdgeFunction';
import { applyPendingChanges } from './fmds';
import type { FmdDraft, FmdVersion, GeneratedColumn, GeneratedTable, GoldenFmdStructure } from '../../types/entities';

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

/** Every property a generated column carries, not just the ones that existed when sync was
 * written. Dropping `critical`, `kind` and `options` here meant a sync silently reset an FMD's
 * input rules to plain text — the columns it wrote were missing the very fields that decide the
 * editor and the validation. */
const flatten = (structure: GoldenFmdStructure): GeneratedColumn[] =>
  structure.sections.flatMap((s) => s.fields.map((f) => ({
    field: f.field, sectionName: s.name, color: s.color, description: f.description,
    critical: f.critical || undefined, kind: f.kind, options: f.options,
  })));

const sameOptions = (a: string[] | undefined, b: string[] | undefined) =>
  (a ?? []).join('\u0000') === (b ?? []).join('\u0000');

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
        // A type or value-list change moves no data, but it changes what the FMD will ACCEPT — so
        // it has to count as a real difference. Without these three the plan read "already aligned"
        // and re-typing a column in the template never reached the FMDs generated from it.
        if ((prev.kind ?? 'text') !== (next.kind ?? 'text')) bits.push(`type ${prev.kind ?? 'text'} → ${next.kind ?? 'text'}`);
        if (!sameOptions(prev.options, next.options)) bits.push('allowed values');
        if (!!prev.critical !== !!next.critical) bits.push(next.critical ? 'now critical' : 'no longer critical');
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
      const invalidate = () => Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fmd-versions', fmdId] }),
        queryClient.invalidateQueries({ queryKey: ['fmd-version-latest', fmdId] }),
        queryClient.invalidateQueries({ queryKey: ['fmds-library'] }),
        queryClient.invalidateQueries({ queryKey: ['golden-where-used'] }),
      ]);

      // The Golden template moved but its columns didn't, so there is nothing to restructure — only
      // the reference is stale. Inserting a version whose content is byte-identical to the current
      // one would add a stray unpublished row to the history and change nothing about the document.
      if (plan.relinkOnly) {
        const { error: relinkError } = await supabase
          .from('fmds').update({ based_on_golden_version_id: goldenVersionId }).eq('id', fmdId);
        if (relinkError) throw relinkError;
        await invalidate();
        return;
      }

      // Read the newest version from the DATABASE rather than trusting the one the viewer had
      // selected. Two things depend on it: syncing must not rebuild from a version someone happened
      // to be browsing and overwrite newer content, and it must know whether an unpublished row
      // already exists to write into.
      const { data: newest, error: newestError } = await supabase
        .from('fmd_versions')
        .select('id, version, sheets, published_at')
        .eq('fmd_id', fmdId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (newestError) throw newestError;
      const base = (newest?.sheets ?? current.sheets) as FmdVersion['sheets'];

      const renameMap = new Map(plan.renames.map((r) => [r.to, r.from]));
      const nextTables: GeneratedTable[] = (base.generatedTables ?? []).map((t) => ({
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

      // Uncommitted cell edits live on `fmds.draft` and are shown as an overlay on the published
      // version. A synced draft is a real version row, which takes precedence in that overlay — so
      // without folding them in here the edits would still be stored but invisible, and publishing
      // the synced version would silently release without them.
      const { data: fmdRow, error: draftReadError } = await supabase
        .from('fmds').select('draft').eq('id', fmdId).single();
      if (draftReadError) throw draftReadError;
      const pending = ((fmdRow?.draft as FmdDraft | null)?.pendingChanges ?? []);

      /* `changeLog` is pulled out with the reviews, because a version's log belongs to THAT version.
         Spreading `base` carried it forward, so a sync that forked a new row off the published one
         opened its Draft tab showing every edit made to the version before it — twenty-seven
         already-published changes listed under "Already in this version", on a draft whose only
         actual change was the sync. It is the same trap draftOverlayVersion documents and clears on
         the overlay path; this fork had it too.

         Folding into an EXISTING unpublished row is the opposite case: that row's log is its own
         record of what has been done to it since it was forked, and dropping it would erase real
         history, so it is put back below. */
      const { mappingReview: _l, mappingReviews: _r, pendingChanges: _p, changeLog: baseChangeLog, ...carried } = base;
      const foldingIntoDraft = !!newest && !newest.published_at;
      const sheets = {
        ...carried,
        ...(foldingIntoDraft && baseChangeLog?.length ? { changeLog: baseChangeLog } : {}),
        generatedColumns: plan.nextColumns,
        generatedTables: pending.length ? applyPendingChanges(nextTables, pending) : nextTables,
      };
      const comment = `Synced to Golden FMD ${goldenVersionLabel}${bits ? ` — ${bits}` : ''}`;

      // ONE unpublished version per FMD. Syncing used to insert a row every time, so two syncs
      // without a publish in between left two unreleased versions stacked on the live one — and
      // only the newest of them could ever be published, so the other was unreachable work.
      // An unpublished version is a working copy: fold the sync into it, exactly as editing does.
      if (newest && !newest.published_at) {
        const { error } = await supabase
          .from('fmd_versions')
          .update({ sheets, comment, changed_by: who, changed_at: now })
          .eq('id', newest.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fmd_versions').insert({
          fmd_id: fmdId,
          version: bumpPatch(newest?.version ?? current.version),
          state: 'Draft',
          sheets,
          comment,
          created_by: who, created_at: now,
        });
        if (error) throw error;
      }

      // Point the FMD at the Golden version it now matches, so it stops reading as outdated.
      const { error: linkError } = await supabase
        .from('fmds').update({ based_on_golden_version_id: goldenVersionId }).eq('id', fmdId);
      if (linkError) throw linkError;

      // Folded in above, so the overlay must not replay them on top of the synced version.
      if (pending.length) {
        const { error: clearError } = await supabase.from('fmds').update({ draft: null }).eq('id', fmdId);
        if (clearError) throw clearError;
      }

      await invalidate();
    },
  };
}

const bumpPatch = (version: string): string => {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? `v${m[1]}.${m[2]}.${Number(m[3]) + 1}` : 'v1.0.1';
};

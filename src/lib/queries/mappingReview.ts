import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { invokeAiTask } from './aiEdgeFunction';
import { OPTIONAL_FIELDS } from '../mappingRulePolicy';
import type { FmdVersion, GeneratedColumn, GeneratedTable, MappingReview, MappingReviewFinding } from '../../types/entities';

const BATCH_SIZE = 10;

/** Every review on a version, oldest first, reading the current list key and folding in a review
 * saved under the pre-multi-review single key. Always use this instead of touching either key —
 * it's the one place the legacy shape is understood. */
export function readMappingReviews(sheets: FmdVersion['sheets'] | undefined): MappingReview[] {
  if (!sheets) return [];
  if (sheets.mappingReviews?.length) return sheets.mappingReviews;
  return sheets.mappingReview ? [sheets.mappingReview] : [];
}

/** AI audit of a Custom FMD's generated rows against the mapping rule policy
 * (src/lib/mappingRulePolicy.ts) — completeness (every field populated except SRC/TGT_CHECK_TABLE)
 * plus the per-MAPPING_TYPE format rules (COPY needs "1:1" + table-field, DEFAULT needs a literal
 * value assignment, XREF needs the xref name in both rule fields). Runs per structure, batched 10
 * rows at a time so one large FMD can't blow past a single call's output budget — the whole
 * judgment is AI (nothing here is a deterministic shortcut), batching is purely about not repeating
 * the "one giant call" reliability problem hit earlier with historical conversion. A batch that
 * fails is reported back as its own finding (so a review never just silently drops rows) rather
 * than throwing away the whole review. */
export function useMappingReview() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return {
    async review(_columns: GeneratedColumn[], tables: GeneratedTable[]): Promise<MappingReviewFinding[]> {
      const findings: MappingReviewFinding[] = [];

      for (const table of tables) {
        // Just the row index — structureIdent is sent once per request now, not repeated on every
        // row (every row in one batch is always from the same table; see aiEdgeFunction.ts).
        const rows = table.rows.map((row, i) => ({ id: String(i), fields: row }));
        for (let start = 0; start < rows.length; start += BATCH_SIZE) {
          const batch = rows.slice(start, start + BATCH_SIZE);
          try {
            const data = await invokeAiTask({ task: 'mapping-review', structureIdent: table.structureIdent, rows: batch, optionalFields: OPTIONAL_FIELDS });
            for (const f of (data?.findings ?? []) as { id: string; field?: string; severity: string; issue: string }[]) {
              const rowIndex = Number(f.id);
              const row = table.rows[rowIndex];
              if (!row) continue;
              findings.push({
                structureId: table.structureId, structureIdent: table.structureIdent, rowIndex,
                field: f.field && f.field in row ? f.field : undefined,
                srcField: row.SRC_FIELD || undefined, tgtField: row.TGT_FIELD || undefined,
                severity: f.severity === 'error' ? 'error' : 'warning', issue: f.issue,
              });
            }
          } catch (err) {
            findings.push({
              structureId: table.structureId, structureIdent: table.structureIdent, rowIndex: start,
              severity: 'error',
              issue: `Review failed for rows ${start + 1}–${start + batch.length} of this structure: ${err instanceof Error ? err.message : 'unknown error'}. Re-run Review Mapping to retry.`,
            });
          }
        }
      }

      return findings;
    },

    /** Appends the review to the version it was run against — an assessment of existing content,
     * not new mapping content, so it's a plain update to the same version row rather than a new
     * version bump. Appends rather than overwrites: a version gets reviewed repeatedly (after
     * fixes, or by a second reviewer) and comparing runs is the point of keeping them. */
    async save(versionId: string, currentSheets: FmdVersion['sheets'], findings: MappingReviewFinding[]): Promise<void> {
      const review: MappingReview = {
        id: crypto.randomUUID(),
        reviewedBy: user?.email ?? 'Unknown', reviewedAt: new Date().toISOString(), findings,
      };
      const sheets = { ...currentSheets, mappingReviews: [...readMappingReviews(currentSheets), review] };
      // The legacy single-review key is folded into the list by readMappingReviews above, so drop
      // it rather than leaving a stale duplicate of the first review behind.
      delete (sheets as { mappingReview?: unknown }).mappingReview;
      const { error } = await supabase.from('fmd_versions').update({ sheets }).eq('id', versionId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['fmd-versions'] });
    },
  };
}

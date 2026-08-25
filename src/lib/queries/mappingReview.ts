import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { invokeAiTask } from './aiEdgeFunction';
import { OPTIONAL_FIELDS } from '../mappingRulePolicy';
import type { FmdVersion, GeneratedColumn, GeneratedTable, MappingReview, MappingReviewFinding } from '../../types/entities';

const BATCH_SIZE = 10;

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

    /** Saves the review onto the version it was run against — an assessment of existing content,
     * not new mapping content, so it's a plain update to the same version row rather than a new
     * version bump. */
    async save(versionId: string, currentSheets: FmdVersion['sheets'], findings: MappingReviewFinding[]): Promise<void> {
      const mappingReview: MappingReview = { reviewedBy: user?.email ?? 'Unknown', reviewedAt: new Date().toISOString(), findings };
      const { error } = await supabase.from('fmd_versions').update({ sheets: { ...currentSheets, mappingReview } }).eq('id', versionId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['fmd-versions'] });
    },
  };
}

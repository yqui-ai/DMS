import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { invokeAiTask } from './aiEdgeFunction';
import { alwaysBlankFields, auditRow, criticalFieldsOf, isOutOfScope, OPTIONAL_FIELDS, type PolicyFinding } from '../mappingRulePolicy';
import type { FmdVersion, GeneratedColumn, GeneratedTable, MappingReview, MappingReviewFinding } from '../../types/entities';

const BATCH_SIZE = 10;

/** Identity of one finding within a review.
 *
 * Findings written before `id` existed fall back to their coordinates plus their position, which is
 * stable for as long as the review isn't re-run — and re-running replaces the whole list anyway. */
export const findingKey = (f: MappingReviewFinding, index: number) =>
  f.id ?? `${f.structureId}:${f.rowIndex}:${f.field ?? ''}:${index}`;

/** Every review on a version, oldest first, reading the current list key and folding in a review
 * saved under the pre-multi-review single key. Always use this instead of touching either key —
 * it's the one place the legacy shape is understood. */
export function readMappingReviews(sheets: FmdVersion['sheets'] | undefined): MappingReview[] {
  if (!sheets) return [];
  if (sheets.mappingReviews?.length) return sheets.mappingReviews;
  return sheets.mappingReview ? [sheets.mappingReview] : [];
}

/** Audit of a Custom FMD's rows against the mapping rule policy (src/lib/mappingRulePolicy.ts),
 * in two passes with a hard line between them.
 *
 * **Deterministic first.** Blank required fields, MAPPING_TYPE enum membership, prose sitting in
 * TECHNICAL_RULE, a rule that points at a document instead of stating itself, a CASE with no ELSE —
 * all decidable in JS, all now decided there. They used to be part of the prompt, and a decidable
 * question handed to a model gets a probabilistic answer: across ten-row batches it returned some
 * and quietly skipped others, which is why the review "didn't catch everything". This is the same
 * lesson the historical converter already learned for column classification and rename detection.
 *
 * **Then judgement.** The model sees only rows that pass the mechanical checks, and is asked the
 * one question JS cannot answer: does this SQL actually implement the requirement written beside
 * it. It may report MORE THAN ONE finding per row — the old prompt capped it at one, so a row with
 * three defects showed one and looked half-clean.
 *
 * A field blank in every row of a structure is reported once against the structure instead of once
 * per row; thirty-three copies of the same fact bury everything else in the list.
 *
 * Batched 10 rows at a time so one large FMD can't blow past a single call's output budget. A batch
 * that fails is reported as its own finding rather than throwing away the whole review. */
export function useMappingReview() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return {
    async review(columns: GeneratedColumn[], tables: GeneratedTable[]): Promise<MappingReviewFinding[]> {
      const findings: MappingReviewFinding[] = [];
      // Which columns the Golden template marks critical. This is what makes the review focused:
      // everything used to grade the same, so a missing MIGRATION_IN_SCOPE was one of sixty-eight
      // identical errors instead of the thing to fix first.
      const criticalFields = criticalFieldsOf(columns);

      for (const table of tables) {
        const at = (rowIndex: number, f: PolicyFinding, row?: Record<string, string>): MappingReviewFinding => ({
          id: crypto.randomUUID(),
          structureId: table.structureId, structureIdent: table.structureIdent, rowIndex,
          field: f.field, severity: f.severity, issue: f.issue,
          srcField: row?.SRC_FIELD || undefined, tgtField: row?.TGT_FIELD || undefined,
        });

        // A column nobody filled in is one decision, not one defect per row. rowIndex -1 marks it
        // as belonging to the structure: every consumer resolves findings through
        // `table.rows[rowIndex]`, so a negative index is skipped rather than painting row 0's cell.
        // A field explicitly marked out of scope needs no rule, no target and no data type, so
        // auditing it only manufactures findings nobody will act on. Only an EXPLICIT "no" is
        // skipped: a blank MIGRATION_IN_SCOPE means nobody has decided yet, and an undecided field
        // still has to be checked — otherwise an unfinished FMD passes by omission.
        const inScopeRows = table.rows.filter((r) => !isOutOfScope(r));

        const blanks = alwaysBlankFields(inScopeRows);
        for (const field of blanks) {
          const critical = criticalFields.includes(field);
          findings.push(at(-1, {
            field, severity: critical ? 'error' : 'warning',
            issue: `${field} is blank in all ${inScopeRows.length} in-scope row${inScopeRows.length === 1 ? '' : 's'} of this structure${critical ? ' — the Golden template marks it critical' : ''}.`,
          }));
        }

        // Rows that already fail a mechanical check are not sent for judgement: the model would
        // spend its budget restating what is already reported, and "this rule is vague" adds
        // nothing to "this rule is blank".
        const skipFields = [...OPTIONAL_FIELDS, ...blanks];
        const rows: { id: string; fields: Record<string, string> }[] = [];
        table.rows.forEach((row, i) => {
          if (isOutOfScope(row)) return;
          const policyFindings = auditRow(row, skipFields, criticalFields, columns);
          for (const f of policyFindings) findings.push(at(i, f, row));
          if (!policyFindings.some((f) => f.severity === 'error')) rows.push({ id: String(i), fields: row });
        });

        for (let start = 0; start < rows.length; start += BATCH_SIZE) {
          const batch = rows.slice(start, start + BATCH_SIZE);
          try {
            const data = await invokeAiTask({ task: 'mapping-review', structureIdent: table.structureIdent, rows: batch, optionalFields: skipFields, criticalFields });
            for (const f of (data?.findings ?? []) as { id: string; field?: string; severity: string; issue: string }[]) {
              const rowIndex = Number(f.id);
              const row = table.rows[rowIndex];
              if (!row) continue;
              findings.push({
                id: crypto.randomUUID(),
                structureId: table.structureId, structureIdent: table.structureIdent, rowIndex,
                field: f.field && f.field in row ? f.field : undefined,
                srcField: row.SRC_FIELD || undefined, tgtField: row.TGT_FIELD || undefined,
                severity: f.severity === 'error' ? 'error' : 'warning', issue: f.issue,
              });
            }
          } catch (err) {
            findings.push({
              id: crypto.randomUUID(),
              structureId: table.structureId, structureIdent: table.structureIdent, rowIndex: start,
              severity: 'error',
              issue: `Review failed for rows ${start + 1}–${start + batch.length} of this structure: ${err instanceof Error ? err.message : 'unknown error'}. Re-run Review Mapping to retry.`,
            });
          }
        }
      }

      return findings;
    },

    /** Marks one finding as addressed, or clears the mark.
     *
     * Writes into `sheets.mappingReviews` on the version the review was run against — which is
     * usually a PUBLISHED version, and legal because the freeze trigger compares `sheets` with the
     * review keys stripped (migrations 0029/0030). A review, and a note about acting on one, is an
     * assessment of content rather than a change to it. Anything else added under `sheets` that
     * isn't mapping content has to be stripped there too. */
    async setAddressed(versionId: string, currentSheets: FmdVersion['sheets'], reviewId: string | undefined, key: string, addressed: boolean): Promise<void> {
      const stamp = addressed ? { by: user?.email ?? 'Unknown', at: new Date().toISOString() } : undefined;
      const reviews = readMappingReviews(currentSheets).map((r) => {
        if ((r.id ?? '') !== (reviewId ?? '')) return r;
        return { ...r, findings: r.findings.map((f, i) => (findingKey(f, i) === key ? { ...f, addressed: stamp } : f)) };
      });
      const sheets = { ...currentSheets, mappingReviews: reviews };
      delete (sheets as { mappingReview?: unknown }).mappingReview;
      const { error } = await supabase.from('fmd_versions').update({ sheets }).eq('id', versionId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['fmd-versions'] });
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

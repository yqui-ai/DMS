import { invokeAiTask } from './aiEdgeFunction';
import { looksLikeSql } from '../mappingRulePolicy';
import type { GeneratedTable } from '../../types/entities';

export type TechnicalRuleResult =
  | { ok: true; sql: string; notes?: string }
  /** The requirement wasn't implementable as written. This is a legitimate answer, not an error —
   * it's the outcome that makes the feature worth having. */
  | { ok: false; reason: string };

/** Drafts the SQL technical rule for one row from its plain-language transformation rule.
 *
 * Two things are deliberate here. First, refusal is a normal result: a vague requirement should
 * come back to a person rather than become confident-looking SQL a developer implements without
 * questioning. Second, the response is VALIDATED before being offered — a rule that came back
 * without any SQL keywords is treated as a refusal, because the failure this feature must never
 * produce is plausible prose sitting in a field that is supposed to hold a statement. */
export function useGenerateTechnicalRule() {
  return {
    async generate(row: Record<string, string>, table: GeneratedTable): Promise<TechnicalRuleResult> {
      const transformationRule = (row.TRANSFORMATION_RULE ?? '').trim();
      if (!transformationRule) {
        return { ok: false, reason: 'There is no transformation rule to work from — describe what this field should do first.' };
      }

      // Sibling columns let a rule reference another field on the same row ("when the country
      // is DE"). Only real column names are sent, so the model can't be blamed for inventing one.
      const siblingFields = Object.keys(table.rows[0] ?? row)
        .filter((f) => f.startsWith('SRC_') && f !== 'SRC_FIELD' && (row[f] ?? '').trim() !== '');

      const data = await invokeAiTask({
        task: 'technical-rule',
        context: {
          mappingType: row.MAPPING_TYPE ?? '',
          transformationRule,
          srcTable: row.SRC_TABLE, srcField: row.SRC_FIELD,
          srcDataType: row.SRC_FIELD_DATATYPE, srcLength: row.SRC_FIELD_LENGTH,
          tgtTable: row.TGT_TABLE, tgtField: row.TGT_FIELD,
          tgtDataType: row.TGT_FIELD_DATATYPE, tgtLength: row.TGT_FIELD_LENGTH,
          siblingFields,
        },
      });

      if (data?.ok === false || !data?.sql) {
        return { ok: false, reason: typeof data?.reason === 'string' && data.reason.trim()
          ? data.reason
          : 'The requirement is too vague to turn into SQL. Say which values map to which, and what should happen when nothing matches.' };
      }

      const sql = String(data.sql).trim();
      if (!looksLikeSql(sql)) {
        return { ok: false, reason: 'The generated rule did not come back as SQL, so it was discarded rather than offered.' };
      }
      return { ok: true, sql, notes: typeof data.notes === 'string' && data.notes.trim() ? data.notes.trim() : undefined };
    },
  };
}

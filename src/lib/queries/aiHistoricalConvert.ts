import { invokeAiTask } from './aiEdgeFunction';
import { classifyHeaders, buildRowsFromClassification, goldenColumns, toGeneratedTable } from '../histClassify';
import type { GeneratedColumn, GeneratedTable, GoldenFmdStructure, HistoricalRaw } from '../../types/entities';

const BATCH_SIZE = 20;

/** Converts one plant's (or the single-FMD fallback's) selected sheets into Golden-schema tables.
 * Column mapping and row values are built deterministically (src/lib/histClassify.ts) — AI is only
 * asked to write transformation-rule text for rows that don't already have one in the source file,
 * batched 20 at a time. A batch that fails (bad JSON, timeout, rate limit, …) just falls back to
 * "Copy 1:1" for those rows instead of losing the whole plant's conversion. This is now the ONLY AI
 * task in the wizard: rename detection (src/lib/fileNameMatch.ts) and the version-to-version change
 * summary (src/lib/rowDiff.ts) both moved to plain deterministic JS after their AI-based versions
 * proved unreliable in practice — an LLM call is exactly the kind of thing that can silently fail
 * (timeout, malformed JSON, rate limit) with no good fallback for "it just didn't work". */
export function useConvertHistoricalFmd() {
  return {
    async convert({ historicalRaw, goldenStructure }: { historicalRaw: HistoricalRaw; goldenStructure: GoldenFmdStructure }): Promise<{ columns: GeneratedColumn[]; tables: GeneratedTable[] }> {
      const tables: GeneratedTable[] = [];

      for (const [sheetIndex, sheet] of historicalRaw.sheets.entries()) {
        const roles = classifyHeaders(sheet.headers);
        const classified = buildRowsFromClassification(sheet, roles);

        const needsRuleIndexes = classified.reduce<number[]>((acc, row, i) => (row.needsRule ? [...acc, i] : acc), []);
        for (let start = 0; start < needsRuleIndexes.length; start += BATCH_SIZE) {
          const batch = needsRuleIndexes.slice(start, start + BATCH_SIZE);
          const rows = batch.map((i) => ({
            id: String(i),
            srcField: classified[i].fields.SRC_FIELD, srcFieldDesc: classified[i].fields.SRC_FIELD_DESC,
            tgtField: classified[i].fields.TGT_FIELD, tgtFieldDesc: classified[i].fields.TGT_FIELD_DESC,
            mappingType: classified[i].fields.MAPPING_TYPE,
          }));
          try {
            const data = await invokeAiTask({ task: 'rules', rows });
            for (const rule of (data?.rules ?? []) as { id: string; transformationRule: string }[]) {
              const idx = Number(rule.id);
              if (classified[idx]) classified[idx].fields.TRANSFORMATION_RULE = rule.transformationRule?.trim() || 'Copy 1:1';
            }
            // Any id the model dropped from its response still needs a fallback.
            for (const i of batch) if (!classified[i].fields.TRANSFORMATION_RULE) classified[i].fields.TRANSFORMATION_RULE = 'Copy 1:1';
          } catch {
            for (const i of batch) classified[i].fields.TRANSFORMATION_RULE = 'Copy 1:1';
          }
        }

        tables.push(toGeneratedTable(`hist-${sheetIndex}-${sheet.name}`, sheet.name, undefined, classified));
      }

      return { columns: goldenColumns(goldenStructure), tables };
    },
  };
}

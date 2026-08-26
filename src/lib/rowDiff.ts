import type { GeneratedTable } from '../types/entities';

/** Fields (in priority order) used to identify "the same field mapping" across two versions of a
 * table — content-based, not positional, so re-sorted or re-ordered rows still match correctly. */
export const IDENTITY_FIELDS = ['SRC_SYSTEM', 'SRC_TABLE', 'SRC_FIELD', 'TGT_TABLE', 'TGT_FIELD'];

/** A stable identity for a row: the identifying source/target fields joined together, or "#<index>"
 * as a last resort when a row has none of those fields populated (rare — only genuinely
 * unidentifiable rows fall back to position, so a re-sort can't misalign them). */
export function rowKey(row: Record<string, string>, index: number): string {
  const parts = IDENTITY_FIELDS.map((f) => row[f]?.trim()).filter(Boolean);
  return parts.length ? parts.join('|') : `#${index}`;
}

export interface RowDiffResult {
  /** rowKey -> set of field names whose value differs between old and new. */
  changedByRowKey: Map<string, Set<string>>;
  addedRowKeys: Set<string>;
  removedRowKeys: Set<string>;
  /** Human-readable "- <field>: <what changed> (was: X, now: Y)" lines, one per change. */
  summaryLines: string[];
}

/** Deterministic, pure-JS row-level diff — no AI involved, so it can never fail to produce a
 * result the way an LLM call can. Matches rows by content identity (rowKey), then reports every
 * changed cell, added row, and removed row. Powers both the wizard's re-upload change summary and
 * the yellow changed-cell highlight in the FMD viewer. */
export function diffRows(oldRows: Record<string, string>[], newRows: Record<string, string>[]): RowDiffResult {
  const oldByKey = new Map(oldRows.map((r, i) => [rowKey(r, i), r]));
  const newByKey = new Map(newRows.map((r, i) => [rowKey(r, i), r]));
  const changedByRowKey = new Map<string, Set<string>>();
  const addedRowKeys = new Set<string>();
  const removedRowKeys = new Set<string>();
  const summaryLines: string[] = [];

  for (const [key, newRow] of newByKey) {
    const oldRow = oldByKey.get(key);
    const label = newRow.SRC_FIELD || newRow.TGT_FIELD || key;
    if (!oldRow) {
      addedRowKeys.add(key);
      summaryLines.push(`- ${label}: new field mapping added`);
      continue;
    }
    const fields = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
    const changed = new Set<string>();
    for (const field of fields) {
      const ov = (oldRow[field] ?? '').trim();
      const nv = (newRow[field] ?? '').trim();
      if (ov !== nv) changed.add(field);
    }
    if (changed.size > 0) {
      changedByRowKey.set(key, changed);
      for (const field of changed) {
        const ov = oldRow[field]?.trim() || '—';
        const nv = newRow[field]?.trim() || '—';
        summaryLines.push(`- ${label}: ${field} changed (was: "${ov}", now: "${nv}")`);
      }
    }
  }
  for (const [key, oldRow] of oldByKey) {
    if (!newByKey.has(key)) {
      removedRowKeys.add(key);
      const label = oldRow.SRC_FIELD || oldRow.TGT_FIELD || key;
      summaryLines.push(`- ${label}: field mapping removed`);
    }
  }
  return { changedByRowKey, addedRowKeys, removedRowKeys, summaryLines };
}

/** Editable version-comment text for a re-upload — lists every changed/added/removed field mapping,
 * with an explicit rename note first when the source filename changed. Entirely deterministic, so
 * unlike an AI-written summary it can never come back empty or fail. */
export function buildDiffSummary(
  oldRows: Record<string, string>[], newRows: Record<string, string>[],
  oldSourceName?: string, newSourceName?: string,
): string {
  const lines: string[] = [];
  if (oldSourceName && newSourceName && oldSourceName !== newSourceName) {
    lines.push(`Source file renamed from "${oldSourceName}" to "${newSourceName}".`);
  }
  const { summaryLines } = diffRows(oldRows, newRows);
  lines.push(...(summaryLines.length ? summaryLines : ['No field-level changes detected.']));
  return lines.join('\n');
}

/** A one-or-two-line "what moved" summary across every structure, for the automatic comparison
 * recorded whenever a new version is created. Deliberately counts rather than lists: the full
 * line-by-line diff already exists as the version comment and as the yellow changed-cell highlight
 * in the viewer, so repeating it here would just be a third copy. Entirely deterministic — no AI,
 * so it can never fail or come back empty. Returns null when there's nothing to compare against
 * (a first version), which is different from "nothing changed". */
export function summariseVersionChange(
  previousTables: GeneratedTable[] | undefined, currentTables: GeneratedTable[] | undefined,
): string | null {
  if (!previousTables?.length || !currentTables?.length) return null;
  let changedRows = 0; let changedCells = 0; let added = 0; let removed = 0;
  const touched: string[] = [];
  const newStructures: string[] = [];

  for (const table of currentTables) {
    const prev = previousTables.find((t) => t.structureId === table.structureId);
    if (!prev) { newStructures.push(table.structureIdent); continue; }
    const { changedByRowKey, addedRowKeys, removedRowKeys } = diffRows(prev.rows, table.rows);
    const cells = [...changedByRowKey.values()].reduce((n, s) => n + s.size, 0);
    if (changedByRowKey.size || addedRowKeys.size || removedRowKeys.size) touched.push(table.structureIdent);
    changedRows += changedByRowKey.size; changedCells += cells;
    added += addedRowKeys.size; removed += removedRowKeys.size;
  }
  const droppedStructures = previousTables
    .filter((p) => !currentTables.some((c) => c.structureId === p.structureId))
    .map((p) => p.structureIdent);

  const parts: string[] = [];
  if (changedRows > 0) parts.push(`${changedRows} field${changedRows === 1 ? '' : 's'} changed (${changedCells} value${changedCells === 1 ? '' : 's'})`);
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (newStructures.length) parts.push(`new structure${newStructures.length === 1 ? '' : 's'}: ${newStructures.join(', ')}`);
  if (droppedStructures.length) parts.push(`structure${droppedStructures.length === 1 ? '' : 's'} no longer present: ${droppedStructures.join(', ')}`);

  if (parts.length === 0) return 'No field-level changes from the previous version.';
  const where = touched.length ? ` Affected: ${touched.join(', ')}.` : '';
  return `${parts.join(', ')}.${where}`;
}

/** changedByRowKey per table (keyed by structureId) between two versions' generatedTables — the
 * FMD viewer diffs the selected version against the one immediately before it and highlights every
 * changed cell. Undefined tables (a structure that didn't exist in the previous version) are simply
 * skipped, not treated as "everything changed". */
export function diffTablesByStructure(
  previousTables: GeneratedTable[] | undefined, currentTables: GeneratedTable[] | undefined,
): Map<string, Map<string, Set<string>>> | undefined {
  if (!previousTables?.length || !currentTables?.length) return undefined;
  const result = new Map<string, Map<string, Set<string>>>();
  for (const table of currentTables) {
    const prevTable = previousTables.find((t) => t.structureId === table.structureId);
    if (!prevTable) continue;
    const { changedByRowKey } = diffRows(prevTable.rows, table.rows);
    if (changedByRowKey.size > 0) result.set(table.structureId, changedByRowKey);
  }
  return result.size > 0 ? result : undefined;
}

import type { HistoricalRaw, HistoricalSheet } from '../types/entities';

/** Sheet names that look like they hold the actual field-mapping content, vs "other" reference
 * sheets (cover pages, change logs, glossaries, …) — used to pre-check the likely-relevant sheets
 * in the wizard's sheet-selection step, not to hide the rest. */
export const SUGGESTED_SHEET_PATTERN = /mapping|data\s*model/i;

/** Real SAP field-mapping documents are row-per-FIELD, not row-per-record — Plant doesn't show up
 * as a value column, it shows up as a repeating pair of trailing columns per plant:
 * "<code(s)> - <plant name>\nMapping Rule" / "…\nComments". A header can name several plants at
 * once ("9820 & 928A - Anderson") sharing one rule — that becomes one FMD per code, all reading
 * the same source columns. Column position pairs the two (not text matching) since real files can
 * have a typo'd code between the Mapping Rule and Comments header of the same group. */
const MAPPING_RULE_HEADER = /mapping\s*rule\s*$/i;
const COMMENTS_HEADER = /comments?\s*$/i;
const CODE_TOKEN = /^[A-Z0-9]{3,8}$/;

interface PlantColumnGroup { code: string; ruleColIndex: number; commentColIndex: number | null }

function parsePlantColumnGroups(headers: string[]): PlantColumnGroup[] {
  const groups: PlantColumnGroup[] = [];
  headers.forEach((header, i) => {
    if (!MAPPING_RULE_HEADER.test(header)) return;
    const label = header.split('\n')[0]?.trim() ?? '';
    const codesPart = label.includes(' - ') ? label.slice(0, label.indexOf(' - ')) : label;
    const codes = codesPart.split(/[&,/]/).map((c) => c.trim().toUpperCase()).filter((c) => CODE_TOKEN.test(c));
    if (codes.length === 0) return;
    const commentColIndex = COMMENTS_HEADER.test(headers[i + 1] ?? '') ? i + 1 : null;
    for (const code of codes) groups.push({ code, ruleColIndex: i, commentColIndex });
  });
  return groups;
}

/** Fallback for a plainer, row-per-record legacy file that genuinely has a single Plant/Werk value
 * column instead of the per-plant column-pair pattern above. */
const PLANT_VALUE_HEADER = /\bplants?\b|\bwerks?\b|\bplant\s*code\b|\bsite\b/i;

function detectPlantValueColumn(sheet: HistoricalSheet): number | null {
  const idx = sheet.headers.findIndex((h) => PLANT_VALUE_HEADER.test(h));
  return idx === -1 ? null : idx;
}

/** Distinct plant codes found across the selected sheets — via column-pair groups first (the real
 * pattern), falling back to a value-column scan. Empty if neither pattern is present anywhere in
 * the selection, in which case the caller creates a single, unsplit FMD instead. */
export function extractPlants(raw: HistoricalRaw, selectedSheetNames: Set<string>): string[] {
  const codes = new Set<string>();
  for (const sheet of raw.sheets) {
    if (!selectedSheetNames.has(sheet.name)) continue;
    const groups = parsePlantColumnGroups(sheet.headers);
    if (groups.length > 0) { groups.forEach((g) => codes.add(g.code)); continue; }
    const colIdx = detectPlantValueColumn(sheet);
    if (colIdx === null) continue;
    for (const row of sheet.rows) {
      const value = row[colIdx]?.trim();
      if (value) codes.add(value.toUpperCase());
    }
  }
  return [...codes].sort();
}

function buildSheetForPlant(sheet: HistoricalSheet, plantCode: string): HistoricalSheet | null {
  const groups = parsePlantColumnGroups(sheet.headers);

  if (groups.length > 0) {
    const myGroup = groups.find((g) => g.code === plantCode);
    if (!myGroup) return null; // this sheet's plants don't include the one we're building for

    const plantColIndexes = new Set(groups.flatMap((g) => (g.commentColIndex !== null ? [g.ruleColIndex, g.commentColIndex] : [g.ruleColIndex])));
    const keepIndexes: number[] = [];
    const headers: string[] = [];
    sheet.headers.forEach((h, i) => {
      if (plantColIndexes.has(i)) return;
      keepIndexes.push(i);
      headers.push(h);
    });
    keepIndexes.push(myGroup.ruleColIndex);
    headers.push('Mapping Rule');
    if (myGroup.commentColIndex !== null) {
      keepIndexes.push(myGroup.commentColIndex);
      headers.push('Comments');
    }
    return { name: sheet.name, headers, rows: sheet.rows.map((row) => keepIndexes.map((i) => row[i] ?? '')) };
  }

  const valueColIdx = detectPlantValueColumn(sheet);
  if (valueColIdx === null) return sheet; // plant-agnostic reference sheet — included in full for every plant
  return { ...sheet, rows: sheet.rows.filter((row) => row[valueColIdx]?.trim().toUpperCase() === plantCode) };
}

/** Builds the raw data slice for one plant (or the full selection when `plantCode` is null, the
 * no-plant-detected fallback). */
export function sliceForPlant(raw: HistoricalRaw, selectedSheetNames: Set<string>, plantCode: string | null): HistoricalRaw {
  const sheets: HistoricalSheet[] = [];
  for (const sheet of raw.sheets) {
    if (!selectedSheetNames.has(sheet.name)) continue;
    if (plantCode === null) { sheets.push(sheet); continue; }
    const sliced = buildSheetForPlant(sheet, plantCode);
    if (sliced) sheets.push(sliced);
  }
  return { sheets };
}

import type { HistoricalRaw, HistoricalSheet } from '../types/entities';

/** Sheet names that look like they hold the actual field-mapping content, vs "other" reference
 * sheets (cover pages, change logs, glossaries, …) — used to pre-check the likely-relevant sheets
 * in the wizard's sheet-selection step, not to hide the rest. */
export const SUGGESTED_SHEET_PATTERN = /mapping|data\s*model/i;

/** Real SAP field-mapping documents are row-per-FIELD, not row-per-record — Plant doesn't show up
 * as a value column, it shows up as a repeating pair of trailing columns per plant. Real files have
 * been seen using EITHER (sometimes both, in the same workbook) of two header conventions:
 *  - "<code(s)> - <plant name>\nMapping Rule" / "…\nComments" (newer style)
 *  - "Mapping Rule Details <code(s)>" / "Additional comments <code(s)> (optional)" (older style —
 *    a BARE "Mapping Rule Details" with nothing after it is the general/default rule column, not
 *    plant-specific, and is deliberately left with no codes so it's excluded, not misread as a
 *    10th "plant" of its own)
 * A header can name several plants at once ("9820 & 928A - Anderson", or "RBTA/RBTY") sharing one
 * rule — that becomes one FMD per code, all reading the same source columns. Column position pairs
 * the rule column with its comment column (not text matching) since real files can have a typo'd
 * code between the two headers of one group, or (older style) not repeat the code on the comment
 * header's wording at all. */
const MAPPING_RULE_HEADER = /mapping\s*rule\s*$/i;
const MAPPING_RULE_DETAILS_HEADER = /^mapping\s*rule\s*details\b\s*(.*)$/i;
const COMMENTS_HEADER = /comments?/i;
const CODE_TOKEN = /^[A-Z0-9]{3,8}$/;

interface PlantColumnGroup { code: string; ruleColIndex: number; commentColIndex: number | null }

function parsePlantColumnGroups(headers: string[]): PlantColumnGroup[] {
  const groups: PlantColumnGroup[] = [];
  headers.forEach((header, i) => {
    // Newlines normalized to spaces so a header wrapped across lines and one written on a single
    // line both parse the same way.
    const flat = header.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    let codesPart: string | null = null;
    if (MAPPING_RULE_HEADER.test(flat)) {
      codesPart = flat.includes(' - ') ? flat.slice(0, flat.indexOf(' - ')) : flat;
    } else {
      const detailsMatch = MAPPING_RULE_DETAILS_HEADER.exec(flat);
      if (detailsMatch) codesPart = detailsMatch[1];
    }
    if (codesPart === null) return;

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

/** Distinct plant codes found across the selected sheets — via column-pair groups (the real
 * pattern for an actual field-mapping sheet), falling back to a value-column scan only when NO
 * column-pair groups exist ANYWHERE in the selection.
 *
 * The two detection modes are NEVER unioned across sheets: a workbook's main field-mapping sheet
 * legitimately defines plants via column pairs, but another selected sheet (e.g. an "object
 * exceptions" or "single object mapping" sheet, which is shaped completely differently — row-per-
 * override, not row-per-field) can independently have its own "Plant"-labeled value column for its
 * own unrelated purpose. Treating THAT column's values as additional plants for the whole document
 * used to fabricate extra "plants" that don't exist in the real field-mapping data at all — every
 * field for such a plant came out blank because the exceptions sheet's columns don't classify into
 * any Golden field, but a full (bogus) FMD still got created for it. Column-pair detection, when it
 * fires anywhere in the selection, is authoritative; the value-column fallback is reserved for the
 * genuinely-plain-value-column legacy file format where NO sheet in the selection uses column pairs. */
export function extractPlants(raw: HistoricalRaw, selectedSheetNames: Set<string>): string[] {
  const selectedSheets = raw.sheets.filter((s) => selectedSheetNames.has(s.name));

  const columnPairCodes = new Set<string>();
  for (const sheet of selectedSheets) {
    for (const g of parsePlantColumnGroups(sheet.headers)) columnPairCodes.add(g.code);
  }
  if (columnPairCodes.size > 0) return [...columnPairCodes].sort();

  const valueCodes = new Set<string>();
  for (const sheet of selectedSheets) {
    const colIdx = detectPlantValueColumn(sheet);
    if (colIdx === null) continue;
    for (const row of sheet.rows) {
      const value = row[colIdx]?.trim();
      if (value) valueCodes.add(value.toUpperCase());
    }
  }
  return [...valueCodes].sort();
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

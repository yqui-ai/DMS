import type { MigrationObject } from '../types/entities';

/** One row of the customer's own migration object list. */
export interface ScopeImportRow {
  sourceIdent: string;
  sourceName?: string;
  sourceDescription?: string;
  inScope: boolean;
  custom: boolean;
  /** Their own guess at the SAP object, if the template was filled in that far. Matched to the
   * catalogue on import so step 2 starts from something rather than nothing. */
  suggestedSapIdent?: string;
}

export interface ScopeImportResult {
  rows: ScopeImportRow[];
  /** Rows the file contained that could not be read, with the reason. Reported rather than dropped:
   * silently importing 40 of 47 rows is how a scope ends up quietly incomplete. */
  skipped: { row: number; reason: string }[];
}

/** Header → our field. Matched case-insensitively with spaces and underscores collapsed, so a
 * template someone has re-typed or translated the casing of still imports. */
const COLUMNS: Record<string, keyof ScopeImportRow> = {
  objectid: 'sourceIdent',
  objectname: 'sourceName',
  description: 'sourceDescription',
  inscope: 'inScope',
  custom: 'custom',
  sapobject: 'suggestedSapIdent',
};

const normaliseHeader = (h: string) => h.toLowerCase().replace(/[\s_-]/g, '');

/** Anything a person might reasonably type for "yes". Blank counts as in scope: the list is what
 * they intend to migrate, so the burden is on marking exclusions rather than confirming every row. */
const isTruthy = (v: unknown): boolean => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return true;
  return ['x', 'y', 'yes', 'true', '1', 'in scope', 'inscope'].includes(s);
};

const isExplicitlyTrue = (v: unknown): boolean => {
  const s = String(v ?? '').trim().toLowerCase();
  return ['x', 'y', 'yes', 'true', '1'].includes(s);
};

/** The downloadable template: a header row, two example rows, and a reference sheet listing every
 * standard SAP object so the SAP_OBJECT column can be filled in without leaving the file. */
export async function buildScopeTemplate(objects: MigrationObject[]): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet('Migration Objects');
  sheet.columns = [
    { header: 'OBJECT_ID', key: 'id', width: 24 },
    { header: 'OBJECT_NAME', key: 'name', width: 38 },
    { header: 'DESCRIPTION', key: 'desc', width: 46 },
    { header: 'IN_SCOPE', key: 'scope', width: 12 },
    { header: 'CUSTOM', key: 'custom', width: 12 },
    { header: 'SAP_OBJECT', key: 'sap', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F9' } };
  sheet.getRow(1).border = { bottom: { style: 'thin', color: { argb: 'FFD6DBE2' } } };

  // Examples, not data. Marked as such in the ID so nobody imports them by accident.
  sheet.addRow({
    id: 'EXAMPLE-1', name: 'Material Master (EU)', desc: 'Materials for the European plants',
    scope: 'X', custom: '', sap: 'SIF_MATERIAL',
  });
  sheet.addRow({
    id: 'EXAMPLE-2', name: 'Legacy pricing table', desc: 'Bespoke, no SAP equivalent',
    scope: 'X', custom: 'X', sap: '',
  });
  sheet.getRow(2).font = { italic: true, color: { argb: 'FF69707C' } };
  sheet.getRow(3).font = { italic: true, color: { argb: 'FF69707C' } };

  const notes = [
    'Fill one row per object you intend to migrate. Delete the EXAMPLE rows before uploading.',
    'OBJECT_ID and OBJECT_NAME are your own names for it — they do not have to match SAP.',
    'IN_SCOPE: X to include. Leave blank and it is still treated as in scope; put NO to exclude.',
    'CUSTOM: X if this has no SAP standard equivalent. Those are parked for now, not mapped.',
    'SAP_OBJECT: optional. If you know the SAP ident, put it here and the mapping step starts filled in.',
    'The "SAP Standard Objects" sheet lists every valid SAP_OBJECT value.',
  ];
  notes.forEach((n, i) => {
    const row = sheet.getRow(6 + i);
    row.getCell(1).value = i === 0 ? 'HOW TO USE' : '';
    row.getCell(2).value = n;
    row.getCell(1).font = { bold: true };
    row.getCell(2).font = { color: { argb: 'FF69707C' } };
  });

  // The reference sheet. Without it, SAP_OBJECT is a field you can only fill by guessing.
  const ref = workbook.addWorksheet('SAP Standard Objects');
  ref.columns = [
    { header: 'SAP_OBJECT', key: 'ident', width: 26 },
    { header: 'DESCRIPTION', key: 'desc', width: 52 },
    { header: 'CATEGORY', key: 'cat', width: 22 },
    { header: 'COMPONENT', key: 'comp', width: 18 },
  ];
  ref.getRow(1).font = { bold: true };
  ref.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F9' } };
  for (const o of [...objects].sort((a, b) => a.objectId.localeCompare(b.objectId))) {
    ref.addRow({ ident: o.objectId, desc: o.description ?? '', cat: o.category ?? '', comp: o.component ?? '' });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function downloadScopeTemplate(blob: Blob, subprojectName?: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Migration_Object_List${subprojectName ? `_${subprojectName.replace(/[^\w-]+/g, '_')}` : ''}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Reads an uploaded list back. Tolerant about column order and header casing, strict about the one
 * thing that has to be there — an identifier. A row without one cannot be referred to, updated on
 * re-import, or mapped. */
export async function parseScopeImport(file: File): Promise<ScopeImportResult> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  // The first sheet, whatever it is called — a re-saved or translated template should still import.
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], skipped: [{ row: 0, reason: 'The file has no sheets.' }] };

  const headerRow = sheet.getRow(1);
  const fieldByColumn = new Map<number, keyof ScopeImportRow>();
  headerRow.eachCell((cell, col) => {
    const field = COLUMNS[normaliseHeader(String(cell.value ?? ''))];
    if (field) fieldByColumn.set(col, field);
  });

  if (!Array.from(fieldByColumn.values()).includes('sourceIdent')) {
    return {
      rows: [],
      skipped: [{ row: 1, reason: 'No OBJECT_ID column found. Use the downloadable template.' }],
    };
  }

  const rows: ScopeImportRow[] = [];
  const skipped: ScopeImportResult['skipped'] = [];
  const seen = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const raw: Record<string, unknown> = {};
    fieldByColumn.forEach((field, col) => {
      const v = row.getCell(col).value;
      // ExcelJS hands back objects for formulas and rich text; both carry the display value.
      raw[field] = typeof v === 'object' && v !== null
        ? ((v as any).result ?? (v as any).text ?? '')
        : v;
    });

    const ident = String(raw.sourceIdent ?? '').trim();
    if (!ident) return; // Blank spacer rows are normal in a hand-filled sheet, not an error.

    // The template's own examples. Shipping them and then importing them is a papercut worth one
    // line of code to avoid.
    if (/^EXAMPLE-\d+$/i.test(ident)) return;

    if (seen.has(ident.toLowerCase())) {
      skipped.push({ row: rowNumber, reason: `Duplicate OBJECT_ID "${ident}"` });
      return;
    }
    seen.add(ident.toLowerCase());

    rows.push({
      sourceIdent: ident,
      sourceName: String(raw.sourceName ?? '').trim() || undefined,
      sourceDescription: String(raw.sourceDescription ?? '').trim() || undefined,
      inScope: isTruthy(raw.inScope),
      custom: isExplicitlyTrue(raw.custom),
      suggestedSapIdent: String(raw.suggestedSapIdent ?? '').trim().toUpperCase() || undefined,
    });
  });

  return { rows, skipped };
}

/** Best guess at the SAP object for an imported row, used to pre-fill step 2.
 *
 * Suggests, never decides — the result is offered in the dropdown and still needs confirming. An
 * automatic match that is wrong 5% of the time and silently applied is worse than no match, because
 * nobody re-checks a field that is already filled in. */
export function suggestSapObject(row: ScopeImportRow, objects: MigrationObject[]): string | undefined {
  const byIdent = new Map(objects.map((o) => [o.objectId.toUpperCase(), o.id]));

  // 1. What they told us, if it is real.
  if (row.suggestedSapIdent && byIdent.has(row.suggestedSapIdent)) return byIdent.get(row.suggestedSapIdent);

  // 2. Their identifier IS an SAP ident.
  const ident = row.sourceIdent.trim().toUpperCase();
  if (byIdent.has(ident)) return byIdent.get(ident);

  // 3. Their identifier matches a technical name (MATERIAL → SIF_MATERIAL).
  const byTechnical = objects.find((o) => o.technicalName?.toUpperCase() === ident);
  if (byTechnical) return byTechnical.id;

  // 4. Exact description match, which catches lists exported from another SAP tool.
  const name = (row.sourceName ?? '').trim().toLowerCase();
  if (name) {
    const byDescription = objects.find((o) => (o.description ?? '').trim().toLowerCase() === name);
    if (byDescription) return byDescription.id;
  }

  // Deliberately no fuzzy match. "Material Master (EU)" is as close to SIF_MATERIAL as it is to
  // SIF_MATERIAL_LONGTEXT, and picking one for the user is guessing with their scope.
  return undefined;
}

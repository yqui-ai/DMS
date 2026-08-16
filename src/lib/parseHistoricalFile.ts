/** Client-side parse of an uploaded legacy FMD file (.xlsx/.xls/.csv) into plain JSON — the raw
 * input for the historical-FMD converter. Capped at 500 rows/sheet (a legacy file that's actually
 * row-per-record rather than row-per-field could otherwise be huge; 500 is plenty of sample data
 * either way). */

import type { HistoricalRaw, HistoricalSheet } from '../types/entities';

const MAX_ROWS_PER_SHEET = 500;

/** ExcelJS hands back a plain value for ordinary cells, but a header/cell with rich text,
 * a hyperlink, or a formula comes through as an object — naively `String()`-ing those produced
 * "[object Object]" instead of the actual text, silently corrupting headers like a hyperlinked
 * column name. */
function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) return (v.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
    if (typeof v.text === 'string') return v.text;
    if (typeof v.result === 'string' || typeof v.result === 'number') return String(v.result);
    if (typeof v.formula === 'string') return v.formula;
    return '';
  }
  return String(value);
}

function parseCsvText(text: string): HistoricalSheet {
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 1; } else { inQuotes = false; }
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return cells;
  };

  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
  const [headerLine, ...rest] = lines;
  return { name: 'Sheet1', headers: headerLine ? parseLine(headerLine) : [], rows: rest.slice(0, MAX_ROWS_PER_SHEET).map(parseLine) };
}

export async function parseHistoricalFile(file: File): Promise<HistoricalRaw> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    const text = await file.text();
    return { sheets: [parseCsvText(text)], fileMeta: { fileName: file.name } };
  }

  const { default: ExcelJS } = await import('exceljs');
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets: HistoricalSheet[] = [];
  workbook.eachSheet((worksheet) => {
    let headers: string[] = [];
    const rows: string[][] = [];
    worksheet.eachRow((row, rowNumber) => {
      const values = (row.values as unknown[]).slice(1).map(cellToString);
      if (rowNumber === 1) headers = values;
      else if (rows.length < MAX_ROWS_PER_SHEET) rows.push(values);
    });
    if (headers.length > 0 || rows.length > 0) sheets.push({ name: worksheet.name, headers, rows });
  });

  const fileMeta = {
    fileName: file.name,
    author: workbook.creator || undefined,
    lastModifiedBy: workbook.lastModifiedBy || undefined,
    created: workbook.created ? new Date(workbook.created).toISOString() : undefined,
    modified: workbook.modified ? new Date(workbook.modified).toISOString() : undefined,
  };
  return { sheets, fileMeta };
}

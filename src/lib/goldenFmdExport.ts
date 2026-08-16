import { colorByKey } from './goldenFmdColors';
import { sanitizeName } from './sanitize';
import { exportTimestamp } from './format';
import type { GoldenFmdStructure } from '../types/entities';

/** Builds the ready-to-fill Excel template buffer for a Golden FMD structure: one merged,
 * color-filled header band per section spanning its field count, and a plain header row below
 * naming each field — the classic FMD layout, not a data dump of the catalogue row itself. Split
 * out from the download-triggering export so bulk/zip export can reuse the same buffer. */
export async function buildGoldenFmdBuffer(structure: GoldenFmdStructure): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Template');

  let col = 1;
  for (const section of structure.sections) {
    if (section.fields.length === 0) continue;
    const startCol = col;
    const endCol = col + section.fields.length - 1;
    const color = colorByKey(section.color);

    if (endCol > startCol) sheet.mergeCells(1, startCol, 1, endCol);
    // Merged cells become aliases of the master (top-left) cell — writing to any other cell in the
    // range clobbers the whole merge's value, so only the master is ever touched.
    const master = sheet.getCell(1, startCol);
    master.value = section.name.toUpperCase();
    master.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color.band.replace('#', '')}` } };
    master.font = { bold: true, color: { argb: `FF${color.bandText.replace('#', '')}` } };
    master.alignment = { horizontal: 'center', vertical: 'middle' };

    section.fields.forEach((f, i) => {
      const c = startCol + i;
      const cell = sheet.getCell(2, c);
      cell.value = f.field || `FIELD_${i + 1}`;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color.bg.replace('#', '')}` } };
      cell.font = { bold: true };
      sheet.getColumn(c).width = Math.max(14, (f.field?.length ?? 10) + 2);
    });

    col = endCol + 1;
  }

  sheet.getRow(1).height = 20;
  sheet.getRow(2).height = 18;

  return workbook.xlsx.writeBuffer();
}

export async function exportGoldenFmdToExcel(name: string, structure: GoldenFmdStructure): Promise<void> {
  const buffer = await buildGoldenFmdBuffer(structure);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${sanitizeName(name)}_${exportTimestamp()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

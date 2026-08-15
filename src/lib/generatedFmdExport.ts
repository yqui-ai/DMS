import { colorByKey } from './goldenFmdColors';
import { sanitizeName } from './sanitize';
import { exportTimestamp, fmtDateTime } from './format';
import type { GeneratedColumn, GeneratedTable } from '../types/entities';

export interface GeneratedFmdMeta {
  fmdName: string; fmdDisplayId?: string;
  objectId?: string; objectDescription?: string;
  klass: string; type: string; reference: string;
  versionLabel: string; createdBy?: string; createdAt?: string;
  goldenVersionLabel?: string; goldenOutdated?: boolean;
}

/** Groups consecutive same-section columns into merged header-band spans. */
function sectionRuns(columns: GeneratedColumn[]): { sectionName: string; color: string; span: number }[] {
  const runs: { sectionName: string; color: string; span: number }[] = [];
  for (const c of columns) {
    const last = runs[runs.length - 1];
    if (last && last.sectionName === c.sectionName) last.span += 1;
    else runs.push({ sectionName: c.sectionName, color: c.color, span: 1 });
  }
  return runs;
}

const sanitizeSheetName = (name: string): string => (name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet');

/** Builds the workbook buffer for a generated Standard/Custom FMD: an Overview sheet (object, FMD
 * and Golden-reference details, audit, and a technical/actual-name index of every structure),
 * then one sheet per source structure with the same merged color-band header the on-screen view
 * and the Golden FMD export use. Split out from the download-triggering export so bulk/zip export
 * can reuse the same buffer. */
export async function buildGeneratedFmdBuffer(meta: GeneratedFmdMeta, columns: GeneratedColumn[], tables: GeneratedTable[]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  const overview = workbook.addWorksheet('Overview');
  overview.getColumn(1).width = 20;
  overview.getColumn(2).width = 55;
  const title = overview.getCell('A1');
  title.value = 'Field Mapping Document — Overview';
  title.font = { bold: true, size: 13 };

  let r = 3;
  const kv = (label: string, value: string) => {
    overview.getCell(`A${r}`).value = label;
    overview.getCell(`B${r}`).value = value;
    r += 1;
  };
  kv('Object', meta.objectId ? `${meta.objectId}${meta.objectDescription ? ' — ' + meta.objectDescription : ''}` : '—');
  kv('FMD Name', meta.fmdDisplayId ? `${meta.fmdDisplayId} — ${meta.fmdName}` : meta.fmdName);
  kv('Class / Type', `${meta.klass} / ${meta.type}`);
  kv('Reference', meta.reference);
  kv('Version', meta.versionLabel);
  kv('Golden FMD Reference', meta.goldenVersionLabel ? `${meta.goldenVersionLabel}${meta.goldenOutdated ? ' — OUTDATED, a newer Golden FMD version is available' : ''}` : '—');
  kv('Created By', meta.createdBy ?? '—');
  kv('Created On', meta.createdAt ? fmtDateTime(meta.createdAt) : '—');
  r += 1;

  const headerRow = r;
  overview.getCell(`A${headerRow}`).value = 'Technical Name';
  overview.getCell(`A${headerRow}`).font = { bold: true };
  overview.getCell(`B${headerRow}`).value = 'Actual Name';
  overview.getCell(`B${headerRow}`).font = { bold: true };
  r += 1;
  for (const t of tables) {
    overview.getCell(`A${r}`).value = t.structureIdent;
    overview.getCell(`B${r}`).value = t.structureDescription ?? '—';
    r += 1;
  }

  for (const t of tables) {
    const sheet = workbook.addWorksheet(sanitizeSheetName(t.structureIdent));
    let col = 1;
    for (const run of sectionRuns(columns)) {
      const startCol = col;
      const endCol = col + run.span - 1;
      const color = colorByKey(run.color);
      if (endCol > startCol) sheet.mergeCells(1, startCol, 1, endCol);
      for (let c = startCol; c <= endCol; c++) {
        const cell = sheet.getCell(1, c);
        cell.value = c === startCol ? run.sectionName.toUpperCase() : undefined;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color.band.replace('#', '')}` } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
      col = endCol + 1;
    }

    columns.forEach((c, i) => {
      const color = colorByKey(c.color);
      const cell = sheet.getCell(2, i + 1);
      cell.value = c.field;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color.bg.replace('#', '')}` } };
      cell.font = { bold: true };
      sheet.getColumn(i + 1).width = Math.max(14, c.field.length + 2);
    });

    t.rows.forEach((row, ri) => {
      columns.forEach((c, ci) => { sheet.getCell(ri + 3, ci + 1).value = row[c.field] || ''; });
    });

    sheet.getRow(1).height = 20;
    sheet.getRow(2).height = 18;
  }

  return workbook.xlsx.writeBuffer();
}

export async function exportGeneratedFmdToExcel(meta: GeneratedFmdMeta, columns: GeneratedColumn[], tables: GeneratedTable[]): Promise<void> {
  const buffer = await buildGeneratedFmdBuffer(meta, columns, tables);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${sanitizeName(meta.fmdName)}_${exportTimestamp()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

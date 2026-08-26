import type { FmdHealth } from './fmdHealth';
import { supabase } from './supabase';
import { colorByKey } from './goldenFmdColors';
import { sanitizeName } from './sanitize';
import { exportTimestamp, fmtDateTime } from './format';
import { buildDependencySvg, svgToPngBase64 } from './dependencyDiagramImage';
import { getErdTheme } from './erdTheme';
import type { GeneratedColumn, GeneratedTable, MappingReview } from '../types/entities';

export interface GeneratedFmdMeta {
  fmdName: string; fmdDisplayId?: string;
  objectId?: string; objectDescription?: string;
  /** Migration object's real UUID (not its ident) — when present, the export adds a Dependencies
   * sheet listing this object's prerequisites plus a picture of the dependency diagram. */
  migrationObjectUuid?: string;
  klass: string; type: string; reference: string;
  versionLabel: string; createdBy?: string; createdAt?: string;
  goldenVersionLabel?: string; goldenOutdated?: boolean;
  /** Every version of this FMD, OLDEST first — powers the exported Version History sheet. Omitted
   * (or empty) simply skips that sheet, e.g. for a caller that hasn't loaded the full version list. */
  versions?: { version: string; changedBy?: string; changedAt?: string; comment?: string }[];
  /** The Custom FMD "Review Mapping" AI check's result for this version — powers the exported
   * Mapping Review sheet, right after Version History. Omitted (or no findings) skips the sheet. */
  mappingReview?: MappingReview;
  /** `analyseFmd()`'s result — powers the Health Check sheet, right after Overview. Computed by the
   * caller rather than here: it needs the FMD's review points, which the export never loads. */
  health?: FmdHealth;
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

/** Excel sheet names must be unique within a workbook — appends "_2", "_3", … if the structure
 * name (or its ident fallback) collides with one already used. */
function uniqueSheetName(base: string, used: Set<string>): string {
  const candidate = sanitizeSheetName(base);
  if (!used.has(candidate.toLowerCase())) { used.add(candidate.toLowerCase()); return candidate; }
  let suffix = 2;
  let next = candidate;
  while (used.has(next.toLowerCase())) {
    const tag = `_${suffix}`;
    next = candidate.slice(0, 31 - tag.length) + tag;
    suffix += 1;
  }
  used.add(next.toLowerCase());
  return next;
}

/** Builds the workbook buffer for a generated Standard/Custom FMD: an Overview sheet (object, FMD
 * and Golden-reference details, audit, and a technical/actual-name index of every structure),
 * then one sheet per source structure with the same merged color-band header the on-screen view
 * and the Golden FMD export use. Split out from the download-triggering export so bulk/zip export
 * can reuse the same buffer. */
/** Excel has no "amber", so status reads as a word as well as a fill — a printed or
 * colour-blind-read sheet has to carry the same verdict as the screen. */
const STATUS_FILL: Record<string, string> = { pass: 'FFDDF3E4', warn: 'FFFDF0D5', fail: 'FFFADBD8' };
const STATUS_WORD: Record<string, string> = { pass: 'OK', warn: 'Watch', fail: 'Action needed' };

export async function buildGeneratedFmdBuffer(meta: GeneratedFmdMeta, columns: GeneratedColumn[], tables: GeneratedTable[]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  const overview = workbook.addWorksheet('Overview', { properties: { tabColor: { argb: 'FFE2A900' } } });
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

  // Right after Overview: the same summary the Health check tab shows, so an exported FMD can be
  // assessed without opening the app.
  if (meta.health) {
    const h = meta.health;
    const hc = workbook.addWorksheet('Health Check', { properties: { tabColor: { argb: 'FF1F7A4D' } } });
    hc.getColumn(1).width = 30;
    hc.getColumn(2).width = 16;
    hc.getColumn(3).width = 62;
    const hTitle = hc.getCell('A1');
    hTitle.value = `Health Check — ${meta.versionLabel}`;
    hTitle.font = { bold: true, size: 13 };

    let hr = 3;
    const section = (label: string) => {
      const cell = hc.getCell(`A${hr}`);
      cell.value = label;
      cell.font = { bold: true, size: 11 };
      hr += 1;
    };
    const stat = (label: string, value: string | number, note?: string) => {
      hc.getCell(`A${hr}`).value = label;
      hc.getCell(`B${hr}`).value = value;
      if (note) hc.getCell(`C${hr}`).value = note;
      hr += 1;
    };

    section('Size');
    stat('Fields', h.totalRows);
    stat('Structures', h.structures.length, h.structures.map((s) => `${s.ident} (${s.rows})`).join(', '));
    stat('Cells filled', h.blanks.totalCells === 0 ? '0%' : `${Math.round(((h.blanks.totalCells - h.blanks.blankCells) / h.blanks.totalCells) * 100)}%`, `${h.blanks.blankCells} blank of ${h.blanks.totalCells}`);
    hr += 1;

    section('Coverage');
    stat('In scope', h.scope.in);
    stat('Out of scope', h.scope.out);
    stat('Not stated', h.scope.unset, 'MIGRATION_IN_SCOPE decides this');
    hr += 1;

    section('Build effort');
    stat('Points', h.totalEffort, 'Relative units, not hours. 1 pt = one COPY field.');
    if (h.untyped > 0) stat('Unscored fields', h.untyped, 'No valid MAPPING_TYPE, so they add nothing to the total');
    for (const m of h.mapping) stat(m.label, m.rows, `${m.effort} pts`);
    hr += 1;

    section('Technical rules');
    stat('SQL', h.rules.sql);
    stat('Prose', h.rules.prose);
    stat('Points elsewhere', h.rules.pointer, 'References a document instead of stating the rule');
    stat('Blank', h.rules.blank);
    hr += 1;

    section('Outstanding');
    stat('Review findings open', h.review.outstanding, h.review.ran ? `${h.review.errors} errors · last run ${fmtDateTime(h.review.at)}` : 'Never reviewed');
    stat('Review points open', h.points.open, h.points.byCategory.map((c) => `${c.n} ${c.label}`).join(' · ') || undefined);
    stat('Unpublished changes', h.pendingChanges);
    hr += 2;

    section('Checks');
    const checkHeader = hr;
    hc.getCell(`A${checkHeader}`).value = 'Check';
    hc.getCell(`B${checkHeader}`).value = 'Status';
    hc.getCell(`C${checkHeader}`).value = 'Detail';
    for (const col of ['A', 'B', 'C']) hc.getCell(`${col}${checkHeader}`).font = { bold: true };
    hr += 1;
    for (const c of h.checks) {
      hc.getCell(`A${hr}`).value = c.label;
      const statusCell = hc.getCell(`B${hr}`);
      statusCell.value = STATUS_WORD[c.status] ?? c.status;
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[c.status] ?? 'FFFFFFFF' } };
      hc.getCell(`C${hr}`).value = c.detail;
      hr += 1;
    }
  }

  if (meta.versions && meta.versions.length > 0) {
    const vh = workbook.addWorksheet('Version History', { properties: { tabColor: { argb: 'FFE2A900' } } });
    vh.getColumn(1).width = 12; vh.getColumn(2).width = 26; vh.getColumn(3).width = 20; vh.getColumn(4).width = 70;
    ['Version', 'Changed By', 'Date', 'Comment'].forEach((h, i) => {
      const cell = vh.getCell(1, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F6FED' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    vh.getRow(1).height = 20;
    // Always oldest first — meta.versions is expected to already be ordered that way, but this
    // sheet's whole point is a reliable chronology, so it doesn't just trust the caller blindly.
    const chronological = [...meta.versions].sort((a, b) => (a.changedAt ?? '').localeCompare(b.changedAt ?? ''));
    chronological.forEach((v, i) => {
      const row = i + 2;
      vh.getCell(row, 1).value = v.version;
      vh.getCell(row, 2).value = v.changedBy ?? '—';
      vh.getCell(row, 3).value = v.changedAt ? fmtDateTime(v.changedAt) : '—';
      const commentCell = vh.getCell(row, 4);
      commentCell.value = v.comment ?? '—';
      commentCell.alignment = { wrapText: true, vertical: 'top' };
    });
  }

  if (meta.mappingReview && meta.mappingReview.findings.length > 0) {
    const mr = workbook.addWorksheet('Mapping Review', { properties: { tabColor: { argb: 'FFA81409' } } });
    mr.getColumn(1).width = 20; mr.getColumn(2).width = 20; mr.getColumn(3).width = 20;
    mr.getColumn(4).width = 12; mr.getColumn(5).width = 18; mr.getColumn(6).width = 70;
    const note = mr.getCell('A1');
    note.value = `Reviewed by ${meta.mappingReview.reviewedBy} on ${fmtDateTime(meta.mappingReview.reviewedAt)}`;
    note.font = { italic: true, color: { argb: 'FF6B7280' } };
    const headerRow = 3;
    ['Structure', 'Source Field', 'Target Field', 'Severity', 'Field', 'Issue'].forEach((h, i) => {
      const cell = mr.getCell(headerRow, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F6FED' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    mr.getRow(headerRow).height = 20;
    meta.mappingReview.findings.forEach((f, i) => {
      const row = headerRow + 1 + i;
      mr.getCell(row, 1).value = f.structureIdent;
      mr.getCell(row, 2).value = f.srcField ?? '—';
      mr.getCell(row, 3).value = f.tgtField ?? '—';
      const sevCell = mr.getCell(row, 4);
      sevCell.value = f.severity;
      sevCell.font = { bold: true, color: { argb: f.severity === 'error' ? 'FFA81409' : 'FFB45309' } };
      mr.getCell(row, 5).value = f.field ?? '—';
      const issueCell = mr.getCell(row, 6);
      issueCell.value = f.issue;
      issueCell.alignment = { wrapText: true, vertical: 'top' };
    });
  }

  if (meta.migrationObjectUuid) {
    const { data: depsData } = await supabase
      .from('object_dependencies')
      .select('mandatory, req:migration_objects!object_dependencies_requires_object_id_fkey(object_id, description, category, component)')
      .eq('migration_object_id', meta.migrationObjectUuid);

    if (depsData && depsData.length > 0) {
      const deps = [...depsData]
        .map((d: any) => ({
          requiresIdent: d.req.object_id as string, requiresDescription: d.req.description as string | undefined,
          requiresCategory: d.req.category as string | undefined, requiresComponent: d.req.component as string | undefined,
          mandatory: d.mandatory as boolean,
        }))
        .sort((a, b) => Number(b.mandatory) - Number(a.mandatory));

      const depSheet = workbook.addWorksheet('Dependencies', { properties: { tabColor: { argb: 'FFE2A900' } } });
      depSheet.getColumn(1).width = 22; depSheet.getColumn(2).width = 34;
      depSheet.getColumn(3).width = 18; depSheet.getColumn(4).width = 18; depSheet.getColumn(5).width = 14;

      ['Object ID', 'Name / Description', 'Object Type', 'Component', 'Dependency'].forEach((h, i) => {
        const cell = depSheet.getCell(1, i + 1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F6FED' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      depSheet.getRow(1).height = 20;

      deps.forEach((d, i) => {
        const row = i + 2;
        depSheet.getCell(row, 1).value = d.requiresIdent;
        depSheet.getCell(row, 2).value = d.requiresDescription ?? '—';
        depSheet.getCell(row, 3).value = d.requiresCategory ?? '—';
        depSheet.getCell(row, 4).value = d.requiresComponent ?? '—';
        const depCell = depSheet.getCell(row, 5);
        depCell.value = d.mandatory ? 'Mandatory' : 'Optional';
        depCell.font = { bold: true, color: { argb: d.mandatory ? 'FFA81409' : 'FF6B7280' } };
      });

      const diagramTopRow = deps.length + 4;
      const titleCell = depSheet.getCell(diagramTopRow, 1);
      titleCell.value = 'Dependency Diagram';
      titleCell.font = { bold: true, size: 12 };

      const { svg, width, height } = buildDependencySvg({ objectId: meta.objectId ?? '—', description: meta.objectDescription }, deps, getErdTheme());
      const base64 = await svgToPngBase64(svg, width, height);
      const imageId = workbook.addImage({ base64, extension: 'png' });
      depSheet.addImage(imageId, { tl: { col: 0, row: diagramTopRow }, ext: { width, height } });
    }
  }

  const usedSheetNames = new Set<string>();
  for (const t of tables) {
    const sheet = workbook.addWorksheet(uniqueSheetName(t.structureDescription || t.structureIdent, usedSheetNames));
    let col = 1;
    for (const run of sectionRuns(columns)) {
      const startCol = col;
      const endCol = col + run.span - 1;
      const color = colorByKey(run.color);
      if (endCol > startCol) sheet.mergeCells(1, startCol, 1, endCol);
      // Merged cells become aliases of the master (top-left) cell — writing to any other cell in
      // the range clobbers the whole merge's value, so only the master is ever touched.
      const master = sheet.getCell(1, startCol);
      master.value = run.sectionName.toUpperCase();
      master.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color.band.replace('#', '')}` } };
      master.font = { bold: true, color: { argb: `FF${color.bandText.replace('#', '')}` } };
      master.alignment = { horizontal: 'center', vertical: 'middle' };
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

import { supabase } from './supabase';
import { formatLibraryReference } from './libraryReference';
import { sanitizeName } from './sanitize';
import { exportTimestamp } from './format';
import { buildGoldenFmdBuffer } from './goldenFmdExport';
import { buildGeneratedFmdBuffer } from './generatedFmdExport';

/** Exports one or more FMDs as real per-FMD Excel workbooks (Golden's structure template, or a
 * generated Standard/Custom FMD's Overview + per-structure sheets) — a single FMD downloads
 * directly, several are bundled into one .zip. FMDs with no exportable structure yet (old-shape
 * source/target/mapping sheets, or a version-less FMD) are skipped and reported. */
export async function exportFmdsAsExcel(fmdIds: string[]): Promise<{ exported: number; skipped: string[] }> {
  const { data: fmdsData, error: fmdsError } = await supabase
    .from('fmds')
    .select('id, name, display_id, class, type, based_on_golden_version_id, migration_objects(id, object_id, description), subprojects(projects(code, programs(code))), fmd_versions!fmd_id(id, version, sheets, created_by, created_at)')
    .in('id', fmdIds);
  if (fmdsError) throw fmdsError;

  const { data: goldenFmd } = await supabase.from('fmds').select('id').eq('type', 'Golden').maybeSingle();
  let goldenVersionLabel = new Map<string, string>();
  let goldenLatestId: string | undefined;
  if (goldenFmd) {
    const { data: goldenVersions } = await supabase.from('fmd_versions').select('id, version, created_at').eq('fmd_id', goldenFmd.id).order('created_at', { ascending: false });
    goldenVersionLabel = new Map((goldenVersions ?? []).map((v: any) => [v.id, v.version as string]));
    goldenLatestId = goldenVersions?.[0]?.id;
  }

  const files: { name: string; buffer: ArrayBuffer }[] = [];
  const skipped: string[] = [];

  for (const f of fmdsData ?? []) {
    const versions = [...((f as any).fmd_versions ?? [])].sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    const latest = versions[0];
    const sheets = latest?.sheets ?? {};

    if (f.type === 'Golden' && sheets.goldenStructure) {
      const buffer = await buildGoldenFmdBuffer(sheets.goldenStructure);
      files.push({ name: `${sanitizeName(f.name)}.xlsx`, buffer });
      continue;
    }
    if (sheets.generatedColumns?.length && sheets.generatedTables?.length) {
      const programCode = (f as any).subprojects?.projects?.programs?.code as string | undefined;
      const projectCode = (f as any).subprojects?.projects?.code as string | undefined;
      const basedOnLabel = f.based_on_golden_version_id ? goldenVersionLabel.get(f.based_on_golden_version_id) : undefined;
      const buffer = await buildGeneratedFmdBuffer(
        {
          fmdName: f.name, fmdDisplayId: f.display_id ?? undefined,
          objectId: (f as any).migration_objects?.object_id, objectDescription: (f as any).migration_objects?.description,
          migrationObjectUuid: (f as any).migration_objects?.id,
          klass: f.class, type: f.type, reference: formatLibraryReference(f.class, programCode, projectCode),
          versionLabel: latest.version, createdBy: latest.created_by ?? undefined, createdAt: latest.created_at ?? undefined,
          goldenVersionLabel: basedOnLabel, goldenOutdated: !!f.based_on_golden_version_id && f.based_on_golden_version_id !== goldenLatestId,
        },
        sheets.generatedColumns, sheets.generatedTables,
      );
      files.push({ name: `${sanitizeName(f.name)}.xlsx`, buffer });
      continue;
    }
    skipped.push(f.name);
  }

  if (files.length === 0) return { exported: 0, skipped };

  if (files.length === 1) {
    const blob = new Blob([files[0].buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = files[0].name;
    a.click();
    URL.revokeObjectURL(url);
    return { exported: 1, skipped };
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const usedNames = new Set<string>();
  for (const file of files) {
    let name = file.name;
    let n = 2;
    while (usedNames.has(name)) { name = file.name.replace(/\.xlsx$/, `_${n}.xlsx`); n += 1; }
    usedNames.add(name);
    zip.file(name, file.buffer);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url; a.download = `field-mapping-documents_${exportTimestamp()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
  return { exported: files.length, skipped };
}

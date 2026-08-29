import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../components/Select';
import { useNavigate, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { useDmcStructures } from '../../lib/queries/dmcStructures';
import { useObjectScopeUsage, type ObjectScopeUsage } from '../../lib/queries/scope';
import { useFmdVersions, useGenerateFmdMutation, useGoldenFmdSummary } from '../../lib/queries/fmds';
import { useProgram } from '../../lib/queries/programme';
import { supabase } from '../../lib/supabase';
import { sanitizeName } from '../../lib/sanitize';
import { libraryPath } from '../../lib/libraryNav';
import { SelectAllToggle } from '../../components/SelectAllToggle';
import type { GeneratedColumn, GeneratedTable, GoldenFmdStructure, MigrationObject } from '../../types/entities';

const SRC_SYSTEM_DEFAULT = 'SAP ECC';
const TGT_SYSTEM_DEFAULT = 'S/4HANA';

interface StructureRef { id: string; ident: string; description?: string }
interface ResolvedTarget {
  object: MigrationObject; isCustom: boolean; scope?: ObjectScopeUsage;
  existingFmd?: { id: string; displayId?: string; latestVersion?: string };
}

/** Every field the Golden structure defines, in section order, carrying the section's color and
 * the field's own description — the generated FMD's columns snapshot both, like everything else
 * about a Golden version. */
const goldenColumns = (structure: GoldenFmdStructure): GeneratedColumn[] =>
  structure.sections.flatMap((sec) => sec.fields.filter((f) => f.field).map((f) => ({ field: f.field, sectionName: sec.name, color: sec.color, description: f.description || undefined, critical: f.critical || undefined, kind: f.kind, options: f.options })));

function buildRow(f: any, columnFields: string[], structureIdent: string, populateSource: boolean, populateTarget: boolean, applyMappingDefaults: boolean): Record<string, string> {
  const row: Record<string, string> = Object.fromEntries(columnFields.map((c) => [c, '']));
  if (populateSource) {
    if ('SRC_SYSTEM' in row) row.SRC_SYSTEM = SRC_SYSTEM_DEFAULT;
    if ('SRC_TABLE' in row) row.SRC_TABLE = structureIdent;
    if ('SRC_FIELD' in row) row.SRC_FIELD = f.field_name ?? '';
    if ('SRC_FIELD_DESC' in row) row.SRC_FIELD_DESC = f.description ?? '';
    if ('SRC_FIELD_MANDATORY' in row) row.SRC_FIELD_MANDATORY = f.key_flag ? 'Mandatory' : 'Optional';
    if ('SRC_FIELD_DATATYPE' in row) row.SRC_FIELD_DATATYPE = f.data_type ?? '';
    if ('SRC_FIELD_LENGTH' in row) row.SRC_FIELD_LENGTH = f.length != null ? String(f.length) : '';
    if ('SRC_FIELD_DECIMAL' in row) row.SRC_FIELD_DECIMAL = f.decimals != null ? String(f.decimals) : '';
    if ('SRC_CHECK_TABLE' in row) row.SRC_CHECK_TABLE = f.check_table ?? '';
  }
  if (populateTarget) {
    // Mirrors the source field values as a starting placeholder — real target mapping isn't decided yet.
    if ('TGT_SYSTEM' in row) row.TGT_SYSTEM = TGT_SYSTEM_DEFAULT;
    if ('TGT_TABLE' in row) row.TGT_TABLE = structureIdent;
    if ('TGT_FIELD' in row) row.TGT_FIELD = f.field_name ?? '';
    if ('TGT_FIELD_DESC' in row) row.TGT_FIELD_DESC = f.description ?? '';
    if ('TGT_FIELD_MANDATORY' in row) row.TGT_FIELD_MANDATORY = f.key_flag ? 'Mandatory' : 'Optional';
    if ('TGT_FIELD_DATATYPE' in row) row.TGT_FIELD_DATATYPE = f.data_type ?? '';
    if ('TGT_FIELD_LENGTH' in row) row.TGT_FIELD_LENGTH = f.length != null ? String(f.length) : '';
    if ('TGT_FIELD_DECIMAL' in row) row.TGT_FIELD_DECIMAL = f.decimals != null ? String(f.decimals) : '';
    if ('TGT_CHECK_TABLE' in row) row.TGT_CHECK_TABLE = f.check_table ?? '';
  }
  // Standard FMDs are program-wide reference templates, not a specific project's real mapping
  // work — a straight 1:1 copy is the sensible starting point until someone overrides it. Custom
  // FMDs stay blank: that mapping needs a real decision (or the Mapping Review AI check), not a
  // default that could be mistaken for one.
  if (applyMappingDefaults) {
    if ('MAPPING_TYPE' in row) row.MAPPING_TYPE = 'COPY';
    if ('TRANSFORMATION_RULE' in row) row.TRANSFORMATION_RULE = '1:1';
    // SQL, not the old "<structure>-<field>" notation: TECHNICAL_RULE is SQL for every mapping
    // type now, so generating notation here would make every generated FMD start out failing its
    // own review.
    if ('TECHNICAL_RULE' in row) row.TECHNICAL_RULE = `SELECT ${f.field_name ?? ''} FROM ${structureIdent}`;
  }
  return row;
}

/** One table per structure that actually has fields, in the order given — the viewer shows one
 * tab per table, structure ident as the default label. */
function buildGeneratedTables(fieldRows: any[], columns: GeneratedColumn[], structures: StructureRef[], populateSource: boolean, populateTarget: boolean, applyMappingDefaults: boolean): GeneratedTable[] {
  const columnFields = columns.map((c) => c.field);
  const byStructure = new Map<string, any[]>();
  for (const f of fieldRows) {
    const arr = byStructure.get(f.structure_id) ?? [];
    arr.push(f);
    byStructure.set(f.structure_id, arr);
  }
  const tables: GeneratedTable[] = [];
  for (const s of structures) {
    const rowsForStructure = byStructure.get(s.id);
    if (!rowsForStructure?.length) continue;
    tables.push({
      structureId: s.id, structureIdent: s.ident, structureDescription: s.description,
      rows: rowsForStructure.map((f) => buildRow(f, columnFields, s.ident, populateSource, populateTarget, applyMappingDefaults)),
    });
  }
  return tables;
}

const resolveName = (objectId: string, scope: ObjectScopeUsage | undefined, fallbackProgramCode: string | undefined) =>
  scope
    ? sanitizeName(`ZFMD_${scope.programCode ?? 'PROG'}_${scope.projectCode ?? 'PROJ'}_${objectId}`)
    : sanitizeName(`FMD_${fallbackProgramCode ?? 'PROG'}_${objectId}`);

/** A Custom FMD must always have a Standard FMD to reference — mirroring how an in-scope object
 * always implicitly references its Standard definition. If the object doesn't have a Standard FMD
 * yet, one is generated automatically (right now, silently, with Standard's own default 1:1-copy
 * mapping) before the Custom FMD is, so "Reference FMD version" is never blank. Returns the
 * Standard FMD's current latest version id either way — freshly created or already existing. */
async function ensureStandardReference(
  object: MigrationObject, columns: GeneratedColumn[], goldenVersionId: string, goldenVersionLabel: string,
  generate: ReturnType<typeof useGenerateFmdMutation>['generate'], programCode: string | undefined,
): Promise<string> {
  const { data: existingRows } = await supabase
    .from('fmds').select('id, fmd_versions!fmd_id(id, created_at)')
    .eq('type', 'Standard').eq('migration_object_id', object.id).is('subproject_id', null).limit(1);
  const existing = existingRows?.[0] as any;
  if (existing) {
    const versions = [...(existing.fmd_versions ?? [])].sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    if (versions[0]?.id) return versions[0].id as string;
  }

  const { data: structuresData } = await supabase.from('dmc_structures').select('*').eq('migration_object_id', object.id).eq('side', 'sender');
  const objStructures: StructureRef[] = (structuresData ?? []).map((s: any) => ({ id: s.id, ident: s.ident, description: s.description ?? undefined }));
  const structureIds = objStructures.map((s) => s.id);
  const { data: fieldRows } = structureIds.length
    ? await supabase.from('dmc_fields').select('*').in('structure_id', structureIds).order('seq')
    : { data: [] };
  const tables = buildGeneratedTables(fieldRows ?? [], columns, objStructures, true, true, true);
  const name = resolveName(object.objectId, undefined, programCode);
  const { versionId } = await generate({
    migrationObjectId: object.id, name, type: 'Standard', class: 'Global', subprojectId: null,
    goldenVersionId, goldenVersionLabel, columns, tables,
    comment: 'Auto-generated as the reference Standard FMD for this object.',
  });
  return versionId;
}

/** Which scope (if any) a migration object is in, and whether an FMD of the matching type already
 * exists for it — used both to build the bulk confirmation panes and, at generation time, to
 * resolve each object independently. */
async function resolveTarget(object: MigrationObject): Promise<ResolvedTarget> {
  const { data: scopeData } = await supabase
    .from('subproject_objects').select('subproject_id, subprojects(name, projects(code, programs(code)))')
    .eq('migration_object_id', object.id).eq('in_scope', true);
  const objScope = (scopeData ?? [])[0];
  const scope: ObjectScopeUsage | undefined = objScope ? {
    subprojectId: objScope.subproject_id,
    subprojectName: (objScope as any).subprojects?.name ?? '—',
    projectCode: (objScope as any).subprojects?.projects?.code,
    programCode: (objScope as any).subprojects?.projects?.programs?.code,
  } : undefined;
  const isCustom = !!scope;

  let existingQuery = supabase.from('fmds').select('id, display_id, fmd_versions!fmd_id(version, created_at)')
    .eq('migration_object_id', object.id).eq('type', isCustom ? 'Custom' : 'Standard');
  existingQuery = isCustom ? existingQuery.eq('subproject_id', scope!.subprojectId) : existingQuery.is('subproject_id', null);
  const { data: existingRows } = await existingQuery.limit(1);
  const existingRow = existingRows?.[0] as any;
  let existingFmd: ResolvedTarget['existingFmd'];
  if (existingRow) {
    const versions = [...(existingRow.fmd_versions ?? [])].sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    existingFmd = { id: existingRow.id, displayId: existingRow.display_id ?? undefined, latestVersion: versions[0]?.version };
  }
  return { object, isCustom, scope, existingFmd };
}

/** "Generate FMD" — builds a Standard/Custom FMD for one or more migration objects from the
 * Golden FMD's current field structure, pre-populated from each object's real sender-structure
 * fields (DMC_FIELD). Standard when an object isn't in scope anywhere; Custom (attached to a
 * specific subproject) when it is. One object: full wizard (pick which sender structures, search
 * to find one in a long list). Several objects (bulk, from the Migration Object list's checkbox
 * selection): every sender structure is included automatically for each, and a confirmation step
 * shows which objects already have an FMD (will get a new version) versus which will be created
 * fresh, before anything is written. */
export function GenerateFmdDialog({ objects, onClose, onGenerated }: {
  objects: MigrationObject[] | null;
  onClose: () => void;
  /** Called for each FMD created, so a caller that opened this can act on the result — Scope uses
   * it to assign the new document to the subproject straight away, which is the whole reason it
   * asked for one. Absent in the Library, where generating is the end of the task. */
  onGenerated?: (fmdId: string, migrationObjectId: string) => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { programId, subprojectId: routeSubprojectId } = useParams();
  const single = objects && objects.length === 1 ? objects[0] : null;
  const isBulk = !!objects && objects.length > 1;

  const { data: golden } = useGoldenFmdSummary();
  const { data: goldenVersions = [] } = useFmdVersions(golden?.id);
  const { data: scopeUsage = [] } = useObjectScopeUsage(single?.id);
  const { data: structures = [] } = useDmcStructures(single?.id);
  const { data: objectProgram } = useProgram(single?.programId);
  const generateMutation = useGenerateFmdMutation();


  const [subprojectId, setSubprojectId] = useState('');
  const [selectedStructureIds, setSelectedStructureIds] = useState<Set<string>>(new Set());
  const [structureQuery, setStructureQuery] = useState('');
  const [populateSource, setPopulateSource] = useState(true);
  const [populateTarget, setPopulateTarget] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolvedTargets, setResolvedTargets] = useState<ResolvedTarget[] | null>(null);

  const senderStructures = useMemo(() => structures.filter((s) => s.side === 'sender'), [structures]);
  const filteredStructures = useMemo(() => {
    const q = structureQuery.trim().toLowerCase();
    if (!q) return senderStructures;
    return senderStructures.filter((s) => s.ident.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q));
  }, [senderStructures, structureQuery]);


  /** Default to the subproject you are STANDING IN, when the object is in scope there.
   *
   * It used to always take `scopeUsage[0]`. Opened from Scope > FMD Mapping inside Wave 1B, an
   * object also in Wave 1A would silently generate the FMD against 1A — the right dialog producing
   * the wrong record, with nothing on screen to say so. Falls back to the first usage when the
   * route has no subproject (the Library's program-wide mount). */
  useEffect(() => {
    const here = scopeUsage.find((s) => s.subprojectId === routeSubprojectId);
    setSubprojectId(here?.subprojectId ?? scopeUsage[0]?.subprojectId ?? '');
  }, [scopeUsage, routeSubprojectId]);
  useEffect(() => { setSelectedStructureIds(new Set(senderStructures.map((s) => s.id))); setStructureQuery(''); }, [single?.id, senderStructures.length]);
  useEffect(() => { setResolvedTargets(null); }, [objects]);

  if (!objects || objects.length === 0) return null;

  /** Always the newest Golden version — `useFmdVersions` returns them newest first.
   *
   * There was a picker here. Generating from an older template produces an FMD that is born
   * outdated: it is flagged the moment it is created, and its first job is to be synced forward to
   * the template it should have used. Nobody wants that, so it is not offered. */
  const goldenVersion = goldenVersions[0];
  const goldenVersionId = goldenVersion?.id ?? '';
  const goldenStructure = goldenVersion?.sheets.goldenStructure;
  const isCustom = scopeUsage.length > 0;
  const chosenScope = scopeUsage.find((s) => s.subprojectId === subprojectId);

  const toggleStructure = (id: string) => setSelectedStructureIds((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAll = () => setSelectedStructureIds(new Set(filteredStructures.map((s) => s.id)));
  const deselectAll = () => setSelectedStructureIds(new Set());

  const viewAction = (fmdId: string) => ({ label: 'View FMD', onClick: () => navigate(`${libraryPath('fmds', programId, routeSubprojectId)}/${fmdId}`) });

  const generateSingle = async () => {
    if (!single || !goldenStructure || !goldenVersion) return;
    if (selectedStructureIds.size === 0) { toast.error('Select at least one sender structure.'); return; }
    if (isCustom && !subprojectId) { toast.error('Pick which project this FMD is for.'); return; }

    setGenerating(true);
    try {
      const structureIds = [...selectedStructureIds];
      const { data: fieldRows, error } = await supabase.from('dmc_fields').select('*').in('structure_id', structureIds).order('seq');
      if (error) throw error;
      const selectedStructures = senderStructures.filter((s) => selectedStructureIds.has(s.id));
      const columns = goldenColumns(goldenStructure);
      const tables = buildGeneratedTables(fieldRows ?? [], columns, selectedStructures, populateSource, populateTarget, !isCustom);
      const name = resolveName(single.objectId, chosenScope, objectProgram?.code);

      const basedOnStandardFmdVersionId = isCustom
        ? await ensureStandardReference(single, columns, goldenVersionId, goldenVersion.version, generateMutation.generate, objectProgram?.code)
        : undefined;

      const { fmdId } = await generateMutation.generate({
        migrationObjectId: single.id, name, type: isCustom ? 'Custom' : 'Standard', class: isCustom ? 'Local' : 'Global',
        subprojectId: isCustom ? subprojectId : null,
        goldenVersionId, goldenVersionLabel: goldenVersion.version, columns, tables,
        basedOnStandardFmdVersionId,
      });
      onGenerated?.(fmdId, single.id);
      toast.success(`${name} generated.`, viewAction(fmdId));
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Could not generate FMD.');
    } finally {
      setGenerating(false);
    }
  };

  /** Bulk mode never generates immediately — it resolves each object's scope + whether an FMD
   * already exists for it, so the confirmation modal can show what's about to happen. */
  const openBulkConfirm = async () => {
    if (!goldenStructure || !goldenVersion) { toast.error('No Golden FMD version is available to generate from.'); return; }
    setResolving(true);
    try {
      const resolved = await Promise.all(objects.map(resolveTarget));
      setResolvedTargets(resolved);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not check existing FMDs.');
    } finally {
      setResolving(false);
    }
  };

  const confirmBulkGenerate = async () => {
    if (!resolvedTargets || !goldenStructure || !goldenVersion) return;
    setGenerating(true);
    const columns = goldenColumns(goldenStructure);
    let created = 0;
    try {
      for (const r of resolvedTargets) {
        try {
          const { data: structuresData } = await supabase.from('dmc_structures').select('*').eq('migration_object_id', r.object.id).eq('side', 'sender');
          const objStructures: StructureRef[] = (structuresData ?? []).map((s: any) => ({ id: s.id, ident: s.ident, description: s.description ?? undefined }));
          const structureIds = objStructures.map((s) => s.id);
          const { data: fieldRows } = structureIds.length
            ? await supabase.from('dmc_fields').select('*').in('structure_id', structureIds).order('seq')
            : { data: [] };
          const tables = buildGeneratedTables(fieldRows ?? [], columns, objStructures, populateSource, populateTarget, !r.isCustom);
          let programCode = r.scope?.programCode;
          if (!programCode) {
            const { data: program } = await supabase.from('programs').select('code').eq('id', r.object.programId).maybeSingle();
            programCode = program?.code;
          }
          const name = resolveName(r.object.objectId, r.scope, programCode);

          const basedOnStandardFmdVersionId = r.isCustom
            ? await ensureStandardReference(r.object, columns, goldenVersionId, goldenVersion.version, generateMutation.generate, programCode)
            : undefined;

          const { fmdId: bulkFmdId } = await generateMutation.generate({
            migrationObjectId: r.object.id, name, type: r.isCustom ? 'Custom' : 'Standard', class: r.isCustom ? 'Local' : 'Global',
            subprojectId: r.scope?.subprojectId ?? null,
            goldenVersionId, goldenVersionLabel: goldenVersion.version, columns, tables,
            basedOnStandardFmdVersionId,
          });
          onGenerated?.(bulkFmdId, r.object.id);
          created += 1;
        } catch (err: any) {
          toast.error(`${r.object.objectId}: ${err.message ?? 'generation failed'}`);
        }
      }
      if (created > 0) toast.success(`${created} FMD${created === 1 ? '' : 's'} generated.`, { label: 'View Field Mapping list', onClick: () => navigate(libraryPath('fmds', programId, routeSubprojectId)) });
      setResolvedTargets(null);
      onClose();
    } finally {
      setGenerating(false);
    }
  };

  const withExisting = resolvedTargets?.filter((r) => r.existingFmd) ?? [];
  const withoutExisting = resolvedTargets?.filter((r) => !r.existingFmd) ?? [];

  return (
    <Dialog
      open={!!objects && objects.length > 0} onClose={onClose}
      title={isBulk ? `Generate FMD — ${objects.length} objects` : `Generate FMD — ${single?.objectId ?? ''}`}
      size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary" onClick={isBulk ? openBulkConfirm : generateSingle}
          disabled={generating || resolving || !golden}
        >
          {resolving ? 'Checking…' : generating ? 'Generating…' : 'Generate FMD'}
        </Button>
      </>}
    >
      {!golden ? (
        <p className="text-sm2 text-muted py-8 text-center">No Golden FMD has been registered yet — nothing to generate from.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {isBulk ? (
            <div className="rounded bg-surface-2 px-3.5 py-2.5 text-sm2">
              Generating for <strong>{objects.length}</strong> selected objects — Standard or Custom is resolved per object,
              and every sender structure is included automatically for each.
            </div>
          ) : (
            <>
              <div className="rounded bg-surface-2 px-3.5 py-2.5 text-sm2">
                {isCustom ? (
                  <>This object is in scope — generating a <strong>Custom</strong> FMD.</>
                ) : (
                  <>This object isn't in scope for any subproject — generating a <strong>Standard</strong> FMD.</>
                )}
              </div>

              {isCustom && scopeUsage.length > 1 && (
                <Field label="Which project is this FMD for?">
                  <Select
                    value={subprojectId} onChange={(e) => setSubprojectId(e.target.value)}
                    className="w-full"
                  >
                    {scopeUsage.map((s) => (
                      <option key={s.subprojectId} value={s.subprojectId}>
                        {s.programCode ?? '—'}-{s.projectCode ?? '—'} · {s.subprojectName}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm2 font-semibold text-muted">Sender structures to generate</label>
                  {/* "All" here means the rows the search left visible, which is what selectAll
                      itself operates on — a toggle that ignored the filter would be lying. */}
                  <SelectAllToggle
                    allSelected={!!filteredStructures.length && filteredStructures.every((s) => selectedStructureIds.has(s.id))}
                    onSelectAll={selectAll} onDeselectAll={deselectAll}
                  />
                </div>
                {senderStructures.length > 6 && (
                  <div className="relative mb-1.5">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      value={structureQuery} onChange={(e) => setStructureQuery(e.target.value)} placeholder="Search structures…"
                      className="w-full text-sm2 pl-7 pr-3 py-1.5 rounded border border-line-strong bg-surface"
                    />
                  </div>
                )}
                <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] max-h-48 overflow-auto">
                  {filteredStructures.length === 0 && <p className="text-sm2 text-muted p-3">No sender structures {structureQuery ? 'match your search' : 'found for this object'}.</p>}
                  {filteredStructures.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-line last:border-b-0 hover:bg-blue-pale cursor-pointer">
                      <input type="checkbox" checked={selectedStructureIds.has(s.id)} onChange={() => toggleStructure(s.id)} className="w-3.5 h-3.5 accent-[var(--blue)]" />
                      <span className="font-mono font-bold text-sm2">{s.ident}</span>
                      {s.description && <span className="text-2xs text-muted truncate">{s.description}</span>}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm2 cursor-pointer">
              <input type="checkbox" checked={populateSource} onChange={(e) => setPopulateSource(e.target.checked)} className="w-3.5 h-3.5 accent-[var(--blue)]" />
              Populate Source fields from structure (default system: {SRC_SYSTEM_DEFAULT})
            </label>
            <label className="flex items-center gap-2 text-sm2 cursor-pointer">
              <input type="checkbox" checked={populateTarget} onChange={(e) => setPopulateTarget(e.target.checked)} className="w-3.5 h-3.5 accent-[var(--blue)]" />
              Populate Target fields (mirrors source; default system: {TGT_SYSTEM_DEFAULT})
            </label>
          </div>
        </div>
      )}

      <Dialog
        open={!!resolvedTargets} onClose={() => setResolvedTargets(null)} title="Confirm generation" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setResolvedTargets(null)}>Cancel</Button>
          <Button variant="primary" onClick={confirmBulkGenerate} disabled={generating}>
            {generating ? 'Generating…' : `Generate ${resolvedTargets?.length ?? 0} FMD${(resolvedTargets?.length ?? 0) === 1 ? '' : 's'}`}
          </Button>
        </>}
      >
        <p className="text-sm2 text-muted mb-4">
          Based on Golden FMD <span className="font-mono font-bold">{goldenVersion?.version}</span>, always the latest. Objects that already have an FMD will get a new version added — the rest are created fresh at v1.0.0.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-2xs font-bold uppercase tracking-[.04em] text-amber-ink mb-1.5">New version added ({withExisting.length})</div>
            <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] max-h-64 overflow-auto">
              {withExisting.length === 0 && <p className="text-sm2 text-muted p-3">None.</p>}
              {withExisting.map((r) => (
                <div key={r.object.id} className="px-3 py-2 border-b border-line last:border-b-0">
                  <div className="font-mono font-bold text-sm2">{r.object.objectId}</div>
                  <div className="text-2xs text-muted">{r.existingFmd?.displayId} · currently {r.existingFmd?.latestVersion}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-2xs font-bold uppercase tracking-[.04em] text-green mb-1.5">Created new ({withoutExisting.length})</div>
            <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] max-h-64 overflow-auto">
              {withoutExisting.length === 0 && <p className="text-sm2 text-muted p-3">None.</p>}
              {withoutExisting.map((r) => (
                <div key={r.object.id} className="px-3 py-2 border-b border-line last:border-b-0">
                  <div className="font-mono font-bold text-sm2">{r.object.objectId}</div>
                  <div className="text-2xs text-muted">v1.0.0</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Dialog>
    </Dialog>
  );
}

#!/usr/bin/env node
/**
 * Generates supabase/seed/seed.sql from the design prototype's fixture data.
 *
 * Sources (read at runtime, never copied by hand — see design_handoff_dms_app/supabase/seed/README.md):
 *   - design_handoff_dms_app/reference/dmc_cobj/DMC_COBJ.xlsx          (real SAP DMC catalogue, one row per object)
 *   - design_handoff_dms_app/reference/dmc_cobj/DMC_COBJT.xlsx         (per-language object descriptions)
 *   - design_handoff_dms_app/reference/dmc_cobj/DMC_DMOL_REF_v2.xlsx   (standard-object reference: category/approach/component/url)
 *   - design_handoff_dms_app/reference/dmc_struct/DMC_STREE.xlsx       (structure tree node per sender/receiver structure)
 *   - design_handoff_dms_app/reference/dmc_struct/DMC_STREET.xlsx      (per-language structure descriptions)
 *   - design_handoff_dms_app/reference/dmc_struct/DMC_STRUCT.xlsx      (structure detail, 1:1 with DMC_STREE)
 *   - design_handoff_dms_app/reference/dmc_struct/DMC_FIELD_1.xlsx,    (field list per structure — split across 2 files
 *     DMC_FIELD_2.xlsx                                                  upstream due to an export size limit, combined here)
 *   - design_handoff_dms_app/reference/dmc_cobj/DMC_SIN_SCOBJSEQ.xlsx  (object load-sequence prerequisites, IDENT-keyed)
 *   - design_handoff_dms_app/reference/Data Migration Solution v2.dc.html  (prototype's `state = {...}` class field)
 *
 * Run: node scripts/build-seed.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

/**
 * Deterministic id from a stable natural key (SHA-256, formatted as a UUID). Regenerating this
 * script must always produce the SAME id for the SAME source row — otherwise re-running seed.sql
 * against an already-seeded database breaks: `on conflict do nothing` silently skips a row whose
 * unique key (e.g. migration_objects.guid) already exists, but a freshly random id generated in
 * *this* run never actually gets inserted, so any other row in the same file that references that
 * fresh-but-unpersisted id (e.g. object_dependencies) fails its foreign key.
 */
function stableId(key) {
  const hex = createHash('sha256').update(key).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'design_handoff_dms_app/reference/Data Migration Solution v2.dc.html');
const DMC_COBJ_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_cobj/DMC_COBJ.xlsx');
const DMC_COBJT_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_cobj/DMC_COBJT.xlsx');
const DMC_DMOL_REF_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_cobj/DMC_DMOL_REF_v2.xlsx');
const DMC_SIN_SCOBJSEQ_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_cobj/DMC_SIN_SCOBJSEQ.xlsx');
const DMC_STREE_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_struct/DMC_STREE.xlsx');
const DMC_STREET_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_struct/DMC_STREET.xlsx');
const DMC_STRUCT_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_struct/DMC_STRUCT.xlsx');
const DMC_FIELD1_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_struct/DMC_FIELD_1.xlsx');
const DMC_FIELD2_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_struct/DMC_FIELD_2.xlsx');
const OUT_PATH = path.join(ROOT, 'supabase/seed/seed.sql');

/** Reads every row of an .xlsx sheet as an array of plain objects keyed by header row. */
function readSheet(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in ${filePath} (sheets: ${wb.SheetNames.join(', ')})`);
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
}

// ── string-aware balanced-bracket extraction (handles nested {}/[]/() and quoted strings) ──
function extractBalanced(text, openIndex) {
  let depth = 0;
  let inStr = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"') { inStr = ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }
  throw new Error('extractBalanced: unbalanced brackets from index ' + openIndex);
}

// ── SQL helpers ──
const q = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const b = (v) => (v == null ? 'null' : v ? 'true' : 'false');
const n = (v) => (v == null || Number.isNaN(v) ? 'null' : String(v));
const parseNum = (s) => {
  if (s == null || s === '—' || s === '') return null;
  const cleaned = String(s).replace(/,/g, '');
  const v = parseInt(cleaned, 10);
  return Number.isNaN(v) ? null : v;
};
const parseDate = (s) => {
  if (!s || s === '—') return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const parseShortDate = (s, year = 2026) => {
  // 'Aug 20 18:00' — no year in source data, assume the demo year used throughout the fixtures.
  if (!s || s === '—') return null;
  const d = new Date(`${s} ${year}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const parseDurationSeconds = (s) => {
  if (!s) return null;
  const h = /([\d.]+)\s*h/.exec(s);
  const m = /([\d.]+)\s*m(?!s)/.exec(s);
  let total = 0;
  if (h) total += parseFloat(h[1]) * 3600;
  if (m) total += parseFloat(m[1]) * 60;
  return total || null;
};

/** Batches rows into multiple INSERT statements of at most `chunkSize` rows each — a single
 * statement covering tens of thousands of rows (dmc_fields is 200k+) is a multi-MB string that's
 * unreliable to paste into a browser SQL editor; chunking keeps each statement a manageable size
 * without changing what actually gets inserted. */
function insertStatement(table, columns, rows, { chunkSize = 1000, onConflict = 'do nothing' } = {}) {
  if (rows.length === 0) return `-- ${table}: nothing to insert\n`;
  const statements = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk.map((r) => `  (${columns.map((c) => r[c]).join(', ')})`).join(',\n');
    statements.push(`insert into ${table} (${columns.join(', ')}) values\n${values}\non conflict ${onConflict};`);
  }
  return statements.join('\n') + '\n';
}

async function main() {
  const htmlText = await readFile(HTML_PATH, 'utf8');

  console.log('Reading DMC_COBJ / DMC_COBJT / DMC_DMOL_REF / DMC_SIN_SCOBJSEQ workbooks…');
  const dmcCobj = readSheet(DMC_COBJ_XLSX, 'Data');
  const dmcCobjt = readSheet(DMC_COBJT_XLSX, 'Data');
  const dmcDmolRef = readSheet(DMC_DMOL_REF_XLSX, 'DMC_DMOL_REF');
  const dmcSinScobjseq = readSheet(DMC_SIN_SCOBJSEQ_XLSX, 'Data');
  console.log(`  DMC_COBJ: ${dmcCobj.length} rows`);
  console.log(`  DMC_COBJT: ${dmcCobjt.length} rows`);
  console.log(`  DMC_DMOL_REF: ${dmcDmolRef.length} rows`);
  console.log(`  DMC_SIN_SCOBJSEQ: ${dmcSinScobjseq.length} rows`);

  console.log('Reading DMC_STREE / DMC_STREET / DMC_STRUCT / DMC_FIELD workbooks…');
  const dmcStree = readSheet(DMC_STREE_XLSX, 'Data');
  const dmcStreet = readSheet(DMC_STREET_XLSX, 'Data');
  const dmcStruct = readSheet(DMC_STRUCT_XLSX, 'Data');
  // split across 2 files upstream — combined here, deduped by GUID since the split overlapped
  // (DMC_FIELD_1 and DMC_FIELD_2 share ~36k identical rows at the boundary, not a clean split)
  const dmcField = [...new Map(
    [...readSheet(DMC_FIELD1_XLSX, 'Data'), ...readSheet(DMC_FIELD2_XLSX, 'Data')].map((r) => [r.GUID, r]),
  ).values()];
  console.log(`  DMC_STREE: ${dmcStree.length} rows`);
  console.log(`  DMC_STREET: ${dmcStreet.length} rows`);
  console.log(`  DMC_STRUCT: ${dmcStruct.length} rows`);
  console.log(`  DMC_FIELD: ${dmcField.length} rows (combined)`);

  console.log('Extracting prototype state…');
  const stateMarkerRe = /\n {2}state = \{/;
  const stateMatch = stateMarkerRe.exec(htmlText);
  if (!stateMatch) throw new Error('Could not locate the `state = {` class field');
  const openIndex = stateMatch.index + stateMatch[0].length - 1; // index of the '{'
  let stateLiteral = extractBalanced(htmlText, openIndex);
  // The only `this.` reference inside the state literal — substitute so it can be eval'd standalone.
  stateLiteral = stateLiteral.replace('this.props.defaultNav || ', '');
  const state = new Function(`return (${stateLiteral});`)();
  console.log('  state extracted OK');

  const out = [];
  out.push('-- Generated by scripts/build-seed.mjs — do not edit by hand, regenerate instead.');
  out.push('-- Source: design_handoff_dms_app/reference/dmc_data.js + .../Data Migration Solution v2.dc.html');
  out.push('-- Apply after 0001_init.sql and 0002_rls.sql.');
  out.push('');
  out.push('-- app_users/memberships inserts below are guarded against auth.users so this script is safe to');
  out.push('-- run before those people have signed up — matching rows populate once the emails exist in auth.users.');
  out.push('');

  // ── roles + role_screens (canonical matrix — mirrors src/lib/rbac.ts) ──
  const ROLES = [
    ['program_admin', 'Program Admin', 'Owns project setup, users and workflows.'],
    ['data_owner', 'Data Owner', 'Owns the data of one or more migration objects.'],
    ['data_governance_lead', 'Data Governance Lead', 'Approver for rules, field mappings and data quality.'],
    ['etl_lead', 'ETL Lead', 'Approver for extraction, transformation and load runs.'],
    ['etl_developer', 'ETL Developer', 'Builds and runs the migration jobs.'],
    ['cab', 'CAB', 'Change Advisory Board — final gate for promotion to PRD.'],
    ['end_user', 'End User', 'Read-only access for business reviewers.'],
    ['guest', 'Guest', 'Default role for newly added users until reassigned. No access until granted.'],
  ];
  // mirrors src/lib/rbac.ts's ROLE_SCREENS
  const ALL_SCREENS = [
    'myWork', 'programSettings', 'preparation', 'rules', 'referenceData', 'dashboard',
    'migration', 'quality', 'cutover', 'promotions', 'jobMonitor', 'catalogObjects',
    'catalogFmds', 'catalogRules', 'catalogXref', 'connections',
  ];
  const ROLE_SCREENS = {
    program_admin: 'all',
    data_owner: ['myWork', 'dashboard', 'preparation', 'rules', 'referenceData', 'quality', 'cutover', 'catalogObjects', 'catalogFmds', 'catalogRules', 'catalogXref'],
    etl_developer: ['myWork', 'dashboard', 'migration', 'quality', 'jobMonitor', 'catalogObjects'],
    etl_lead: ['myWork', 'dashboard', 'migration', 'quality', 'cutover', 'promotions', 'jobMonitor', 'connections', 'catalogObjects', 'catalogFmds', 'catalogRules', 'catalogXref'],
    data_governance_lead: ['myWork', 'dashboard', 'preparation', 'rules', 'referenceData', 'quality', 'promotions', 'catalogObjects', 'catalogFmds', 'catalogRules', 'catalogXref'],
    cab: ['myWork', 'dashboard', 'promotions', 'cutover'],
    end_user: ['myWork', 'dashboard'],
    guest: [],
  };

  out.push('-- ── roles ──');
  out.push(insertStatement('roles', ['id', 'name', 'description', 'is_standard'],
    ROLES.map(([id, name, desc]) => ({ id: q(id), name: q(name), description: q(desc), is_standard: 'true' }))));

  const roleScreenRows = [];
  for (const [roleId] of ROLES) {
    const screens = ROLE_SCREENS[roleId] === 'all' ? ALL_SCREENS : ROLE_SCREENS[roleId];
    for (const screen of screens) {
      roleScreenRows.push({
        role_id: q(roleId), screen_key: q(screen), can_view: 'true',
        can_edit: b(roleId !== 'end_user'),
      });
    }
  }
  out.push('-- ── role_screens ──');
  out.push(insertStatement('role_screens', ['role_id', 'screen_key', 'can_view', 'can_edit'], roleScreenRows));

  // computed early — migration_objects rows below are tagged with it (same natural key as the
  // 'programs' insert further down, so this is just the id, no duplicate insert)
  const programId = stableId('project:' + state.config.project.code);

  // ── migration_objects: real SAP DMC catalogue, from DMC_COBJ + DMC_COBJT + DMC_DMOL_REF ──
  // DMC_COBJT holds the authoritative per-language description (GUID + LANGU keyed); DMC_COBJ's
  // own "Description" column is a fallback for the rare case a GUID has no EN row. DMC_DMOL_REF
  // is SAP's published standard-object reference (IDENT keyed) — not every DMC_COBJ row has a
  // match there, since it also includes internal/replication/custom-ish objects.
  const enDescByGuid = new Map(
    dmcCobjt.filter((r) => r.LANGU === 'EN').map((r) => [r.GUID, r.DESCR]),
  );
  const dmolRefByIdent = new Map(dmcDmolRef.map((r) => [r.IDENT, r])); // last row wins on duplicate IDENT

  const migObjMap = new Map(); // ident -> uuid (last write wins if idents repeat)
  const catalogRows = dmcCobj.map((r) => {
    const id = stableId('mo-dmc:' + r.GUID);
    migObjMap.set(r.IDENT, id);
    const ref = dmolRefByIdent.get(r.IDENT);
    return {
      id: q(id), guid: q(r.GUID), object_id: q(r.IDENT), technical_name: q(r.COBJ_ALIAS || null),
      description: q(enDescByGuid.get(r.GUID) ?? r.Description ?? null),
      category: q(ref?.OBJECT_TYPE ?? 'Not classified'), approach: q(ref?.MIGRATION_APPROACH ?? 'Not classified'),
      component: q(ref?.COMPONENT ?? null), class: q('Global'), program_id: q(programId),
      scontainer: q(r.SCONTAINER || null), rcontainer: q(r.RCONTAINER || null),
      url: q(ref?.URL ?? null), custom_field_support: q(ref?.CUSTOM_FIELD_SUPPORT ?? null),
      analyze_selection: q(ref?.ANALYZE_SELECTION ?? null), invalid: b(r.INVALID === 'X'),
    };
  });
  out.push('-- ── migration_objects: real SAP DMC catalogue (from DMC_COBJ + DMC_COBJT + DMC_DMOL_REF) ──');
  out.push(insertStatement(
    'migration_objects',
    ['id', 'guid', 'object_id', 'technical_name', 'description', 'category', 'approach', 'component', 'class',
      'program_id', 'scontainer', 'rcontainer', 'url', 'custom_field_support', 'analyze_selection', 'invalid'],
    catalogRows,
  ));

  // ── dmc_structures + dmc_fields: sender/receiver structure tree + field list behind each real
  // DMC object, joined via SCONTAINER/RCONTAINER -> DMC_STREE.CONTAINER -> DMC_STRUCT (1:1 with
  // DMC_STREE via STREE.STRUCT = STRUCT.GUID) -> DMC_FIELD (via FIELD.DSTRUCTURE = STRUCT.GUID).
  // A single physical structure (e.g. a generic "HEADER" BAPI structure) can be reused across many
  // different objects, so ids are hashed with the owning migration object/structure folded in —
  // otherwise the second object to reference a shared structure/field would silently lose its row
  // to "on conflict do nothing" colliding on a primary key that ignored which object it belonged to.
  const enStreeDescByGuid = new Map(
    dmcStreet.filter((r) => r.LANGU === 'EN').map((r) => [r.GUID, r.DESCR]),
  );
  const streeByContainer = new Map(); // container guid -> stree rows
  for (const r of dmcStree) {
    if (!streeByContainer.has(r.CONTAINER)) streeByContainer.set(r.CONTAINER, []);
    streeByContainer.get(r.CONTAINER).push(r);
  }
  const structByGuid = new Map(dmcStruct.map((r) => [r.GUID, r]));
  const fieldsByStructure = new Map(); // DSTRUCTURE guid -> field rows
  for (const r of dmcField) {
    if (!fieldsByStructure.has(r.DSTRUCTURE)) fieldsByStructure.set(r.DSTRUCTURE, []);
    fieldsByStructure.get(r.DSTRUCTURE).push(r);
  }

  const structureRows = [];
  const fieldRows = [];
  for (const r of dmcCobj) {
    const moId = stableId('mo-dmc:' + r.GUID);
    const sides = [{ container: r.SCONTAINER, side: 'sender' }, { container: r.RCONTAINER, side: 'receiver' }];
    for (const { container, side } of sides) {
      if (!container) continue;
      for (const stree of streeByContainer.get(container) ?? []) {
        const struct = structByGuid.get(stree.STRUCT);
        if (!struct) continue;
        const structureId = stableId('dmc-structure:' + moId + ':' + stree.GUID);
        structureRows.push({
          id: q(structureId), migration_object_id: q(moId), side: q(side), guid: q(stree.GUID),
          struct_guid: q(struct.GUID), ident: q(stree.IDENT),
          description: q(enStreeDescByGuid.get(stree.GUID) ?? stree.Description ?? struct.DESCR ?? null),
          seq: n(parseNum(stree.SEQNUM)), level: n(parseNum(stree.STRUCLEVEL)), parent_guid: q(stree.PARENTID || null),
          ddic_name: q(struct.DDICNAME || null), tab_class: q(struct.TABCLASS || null), technical: b(struct.TECHNICAL === 'X'),
        });
        for (const f of fieldsByStructure.get(struct.GUID) ?? []) {
          fieldRows.push({
            id: q(stableId('dmc-field:' + structureId + ':' + f.GUID)), structure_id: q(structureId), field_name: q(f.FIELDNAME),
            seq: n(parseNum(f.POS)), key_flag: b(f.KEYFLAG === 'X'), data_type: q(f.DATATYPE || null),
            length: n(parseNum(f.LEN)), output_length: n(parseNum(f.OUTPUTLEN)), decimals: n(parseNum(f.DECS)),
            dom_name: q(f.DOMNAME || null), roll_name: q(f.ROLLNAME || null), check_table: q(f.CHECKTABLE || null),
            description: q(f.SCRTEXT_L || f.DESCR || null),
          });
        }
      }
    }
  }
  // dmc_structures (8,809 rows) and dmc_fields (170k+ rows) are NOT emitted into seed.sql or
  // part files — even the smaller dmc_structures insert was unreliable via the SQL editor (a
  // 2-3MB pasted query silently fails there). Both load via scripts/load-dmc-structures-fields.mjs
  // instead, which hits the Supabase API directly using these exact same row shapes/ids —
  // `npm run seed:load-structures` after this file has been applied.
  out.push(`-- ── dmc_structures (${structureRows.length} rows) + dmc_fields (${fieldRows.length} rows) ──`);
  out.push('-- Not included here — run `npm run seed:load-structures` after this file (see scripts/load-dmc-structures-fields.mjs).');
  out.push('');

  // ── synthetic wave-scope objects — the prototype's demo scope (MARA, MARC, …) uses bare SAP table
  // mnemonics as identifiers, not DMC idents, so we add them as additional catalogue rows the wave
  // can reference. guid stays null to keep them clearly distinct from the real DMC import above.
  const scopeRows = state.config.releases[0].waves[0].scope; // Wave 1A
  const SYNTHETIC_COMPONENT = { MARA: 'MM', MARC: 'MM', MBEW: 'MM', MVKE: 'SD', MARM: 'MM', MLGN: 'WM' };
  const migObjSyntheticMap = new Map(); // table code -> uuid
  const syntheticRows = scopeRows.map((s) => {
    const id = stableId('mo-synthetic:' + s.table);
    migObjSyntheticMap.set(s.table, id);
    return {
      id: q(id), guid: 'null', object_id: q(s.table), technical_name: q(s.table), description: q(s.name),
      category: q('Master data'), approach: q('Not classified'), component: q(SYNTHETIC_COMPONENT[s.table] ?? null),
      class: q('Global'), program_id: q(programId),
    };
  });
  out.push('-- ── migration_objects: synthetic wave-scope objects (demo scope, keyed by SAP table code) ──');
  out.push(insertStatement(
    'migration_objects',
    ['id', 'guid', 'object_id', 'technical_name', 'description', 'category', 'approach', 'component', 'class', 'program_id'],
    syntheticRows,
  ));

  // ── object_dependencies (real, from DMC_SIN_SCOBJSEQ — IDENT-keyed: TEMPL_COBJ requires
  // PREDECESSOR, PREDEC_MANDATORY flags whether it's blocking or advisory) ──
  const depRows = [];
  let depSkipped = 0;
  for (const r of dmcSinScobjseq) {
    const objId = migObjMap.get(r.TEMPL_COBJ);
    const prereqId = r.PREDECESSOR ? migObjMap.get(r.PREDECESSOR) : null;
    if (!objId || !prereqId) { depSkipped++; continue; }
    depRows.push({ migration_object_id: q(objId), requires_object_id: q(prereqId), mandatory: b(r.PREDEC_MANDATORY === 'X') });
  }
  out.push(`-- ── object_dependencies (${depSkipped} pairs skipped — ident not present in DMC_COBJ) ──`);
  // do-update (not do-nothing): these rows have existed since the very first seed run (same
  // deterministic ids, since DMC_COBJ hasn't changed), so a plain do-nothing insert would leave
  // `mandatory` stuck at its column default forever instead of picking up the real source value.
  out.push(insertStatement('object_dependencies', ['migration_object_id', 'requires_object_id', 'mandatory'], depRows, {
    onConflict: '(migration_object_id, requires_object_id) do update set mandatory = excluded.mandatory',
  }));

  // ── programme hierarchy: program / projects / subprojects / cycles ──
  // Local variable/DB-column names below follow the new Program > Project > Subproject > Cycle
  // naming, but every stableId() natural-key string is left exactly as it was (still 'project:',
  // 'release:', 'wave:', …) so ids stay identical to what's already live after migration
  // 0008_program_hierarchy.sql renames the underlying tables/columns in place — re-running this
  // script against an already-seeded database still no-ops via "on conflict do nothing" instead
  // of inserting duplicates under new ids.
  const proj = state.config.project;
  out.push('-- ── programs ──');
  out.push(insertStatement('programs', ['id', 'code', 'name', 'description', 'start_date'], [{
    id: q(programId), code: q(proj.code), name: q(proj.name), description: q(proj.description),
    start_date: q(toIsoDate(proj.start)),
  }]));

  const projectMap = new Map();
  const subprojectMap = new Map();
  const cycleMap = new Map();
  const projectRows = [];
  const subprojectRows = [];
  const cycleRows = [];
  state.config.releases.forEach((r, ri) => {
    const projectId = stableId('release:' + r.code);
    projectMap.set(r.id, projectId);
    projectRows.push({
      id: q(projectId), program_id: q(programId), code: q(r.code), name: q(r.name), description: q(r.description),
      start_date: q(toIsoDate(r.start)), seq: n(ri + 1),
    });
    (r.waves ?? []).forEach((w, wi) => {
      const subprojectId = stableId('wave:' + w.code);
      subprojectMap.set(w.id, subprojectId);
      subprojectRows.push({
        id: q(subprojectId), project_id: q(projectId), code: q(w.code), name: q(w.name), description: q(w.description),
        start_date: q(toIsoDate(w.start)), freeze_date: q(toIsoDate(w.freeze)),
        scope_finalized: b(!!w.scopeFinalized), seq: n(wi + 1),
      });
      (w.cycles ?? []).forEach((c) => {
        const cycleId = stableId('cycle:' + w.code + ':' + c.id);
        cycleMap.set(c.id, cycleId);
        cycleRows.push({
          id: q(cycleId), subproject_id: q(subprojectId), name: q(c.name), seq: n(c.seq), description: q(c.description),
          mig_start: q(toIsoDate(c.migStart)), mig_end: q(toIsoDate(c.migEnd)), data_freeze: q(toIsoDate(c.dataFreezeDate)),
        });
      });
    });
  });
  out.push('-- ── projects ──');
  out.push(insertStatement('projects', ['id', 'program_id', 'code', 'name', 'description', 'start_date', 'seq'], projectRows));
  out.push('-- ── subprojects ──');
  out.push(insertStatement('subprojects', ['id', 'project_id', 'code', 'name', 'description', 'start_date', 'freeze_date', 'scope_finalized', 'seq'], subprojectRows));
  out.push('-- ── cycles ──');
  out.push(insertStatement('cycles', ['id', 'subproject_id', 'name', 'seq', 'description', 'mig_start', 'mig_end', 'data_freeze'], cycleRows));

  const subproject1Id = subprojectMap.get('w1'); // Subproject 1A — the only subproject with real demo depth in the prototype

  // ── subproject_objects (Subproject 1A scope) ──
  const subprojectObjectRows = scopeRows.map((s) => ({
    id: q(stableId('wave-object:' + s.table)), subproject_id: q(subproject1Id), migration_object_id: q(migObjSyntheticMap.get(s.table)),
    in_scope: b(s.scopeLabel === 'In Scope'), approach: q(state.objectApproach[s.table] ?? null),
    load_seq: 'null', owner: q(s.owner === '—' ? null : s.owner), waiver_reason: 'null',
  }));
  out.push('-- ── subproject_objects (Subproject 1A scope) ──');
  out.push(insertStatement('subproject_objects', ['id', 'subproject_id', 'migration_object_id', 'in_scope', 'approach', 'load_seq', 'owner', 'waiver_reason'], subprojectObjectRows));

  // ── object_structures ──
  const structRows = [];
  for (const [table, structs] of Object.entries(state.objectStructures)) {
    const migObjId = migObjSyntheticMap.get(table);
    if (!migObjId) continue;
    for (const s of structs) {
      structRows.push({
        id: q(stableId('object-structure:' + s.id)), migration_object_id: q(migObjId), name: q(s.name), table_name: q(s.table),
        seq: n(s.seq), fields: n(s.fields), mapped: n(s.mapped), mandatory: b(s.mandatory), owner: q(s.owner),
        status: q(s.status),
      });
    }
  }
  out.push('-- ── object_structures ──');
  out.push(insertStatement('object_structures', ['id', 'migration_object_id', 'name', 'table_name', 'seq', 'fields', 'mapped', 'mandatory', 'owner', 'status'], structRows));

  // fmds/fmd_versions are no longer seeded with fixture data — the FMD list starts empty and is
  // populated by real Standard FMDs (created per-object during scoping) and Golden FMDs (built
  // via the Golden FMD Designer in Library > Field Mapping).

  // ── connections (state.landscape) ──
  const connectionMap = new Map(); // sid -> uuid
  const connectionRows = state.landscape.map((c) => {
    const id = stableId('connection:' + c.sid);
    connectionMap.set(c.sid, id);
    return {
      id: q(id), program_id: q(programId), sid: q(c.sid), description: q(c.desc), type: q(c.type),
      host: q(c.host), client: q(c.client === '—' ? null : c.client), role: q(c.role), envs: q(c.envs),
      status: q(c.status),
    };
  });
  out.push('-- ── connections ──');
  out.push(insertStatement('connections', ['id', 'program_id', 'sid', 'description', 'type', 'host', 'client', 'role', 'envs', 'status'], connectionRows));

  // extractTables/criteriaDefs reference connections by an informal system *name*, not SID — map by hand.
  const SYSTEM_TO_SID = { 'SAP ECC 6.0': 'ECP', 'Legacy Oracle WMS': 'WMS', 'SFTP Legacy Files': 'SFT', 'SAP S/4HANA 2023': 'S4D' };
  const connIdBySystem = (system) => connectionMap.get(SYSTEM_TO_SID[system]) ?? null;

  // ── staging_db ──
  out.push('-- ── staging_db ──');
  out.push(insertStatement('staging_db', ['subproject_id', 'engine', 'host', 'schema_name', 'retention', 'owner', 'last_ingestion'], [{
    subproject_id: q(subproject1Id), engine: q(state.stagingDb.engine), host: q(state.stagingDb.host),
    schema_name: q(state.stagingDb.schema), retention: q(state.stagingDb.retention), owner: q(state.stagingDb.owner),
    last_ingestion: q(parseDate(state.stagingDb.lastIngestion)),
  }]));

  // ── source_tables (state.extractTables) ──
  const sourceTableIdByName = new Map(); // table name -> raw uuid (used below for staging_rows)
  const sourceTableRows = state.extractTables
    .map((t) => {
      const connId = connIdBySystem(t.system);
      if (!connId) return null;
      const id = stableId('source-table:' + t.name + ':' + t.system);
      sourceTableIdByName.set(t.name, { id, status: t.status });
      return {
        id: q(id), subproject_id: q(subproject1Id), connection_id: q(connId), name: q(t.name), tier: q(t.tier),
        in_scope: b(t.inScope), records: n(parseNum(t.records)), expected: 'null', status: q(t.status),
        extracted_on: q(parseDate(t.extractedOn)), executed_by: q(t.executedBy === '—' ? null : t.executedBy),
        duration_s: 'null', snapshot: 'null', dq_score: 'null', load_type: 'null',
      };
    })
    .filter(Boolean);
  out.push('-- ── source_tables ──');
  out.push(insertStatement('source_tables', ['id', 'subproject_id', 'connection_id', 'name', 'tier', 'in_scope', 'records', 'expected', 'status', 'extracted_on', 'executed_by', 'duration_s', 'snapshot', 'dq_score', 'load_type'], sourceTableRows));

  // ── staging_rows: a handful of representative rows per extracted source table, so the
  // Pipelines designer's Data preview tab can query real data instead of always falling back
  // to its synthetic generator. Column sets mirror src/features/pipelines/dataPreview.ts.
  const STAGING_COLUMN_SETS = {
    MARA: ['MATNR', 'MTART', 'MEINS', 'MATKL', 'BRGEW', 'LVORM'],
    MAKT: ['MATNR', 'SPRAS', 'MAKTX'],
    MARC: ['MATNR', 'WERKS', 'DISPO', 'EKGRP'],
    MARD: ['MATNR', 'WERKS', 'LGORT'],
    MBEW: ['MATNR', 'BWKEY', 'BKLAS', 'SALK3'],
    MARM: ['MATNR', 'MEINH', 'UMREZ', 'UMREN'],
    MVKE: ['MATNR', 'VKORG', 'VTWEG', 'VERSG'],
  };
  const stagingRowRows = [];
  for (const [name, info] of sourceTableIdByName) {
    if (info.status !== 'Extracted') continue;
    const base = name.replace(/\.[A-Za-z0-9]+$/, '').toUpperCase();
    const columns = STAGING_COLUMN_SETS[base];
    if (!columns) continue; // no plausible SAP-shaped column set for this table (legacy files, GL, etc.)
    for (let i = 0; i < 8; i++) {
      const rowData = Object.fromEntries(columns.map((c) => [c, seededPreviewValue(name, c, i)]));
      stagingRowRows.push({ id: q(stableId('staging-row:' + name + ':' + i)), source_table_id: q(info.id), seq: n(i + 1), row_data: q(JSON.stringify(rowData)) + '::jsonb' });
    }
  }
  out.push('-- ── staging_rows ──');
  out.push(insertStatement('staging_rows', ['id', 'source_table_id', 'seq', 'row_data'], stagingRowRows));

  // ── selection_criteria (state.criteriaDefs) ──
  const criteriaRows = state.criteriaDefs.map((c) => ({
    id: q(stableId('criteria:' + c.id)), subproject_id: q(subproject1Id), connection_id: q(connIdBySystem(c.system)), table_name: q(c.table),
    mode: q(c.mode), field: q(c.field === '—' ? null : c.field), condition: q(c.condition), value: q(c.value),
    scope: q(c.scope),
  }));
  out.push('-- ── selection_criteria ──');
  out.push(insertStatement('selection_criteria', ['id', 'subproject_id', 'connection_id', 'table_name', 'mode', 'field', 'condition', 'value', 'scope'], criteriaRows));

  // ── rules (state.rules) ──
  const RULE_STATUS = { Active: 'Approved', Draft: 'Draft', Inactive: 'Rejected' };
  // schema's rules.type check constraint only allows these three; the prototype also uses
  // 'Standardization' and 'Cleansing', which fold into 'Validation' here.
  const RULE_TYPES = new Set(['Validation', 'Transformation', 'Enrichment']);
  const ruleRows = state.rules.map((r, i) => ({
    id: q(stableId('rule:' + r.id)), subproject_id: q(subproject1Id), code: q(r.id), name: q(r.name),
    migration_object_id: q(migObjSyntheticMap.get(r.object) ?? null),
    type: q(RULE_TYPES.has(r.type) ? r.type : 'Validation'),
    severity: q(r.severity), status: q(RULE_STATUS[r.status] ?? 'Draft'), expression: 'null',
    owner: q(r.owners?.[0] ?? null), version: q(r.version), class: q(i === 0 ? 'Global' : 'Local'),
  }));
  out.push('-- ── rules ──');
  out.push(insertStatement('rules', ['id', 'subproject_id', 'code', 'name', 'migration_object_id', 'type', 'severity', 'status', 'expression', 'owner', 'version', 'class'], ruleRows, {
    onConflict: '(id) do update set class = excluded.class',
  }));

  // ── xref_tables + xref_rows (state.xrefs) ──
  const xrefTableRows = [];
  const xrefRowRows = [];
  state.xrefs.forEach((x, xi) => {
    const xrefId = stableId('xref-table:' + x.id);
    xrefTableRows.push({ id: q(xrefId), subproject_id: q(subproject1Id), name: q(x.name), purpose: q(x.desc), version: q(x.version), class: q(xi === 0 ? 'Global' : 'Local') });
    x.rows.forEach((row, i) => {
      xrefRowRows.push({
        id: q(stableId('xref-row:' + x.id + ':' + i)), xref_table_id: q(xrefId), legacy_value: q(row.source), s4_value: q(row.target),
        valid_from: 'null', status: q('Active'),
      });
    });
  });
  out.push('-- ── xref_tables ──');
  out.push(insertStatement('xref_tables', ['id', 'subproject_id', 'name', 'purpose', 'version', 'class'], xrefTableRows, {
    onConflict: '(id) do update set class = excluded.class',
  }));
  out.push('-- ── xref_rows ──');
  out.push(insertStatement('xref_rows', ['id', 'xref_table_id', 'legacy_value', 's4_value', 'valid_from', 'status'], xrefRowRows));

  // ── ETL designer: etl_objects / etl_nodes / etl_edges / etl_globals ──
  const etlObjectMap = new Map();
  const etlObjectRows = state.dsObjects.map((o) => {
    const id = stableId('etl-object:' + o.id);
    etlObjectMap.set(o.id, id);
    return { __obj: o, id };
  });
  out.push('-- ── etl_objects ──');
  out.push(insertStatement('etl_objects', ['id', 'subproject_id', 'type', 'name', 'parent_id', 'meta'],
    etlObjectRows.map(({ __obj: o, id }) => ({
      id: q(id), subproject_id: q(subproject1Id), type: q(o.type), name: q(o.name),
      parent_id: q(o.parent ? etlObjectMap.get(o.parent) ?? null : null), meta: q(o.meta ?? null),
    }))));

  const etlNodeMap = new Map();
  const etlNodeRows = [];
  const etlEdgeRows = [];
  for (const [graphKey, graph] of Object.entries(state.dsGraphs)) {
    const objectId = etlObjectMap.get(graphKey);
    if (!objectId) continue;
    for (const node of graph.nodes) {
      const nodeId = stableId('etl-node:' + graphKey + ':' + node.id);
      etlNodeMap.set(graphKey + '::' + node.id, nodeId);
      const data = { ...node.data };
      if (data.ref) data.ref = etlObjectMap.get(data.ref) ?? data.ref;
      etlNodeRows.push({
        id: q(nodeId), object_id: q(objectId), type: q(node.type), name: q(node.name),
        x: n(node.x), y: n(node.y), w: n(node.w), h: n(node.h),
        ref_object_id: q(node.data?.ref ? etlObjectMap.get(node.data.ref) ?? null : null),
        data: q(JSON.stringify(data)) + '::jsonb',
      });
    }
    for (const edge of graph.edges) {
      const fromId = etlNodeMap.get(graphKey + '::' + edge.from);
      const toId = etlNodeMap.get(graphKey + '::' + edge.to);
      if (!fromId || !toId) continue;
      etlEdgeRows.push({
        id: q(stableId('etl-edge:' + graphKey + ':' + edge.id)), object_id: q(objectId), from_node: q(fromId), to_node: q(toId),
        condition: q(edge.condition || ''),
      });
    }
  }
  out.push('-- ── etl_nodes ──');
  out.push(insertStatement('etl_nodes', ['id', 'object_id', 'type', 'name', 'x', 'y', 'w', 'h', 'ref_object_id', 'data'], etlNodeRows));
  out.push('-- ── etl_edges ──');
  out.push(insertStatement('etl_edges', ['id', 'object_id', 'from_node', 'to_node', 'condition'], etlEdgeRows));

  const etlGlobalRows = state.dsGlobals.map((g) => ({
    id: q(stableId('etl-global:' + g.name)), subproject_id: q(subproject1Id), name: q(g.name), type: q(g.type), value: q(g.value ?? null),
  }));
  out.push('-- ── etl_globals ──');
  out.push(insertStatement('etl_globals', ['id', 'subproject_id', 'name', 'type', 'value'], etlGlobalRows));

  // ── runs (state.runs) ──
  const cycleNameMap = new Map(cycleRows.map((c) => [c.name.slice(1, -1), c.id])); // name (quoted) -> quoted id
  const runRows = state.runs.map((r) => ({
    id: q(stableId('run:' + r.id)), code: q(r.id), subproject_id: q(subproject1Id), cycle_id: cycleNameMap.get(r.cycle) ?? 'null',
    etl_object_id: 'null', migration_object_id: q(migObjSyntheticMap.get(r.object) ?? null),
    iteration: n(r.iter), mode: q(r.mode), env: q(r.env), target: q(r.target), approach: q(r.approach),
    fmd_version: q(r.fmd), rules_version: q(r.rules), xref_version: q(r.xref), staging_snapshot: q(r.staging),
    started_at: q(parseDate(r.started)), duration_s: n(parseDurationSeconds(r.duration)), run_by: q(r.by),
    src_count: n(r.src), tgt_count: n(r.tgt), rej_count: n(r.rej), status: q(r.status),
  }));
  out.push('-- ── runs ──');
  out.push(insertStatement('runs', ['id', 'code', 'subproject_id', 'cycle_id', 'etl_object_id', 'migration_object_id', 'iteration', 'mode', 'env', 'target', 'approach', 'fmd_version', 'rules_version', 'xref_version', 'staging_snapshot', 'started_at', 'duration_s', 'run_by', 'src_count', 'tgt_count', 'rej_count', 'status'], runRows));

  // ── cutover_tasks (state.cutoverPlan — has start/end pairs matching our schema) ──
  const cutoverIdMap = new Map(state.cutoverPlan.map((t) => [t.id, stableId('cutover:' + t.id)]));
  const cutoverRows = state.cutoverPlan.map((t, i) => ({
    id: q(cutoverIdMap.get(t.id)), subproject_id: q(subproject1Id), seq: n(i + 1), name: q(t.task), owner: q(t.owner),
    planned_start: q(parseShortDate(t.start)), planned_end: q(parseShortDate(t.end)),
    depends_on: q(t.dependsOn && t.dependsOn !== '—' ? cutoverIdMap.get(t.dependsOn) ?? null : null),
    status: q(t.status),
  }));
  out.push('-- ── cutover_tasks ──');
  out.push(insertStatement('cutover_tasks', ['id', 'subproject_id', 'seq', 'name', 'owner', 'planned_start', 'planned_end', 'depends_on', 'status'], cutoverRows));

  // ── approval_matrix (state.workflows — area/action approval rules) ──
  const APPROVER_TO_ROLE = {
    'Program Admin': 'program_admin', 'Data Owner': 'data_owner', 'Data Governance Lead': 'data_governance_lead',
    'ETL Lead': 'etl_lead', 'ETL Developer': 'etl_developer', 'CAB': 'cab',
  };
  const approvalRows = [];
  for (const area of state.workflows) {
    for (const action of area.actions) {
      approvalRows.push({
        id: q(stableId('approval:' + area.area + ':' + action.key)), program_id: q(programId), area: q(area.area), action: q(action.key),
        approval_required: b(action.approval), approver_role_id: q(APPROVER_TO_ROLE[action.approver] ?? null),
      });
    }
  }
  out.push('-- ── approval_matrix ──');
  out.push(insertStatement('approval_matrix', ['id', 'program_id', 'area', 'action', 'approval_required', 'approver_role_id'], approvalRows));

  // ── promotions (state.promotions) — only rows whose type maps onto our artefact_type enum ──
  const PROMO_TYPE = { 'Field Mapping Document': 'fmd', 'Rule': 'rules', 'Value Mapping': 'xref' };
  const promotionRows = state.promotions
    .filter((p) => PROMO_TYPE[p.type])
    .map((p) => ({
      id: q(stableId('promotion:' + p.id)), subproject_id: q(subproject1Id), artefact_type: q(PROMO_TYPE[p.type]), artefact_id: 'null',
      artefact_name: q(p.artifact), from_env: q(normalizeEnv(p.from)), to_env: q(normalizeEnv(p.to)),
      requested_by: q(p.requestedBy), requested_at: q(parseDate(p.date)), status: q(p.status),
    }));
  out.push('-- ── promotions ──');
  out.push(insertStatement('promotions', ['id', 'subproject_id', 'artefact_type', 'artefact_id', 'artefact_name', 'from_env', 'to_env', 'requested_by', 'requested_at', 'status'], promotionRows));

  // ── check_tables + check_table_rows (state.referenceTables / state.referenceTableRows) ──
  const checkTableRows = [];
  const checkTableRowRows = [];
  for (const t of state.referenceTables ?? []) {
    const id = stableId('check-table:' + t.table);
    const detail = (state.referenceTableRows ?? {})[t.table];
    checkTableRows.push({
      id: q(id), subproject_id: q(subproject1Id), table_name: q(t.table), domain: q(t.domain ?? null), field: q(t.field ?? null),
      used_by: q(t.usedBy ?? null), description: q(t.desc ?? null), columns: pgTextArray(detail?.cols ?? []),
    });
    (detail?.rows ?? []).forEach((row, i) => {
      checkTableRowRows.push({ id: q(stableId('check-table-row:' + t.table + ':' + i)), check_table_id: q(id), seq: n(i + 1), values: pgTextArray(row) });
    });
  }
  out.push('-- ── check_tables ──');
  out.push(insertStatement('check_tables', ['id', 'subproject_id', 'table_name', 'domain', 'field', 'used_by', 'description', 'columns'], checkTableRows));
  out.push('-- ── check_table_rows ──');
  out.push(insertStatement('check_table_rows', ['id', 'check_table_id', 'seq', 'values'], checkTableRowRows));

  // ── golden_library (state.goldenFmdVersions / state.goldenXrefVersions) ──
  const goldenRows = [
    ...(state.goldenFmdVersions ?? []).map((g) => ({ ...g, kind: 'fmd' })),
    ...(state.goldenXrefVersions ?? []).map((g) => ({ ...g, kind: 'xref' })),
  ].map((g) => ({
    id: q(stableId('golden:' + (g.guid ?? g.name))), program_id: q(programId), kind: q(g.kind), name: q(g.name), reference: q(g.reference ?? null),
    version: q(g.version ?? null), created_by: q(g.createdBy ?? null), created_at: q(parseDmyHms(g.createdOn, g.createdAt)),
    changed_by: q(g.changedBy ?? null), changed_at: q(parseDmyHms(g.changedOn, g.changedAt)),
  }));
  out.push('-- ── golden_library ──');
  out.push(insertStatement('golden_library', ['id', 'program_id', 'kind', 'name', 'reference', 'version', 'created_by', 'created_at', 'changed_by', 'changed_at'], goldenRows));

  // ── unmapped_values (state.unmapped) — artifact-aligned addition ──
  const unmappedRows = (state.unmapped ?? []).map((u) => ({
    id: q(stableId('unmapped:' + u.id)), subproject_id: q(subproject1Id), set_name: q(u.set), migration_object_id: q(migObjSyntheticMap.get(u.object) ?? null),
    field: q(u.field ?? null), value: q(u.value), occurrences: n(u.occurrences ?? 0), owner: q(u.owner ?? null),
    status: q(u.status), suggestion: q(u.suggestion === '—' ? null : u.suggestion ?? null),
  }));
  out.push('-- ── unmapped_values ──');
  out.push(insertStatement('unmapped_values', ['id', 'subproject_id', 'set_name', 'migration_object_id', 'field', 'value', 'occurrences', 'owner', 'status', 'suggestion'], unmappedRows));

  // ── timeline_categories + timeline_entries (state.timelineCats / state.timelineEntries) — artifact-aligned addition ──
  const timelineCatIdMap = new Map((state.timelineCats ?? []).map((c) => [c.id, stableId('timeline-cat:' + c.id)]));
  const timelineCatRows = (state.timelineCats ?? []).map((c, i) => ({
    id: q(timelineCatIdMap.get(c.id)), program_id: q(programId), name: q(c.name), seq: n(i + 1),
  }));
  out.push('-- ── timeline_categories ──');
  out.push(insertStatement('timeline_categories', ['id', 'program_id', 'name', 'seq'], timelineCatRows));

  const timelineEntryRows = (state.timelineEntries ?? [])
    .filter((e) => timelineCatIdMap.has(e.cat))
    .map((e) => ({
      id: q(stableId('timeline-entry:' + e.id)), category_id: q(timelineCatIdMap.get(e.cat)), row_label: q(e.row), name: q(e.name),
      kind: q(e.type), icon: q(e.icon || null), start_date: q(toIsoDate(e.start) ?? null), end_date: q(toIsoDate(e.end) ?? null),
    }));
  out.push('-- ── timeline_entries ──');
  out.push(insertStatement('timeline_entries', ['id', 'category_id', 'row_label', 'name', 'kind', 'icon', 'start_date', 'end_date'], timelineEntryRows));

  // ── app_users + memberships — guarded against auth.users by email match (see header comment) ──
  const ROLE_LABEL_TO_ID = {
    'Program Admin': 'program_admin', 'Data Governance': 'data_governance_lead', 'Business Owner': 'data_owner',
    'ETL Developer': 'etl_developer',
  };
  out.push('-- ── app_users (only populates for emails that already exist in auth.users) ──');
  for (const u of state.users) {
    out.push(
      `insert into app_users (id, name, email, status)\n` +
      `select id, ${q(u.name)}, ${q(u.email)}, ${q(u.status)} from auth.users where email = ${q(u.email)}\n` +
      `on conflict (id) do nothing;`,
    );
  }
  out.push('');
  out.push('-- ── memberships (programme-wide, subproject_id null) — same auth.users guard as above ──');
  for (const u of state.users) {
    const roleId = ROLE_LABEL_TO_ID[u.role] ?? 'end_user';
    out.push(
      `insert into memberships (id, user_id, program_id, subproject_id, role_id)\n` +
      `select ${q(stableId('membership:' + u.email))}, au.id, ${q(programId)}, null, ${q(roleId)} from app_users au where au.email = ${q(u.email)}\n` +
      `on conflict (id) do nothing;`,
    );
  }
  out.push('');

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, out.join('\n') + '\n', 'utf8');
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`  migration_objects: ${catalogRows.length + syntheticRows.length} (${catalogRows.length} DMC + ${syntheticRows.length} synthetic)`);
  console.log(`  dmc_structures: ${structureRows.length}, dmc_fields: ${fieldRows.length}`);
  console.log(`  object_dependencies: ${depRows.length}`);
  console.log(`  projects: ${projectRows.length}, subprojects: ${subprojectRows.length}, cycles: ${cycleRows.length}`);
  console.log(`  connections: ${connectionRows.length}, source_tables: ${sourceTableRows.length}, selection_criteria: ${criteriaRows.length}`);
  console.log(`  subproject_objects: ${subprojectObjectRows.length}, object_structures: ${structRows.length}`);
  console.log(`  rules: ${ruleRows.length}, xref_tables: ${xrefTableRows.length}, xref_rows: ${xrefRowRows.length}`);
  console.log(`  etl_objects: ${etlObjectRows.length}, etl_nodes: ${etlNodeRows.length}, etl_edges: ${etlEdgeRows.length}, etl_globals: ${etlGlobalRows.length}`);
  console.log(`  runs: ${runRows.length}, cutover_tasks: ${cutoverRows.length}, approval_matrix: ${approvalRows.length}, promotions: ${promotionRows.length}`);
  console.log(`  check_tables: ${checkTableRows.length}, check_table_rows: ${checkTableRowRows.length}, golden_library: ${goldenRows.length}`);
  console.log(`  unmapped_values: ${unmappedRows.length}, timeline_categories: ${timelineCatRows.length}, timeline_entries: ${timelineEntryRows.length}`);
  console.log(`  users: ${state.users.length} (guarded inserts — populate once matching auth.users rows exist)`);
}

function toIsoDate(s) {
  // 'DD.MM.YYYY' -> 'YYYY-MM-DD'; '31.12.9999' stays a valid (far-future) date.
  if (!s) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function normalizeEnv(s) {
  if (!s) return null;
  const m = /^(DEV|QSA|PRD)/.exec(s);
  return m ? m[1] : null;
}

function pgTextArray(arr) {
  if (!arr || arr.length === 0) return 'ARRAY[]::text[]';
  return `ARRAY[${arr.map((v) => q(String(v))).join(', ')}]::text[]`;
}

function parseDmyHms(dmy, hms) {
  const iso = toIsoDate(dmy);
  if (!iso) return null;
  return `${iso} ${hms || '00:00:00'}`;
}

function seededPreviewValue(seed, col, row) {
  const n = Array.from(seed + col).reduce((a, c) => a + c.charCodeAt(0), 0) + row * 7;
  if (/QTY|CNT|AMOUNT|SAL|HSL|UMRE/.test(col)) return String(1000 + (n % 90000));
  if (col === 'MATNR') return String(100000000 + n).slice(0, 12);
  if (col === 'SPRAS') return n % 2 === 0 ? 'E' : 'D';
  if (col === 'LVORM') return n % 5 === 0 ? 'X' : '';
  return `${col}_${(n % 999).toString().padStart(3, '0')}`;
}

main().catch((err) => { console.error(err); process.exit(1); });

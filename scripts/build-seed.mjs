#!/usr/bin/env node
/**
 * Generates supabase/seed/seed.sql from the design prototype's fixture data.
 *
 * Sources (read at runtime, never copied by hand — see design_handoff_dms_app/supabase/seed/README.md):
 *   - design_handoff_dms_app/reference/dmc_data.js                    (real SAP DMC catalogue export)
 *   - design_handoff_dms_app/reference/Data Migration Solution v2.dc.html  (prototype's `state = {...}` class field)
 *
 * Run: node scripts/build-seed.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const DMC_PATH = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_data.js');
const HTML_PATH = path.join(ROOT, 'design_handoff_dms_app/reference/Data Migration Solution v2.dc.html');
const OUT_PATH = path.join(ROOT, 'supabase/seed/seed.sql');

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

function extractNamedExport(text, name) {
  const marker = `export const ${name} = `;
  const idx = text.indexOf(marker);
  if (idx === -1) throw new Error(`export ${name} not found`);
  const openIndex = idx + marker.length;
  const literal = extractBalanced(text, openIndex);
  return new Function(`return (${literal});`)();
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

function insertStatement(table, columns, rows) {
  if (rows.length === 0) return `-- ${table}: nothing to insert\n`;
  const values = rows.map((r) => `  (${columns.map((c) => r[c]).join(', ')})`).join(',\n');
  return `insert into ${table} (${columns.join(', ')}) values\n${values}\non conflict do nothing;\n`;
}

async function main() {
  const dmcText = await readFile(DMC_PATH, 'utf8');
  const htmlText = await readFile(HTML_PATH, 'utf8');

  console.log('Extracting DMC_CATALOG and DMC_DEPENDENCIES…');
  const DMC_CATALOG = extractNamedExport(dmcText, 'DMC_CATALOG');
  const DMC_DEPENDENCIES = extractNamedExport(dmcText, 'DMC_DEPENDENCIES');
  console.log(`  DMC_CATALOG: ${DMC_CATALOG.length} rows`);
  console.log(`  DMC_DEPENDENCIES: ${Object.keys(DMC_DEPENDENCIES).length} keys`);

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
    'myWork', 'projectSettings', 'preparation', 'rules', 'referenceData', 'dashboard',
    'migration', 'quality', 'cutover', 'promotions', 'jobMonitor', 'catalogObjects',
    'catalogFmds', 'catalogRules', 'connections',
  ];
  const ROLE_SCREENS = {
    program_admin: 'all',
    data_owner: ['myWork', 'dashboard', 'preparation', 'rules', 'referenceData', 'quality', 'cutover', 'catalogObjects', 'catalogFmds', 'catalogRules'],
    etl_developer: ['myWork', 'dashboard', 'migration', 'quality', 'jobMonitor', 'catalogObjects'],
    etl_lead: ['myWork', 'dashboard', 'migration', 'quality', 'cutover', 'promotions', 'jobMonitor', 'connections', 'catalogObjects', 'catalogFmds', 'catalogRules'],
    data_governance_lead: ['myWork', 'dashboard', 'preparation', 'rules', 'referenceData', 'quality', 'promotions', 'catalogObjects', 'catalogFmds', 'catalogRules'],
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

  // ── migration_objects: real SAP DMC catalogue (verbatim) ──
  const migObjMap = new Map(); // ident -> uuid (last write wins if idents repeat)
  const catalogRows = DMC_CATALOG.map(([guid, ident, alias, descr, objType, approach, component]) => {
    const id = stableId('mo-dmc:' + guid);
    migObjMap.set(ident, id);
    return {
      id: q(id), guid: q(guid), object_id: q(ident), technical_name: q(alias || null),
      description: q(descr || null), category: q(objType || null), approach: q(approach || null),
      component: q(component || null),
    };
  });
  out.push('-- ── migration_objects: real SAP DMC catalogue (verbatim, from dmc_data.js DMC_CATALOG) ──');
  out.push(insertStatement(
    'migration_objects',
    ['id', 'guid', 'object_id', 'technical_name', 'description', 'category', 'approach', 'component'],
    catalogRows,
  ));

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
    };
  });
  out.push('-- ── migration_objects: synthetic wave-scope objects (demo scope, keyed by SAP table code) ──');
  out.push(insertStatement(
    'migration_objects',
    ['id', 'guid', 'object_id', 'technical_name', 'description', 'category', 'approach', 'component'],
    syntheticRows,
  ));

  // ── object_dependencies (real, from DMC_DEPENDENCIES) ──
  const depRows = [];
  let depSkipped = 0;
  for (const [ident, prereqs] of Object.entries(DMC_DEPENDENCIES)) {
    const objId = migObjMap.get(ident);
    if (!objId) { depSkipped++; continue; }
    for (const [prereqIdent] of prereqs) {
      const prereqId = migObjMap.get(prereqIdent);
      if (!prereqId) { depSkipped++; continue; }
      depRows.push({ migration_object_id: q(objId), requires_object_id: q(prereqId) });
    }
  }
  out.push(`-- ── object_dependencies (${depSkipped} pairs skipped — ident not present in DMC_CATALOG) ──`);
  out.push(insertStatement('object_dependencies', ['migration_object_id', 'requires_object_id'], depRows));

  // ── programme hierarchy: project / releases / waves / cycles ──
  const proj = state.config.project;
  const projectId = stableId('project:' + proj.code);
  out.push('-- ── projects ──');
  out.push(insertStatement('projects', ['id', 'code', 'name', 'description', 'start_date'], [{
    id: q(projectId), code: q(proj.code), name: q(proj.name), description: q(proj.description),
    start_date: q(toIsoDate(proj.start)),
  }]));

  const releaseMap = new Map();
  const waveMap = new Map();
  const cycleMap = new Map();
  const releaseRows = [];
  const waveRows = [];
  const cycleRows = [];
  state.config.releases.forEach((r, ri) => {
    const releaseId = stableId('release:' + r.code);
    releaseMap.set(r.id, releaseId);
    releaseRows.push({
      id: q(releaseId), project_id: q(projectId), code: q(r.code), name: q(r.name), description: q(r.description),
      start_date: q(toIsoDate(r.start)), seq: n(ri + 1),
    });
    (r.waves ?? []).forEach((w, wi) => {
      const waveId = stableId('wave:' + w.code);
      waveMap.set(w.id, waveId);
      waveRows.push({
        id: q(waveId), release_id: q(releaseId), code: q(w.code), name: q(w.name), description: q(w.description),
        start_date: q(toIsoDate(w.start)), freeze_date: q(toIsoDate(w.freeze)),
        scope_finalized: b(!!w.scopeFinalized), seq: n(wi + 1),
      });
      (w.cycles ?? []).forEach((c) => {
        const cycleId = stableId('cycle:' + w.code + ':' + c.id);
        cycleMap.set(c.id, cycleId);
        cycleRows.push({
          id: q(cycleId), wave_id: q(waveId), name: q(c.name), seq: n(c.seq), description: q(c.description),
          mig_start: q(toIsoDate(c.migStart)), mig_end: q(toIsoDate(c.migEnd)), data_freeze: q(toIsoDate(c.dataFreezeDate)),
        });
      });
    });
  });
  out.push('-- ── releases ──');
  out.push(insertStatement('releases', ['id', 'project_id', 'code', 'name', 'description', 'start_date', 'seq'], releaseRows));
  out.push('-- ── waves ──');
  out.push(insertStatement('waves', ['id', 'release_id', 'code', 'name', 'description', 'start_date', 'freeze_date', 'scope_finalized', 'seq'], waveRows));
  out.push('-- ── cycles ──');
  out.push(insertStatement('cycles', ['id', 'wave_id', 'name', 'seq', 'description', 'mig_start', 'mig_end', 'data_freeze'], cycleRows));

  const wave1Id = waveMap.get('w1'); // Wave 1A — the only wave with real demo depth in the prototype

  // ── wave_objects (Wave 1A scope) ──
  const waveObjectRows = scopeRows.map((s) => ({
    id: q(stableId('wave-object:' + s.table)), wave_id: q(wave1Id), migration_object_id: q(migObjSyntheticMap.get(s.table)),
    in_scope: b(s.scopeLabel === 'In Scope'), approach: q(state.objectApproach[s.table] ?? null),
    load_seq: 'null', owner: q(s.owner === '—' ? null : s.owner), waiver_reason: 'null',
  }));
  out.push('-- ── wave_objects (Wave 1A scope) ──');
  out.push(insertStatement('wave_objects', ['id', 'wave_id', 'migration_object_id', 'in_scope', 'approach', 'load_seq', 'owner', 'waiver_reason'], waveObjectRows));

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

  // ── fmds + fmd_versions — the one real FMD the prototype models in depth (Wave 1A's
  // legacyRows/mappingRows), attached to the synthetic MARA object. Sheets follow FmdVersion's
  // { source, target, mapping } shape from types/entities.ts.
  const wave1Fixture = state.config.releases[0].waves[0];
  const fmdId = stableId('fmd:MARA');
  const fmdVersionId = stableId('fmd-version:MARA:v2.1.0');
  out.push('-- ── fmds ──');
  out.push(insertStatement('fmds', ['id', 'wave_id', 'migration_object_id', 'name'], [{
    id: q(fmdId), wave_id: q(wave1Id), migration_object_id: q(migObjSyntheticMap.get('MARA')), name: q('FMD — MARA/MARC Core Fields'),
  }]));

  const sourceSheet = (wave1Fixture.legacyRows ?? []).map((r) => ({ field: r.field, desc: r.desc, sample: r.sample, sheet: r.sheet }));
  const mappingSheet = (wave1Fixture.mappingRows ?? []).map((r) => ({
    source: r.source, target: r.target, dataType: r.dataType, rule: r.rule,
    mandatory: r.mandatory ? 'Yes' : 'No', defaultValue: r.defaultValue, dqRule: r.dqRule, comments: r.comments,
  }));
  const seenTargets = new Set();
  const targetSheet = [];
  for (const r of wave1Fixture.mappingRows ?? []) {
    if (seenTargets.has(r.target)) continue;
    seenTargets.add(r.target);
    const [table, field] = String(r.target).split('.');
    targetSheet.push({ table: table ?? r.target, field: field ?? '', dataType: r.dataType });
  }
  out.push('-- ── fmd_versions ──');
  out.push(insertStatement('fmd_versions', ['id', 'fmd_id', 'version', 'state', 'sheets', 'created_by', 'created_at', 'approved_by', 'approved_at'], [{
    id: q(fmdVersionId), fmd_id: q(fmdId), version: q('v2.1.0'), state: q('Approved'),
    sheets: q(JSON.stringify({ source: sourceSheet, target: targetSheet, mapping: mappingSheet })) + '::jsonb',
    created_by: q('J. Alvarez'), created_at: q(parseDate('Jul 20, 2026')), approved_by: q('S. Chen'), approved_at: q(parseDate('Jul 30, 2026')),
  }]));

  // ── connections (state.landscape) ──
  const connectionMap = new Map(); // sid -> uuid
  const connectionRows = state.landscape.map((c) => {
    const id = stableId('connection:' + c.sid);
    connectionMap.set(c.sid, id);
    return {
      id: q(id), project_id: q(projectId), sid: q(c.sid), description: q(c.desc), type: q(c.type),
      host: q(c.host), client: q(c.client === '—' ? null : c.client), role: q(c.role), envs: q(c.envs),
      status: q(c.status),
    };
  });
  out.push('-- ── connections ──');
  out.push(insertStatement('connections', ['id', 'project_id', 'sid', 'description', 'type', 'host', 'client', 'role', 'envs', 'status'], connectionRows));

  // extractTables/criteriaDefs reference connections by an informal system *name*, not SID — map by hand.
  const SYSTEM_TO_SID = { 'SAP ECC 6.0': 'ECP', 'Legacy Oracle WMS': 'WMS', 'SFTP Legacy Files': 'SFT', 'SAP S/4HANA 2023': 'S4D' };
  const connIdBySystem = (system) => connectionMap.get(SYSTEM_TO_SID[system]) ?? null;

  // ── staging_db ──
  out.push('-- ── staging_db ──');
  out.push(insertStatement('staging_db', ['wave_id', 'engine', 'host', 'schema_name', 'retention', 'owner', 'last_ingestion'], [{
    wave_id: q(wave1Id), engine: q(state.stagingDb.engine), host: q(state.stagingDb.host),
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
        id: q(id), wave_id: q(wave1Id), connection_id: q(connId), name: q(t.name), tier: q(t.tier),
        in_scope: b(t.inScope), records: n(parseNum(t.records)), expected: 'null', status: q(t.status),
        extracted_on: q(parseDate(t.extractedOn)), executed_by: q(t.executedBy === '—' ? null : t.executedBy),
        duration_s: 'null', snapshot: 'null', dq_score: 'null', load_type: 'null',
      };
    })
    .filter(Boolean);
  out.push('-- ── source_tables ──');
  out.push(insertStatement('source_tables', ['id', 'wave_id', 'connection_id', 'name', 'tier', 'in_scope', 'records', 'expected', 'status', 'extracted_on', 'executed_by', 'duration_s', 'snapshot', 'dq_score', 'load_type'], sourceTableRows));

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
    id: q(stableId('criteria:' + c.id)), wave_id: q(wave1Id), connection_id: q(connIdBySystem(c.system)), table_name: q(c.table),
    mode: q(c.mode), field: q(c.field === '—' ? null : c.field), condition: q(c.condition), value: q(c.value),
    scope: q(c.scope),
  }));
  out.push('-- ── selection_criteria ──');
  out.push(insertStatement('selection_criteria', ['id', 'wave_id', 'connection_id', 'table_name', 'mode', 'field', 'condition', 'value', 'scope'], criteriaRows));

  // ── rules (state.rules) ──
  const RULE_STATUS = { Active: 'Approved', Draft: 'Draft', Inactive: 'Rejected' };
  // schema's rules.type check constraint only allows these three; the prototype also uses
  // 'Standardization' and 'Cleansing', which fold into 'Validation' here.
  const RULE_TYPES = new Set(['Validation', 'Transformation', 'Enrichment']);
  const ruleRows = state.rules.map((r) => ({
    id: q(stableId('rule:' + r.id)), wave_id: q(wave1Id), code: q(r.id), name: q(r.name),
    migration_object_id: q(migObjSyntheticMap.get(r.object) ?? null),
    type: q(RULE_TYPES.has(r.type) ? r.type : 'Validation'),
    severity: q(r.severity), status: q(RULE_STATUS[r.status] ?? 'Draft'), expression: 'null',
    owner: q(r.owners?.[0] ?? null), version: q(r.version),
  }));
  out.push('-- ── rules ──');
  out.push(insertStatement('rules', ['id', 'wave_id', 'code', 'name', 'migration_object_id', 'type', 'severity', 'status', 'expression', 'owner', 'version'], ruleRows));

  // ── xref_tables + xref_rows (state.xrefs) ──
  const xrefTableRows = [];
  const xrefRowRows = [];
  for (const x of state.xrefs) {
    const xrefId = stableId('xref-table:' + x.id);
    xrefTableRows.push({ id: q(xrefId), wave_id: q(wave1Id), name: q(x.name), purpose: q(x.desc), version: q(x.version) });
    x.rows.forEach((row, i) => {
      xrefRowRows.push({
        id: q(stableId('xref-row:' + x.id + ':' + i)), xref_table_id: q(xrefId), legacy_value: q(row.source), s4_value: q(row.target),
        valid_from: 'null', status: q('Active'),
      });
    });
  }
  out.push('-- ── xref_tables ──');
  out.push(insertStatement('xref_tables', ['id', 'wave_id', 'name', 'purpose', 'version'], xrefTableRows));
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
  out.push(insertStatement('etl_objects', ['id', 'wave_id', 'type', 'name', 'parent_id', 'meta'],
    etlObjectRows.map(({ __obj: o, id }) => ({
      id: q(id), wave_id: q(wave1Id), type: q(o.type), name: q(o.name),
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
    id: q(stableId('etl-global:' + g.name)), wave_id: q(wave1Id), name: q(g.name), type: q(g.type), value: q(g.value ?? null),
  }));
  out.push('-- ── etl_globals ──');
  out.push(insertStatement('etl_globals', ['id', 'wave_id', 'name', 'type', 'value'], etlGlobalRows));

  // ── runs (state.runs) ──
  const cycleNameMap = new Map(cycleRows.map((c) => [c.name.slice(1, -1), c.id])); // name (quoted) -> quoted id
  const runRows = state.runs.map((r) => ({
    id: q(stableId('run:' + r.id)), code: q(r.id), wave_id: q(wave1Id), cycle_id: cycleNameMap.get(r.cycle) ?? 'null',
    etl_object_id: 'null', migration_object_id: q(migObjSyntheticMap.get(r.object) ?? null),
    iteration: n(r.iter), mode: q(r.mode), env: q(r.env), target: q(r.target), approach: q(r.approach),
    fmd_version: q(r.fmd), rules_version: q(r.rules), xref_version: q(r.xref), staging_snapshot: q(r.staging),
    started_at: q(parseDate(r.started)), duration_s: n(parseDurationSeconds(r.duration)), run_by: q(r.by),
    src_count: n(r.src), tgt_count: n(r.tgt), rej_count: n(r.rej), status: q(r.status),
  }));
  out.push('-- ── runs ──');
  out.push(insertStatement('runs', ['id', 'code', 'wave_id', 'cycle_id', 'etl_object_id', 'migration_object_id', 'iteration', 'mode', 'env', 'target', 'approach', 'fmd_version', 'rules_version', 'xref_version', 'staging_snapshot', 'started_at', 'duration_s', 'run_by', 'src_count', 'tgt_count', 'rej_count', 'status'], runRows));

  // ── cutover_tasks (state.cutoverPlan — has start/end pairs matching our schema) ──
  const cutoverIdMap = new Map(state.cutoverPlan.map((t) => [t.id, stableId('cutover:' + t.id)]));
  const cutoverRows = state.cutoverPlan.map((t, i) => ({
    id: q(cutoverIdMap.get(t.id)), wave_id: q(wave1Id), seq: n(i + 1), name: q(t.task), owner: q(t.owner),
    planned_start: q(parseShortDate(t.start)), planned_end: q(parseShortDate(t.end)),
    depends_on: q(t.dependsOn && t.dependsOn !== '—' ? cutoverIdMap.get(t.dependsOn) ?? null : null),
    status: q(t.status),
  }));
  out.push('-- ── cutover_tasks ──');
  out.push(insertStatement('cutover_tasks', ['id', 'wave_id', 'seq', 'name', 'owner', 'planned_start', 'planned_end', 'depends_on', 'status'], cutoverRows));

  // ── approval_matrix (state.workflows — area/action approval rules) ──
  const APPROVER_TO_ROLE = {
    'Program Admin': 'program_admin', 'Data Owner': 'data_owner', 'Data Governance Lead': 'data_governance_lead',
    'ETL Lead': 'etl_lead', 'ETL Developer': 'etl_developer', 'CAB': 'cab',
  };
  const approvalRows = [];
  for (const area of state.workflows) {
    for (const action of area.actions) {
      approvalRows.push({
        id: q(stableId('approval:' + area.area + ':' + action.key)), project_id: q(projectId), area: q(area.area), action: q(action.key),
        approval_required: b(action.approval), approver_role_id: q(APPROVER_TO_ROLE[action.approver] ?? null),
      });
    }
  }
  out.push('-- ── approval_matrix ──');
  out.push(insertStatement('approval_matrix', ['id', 'project_id', 'area', 'action', 'approval_required', 'approver_role_id'], approvalRows));

  // ── promotions (state.promotions) — only rows whose type maps onto our artefact_type enum ──
  const PROMO_TYPE = { 'Field Mapping Document': 'fmd', 'Rule': 'rules', 'Value Mapping': 'xref' };
  const promotionRows = state.promotions
    .filter((p) => PROMO_TYPE[p.type])
    .map((p) => ({
      id: q(stableId('promotion:' + p.id)), wave_id: q(wave1Id), artefact_type: q(PROMO_TYPE[p.type]), artefact_id: 'null',
      artefact_name: q(p.artifact), from_env: q(normalizeEnv(p.from)), to_env: q(normalizeEnv(p.to)),
      requested_by: q(p.requestedBy), requested_at: q(parseDate(p.date)), status: q(p.status),
    }));
  out.push('-- ── promotions ──');
  out.push(insertStatement('promotions', ['id', 'wave_id', 'artefact_type', 'artefact_id', 'artefact_name', 'from_env', 'to_env', 'requested_by', 'requested_at', 'status'], promotionRows));

  // ── check_tables + check_table_rows (state.referenceTables / state.referenceTableRows) ──
  const checkTableRows = [];
  const checkTableRowRows = [];
  for (const t of state.referenceTables ?? []) {
    const id = stableId('check-table:' + t.table);
    const detail = (state.referenceTableRows ?? {})[t.table];
    checkTableRows.push({
      id: q(id), wave_id: q(wave1Id), table_name: q(t.table), domain: q(t.domain ?? null), field: q(t.field ?? null),
      used_by: q(t.usedBy ?? null), description: q(t.desc ?? null), columns: pgTextArray(detail?.cols ?? []),
    });
    (detail?.rows ?? []).forEach((row, i) => {
      checkTableRowRows.push({ id: q(stableId('check-table-row:' + t.table + ':' + i)), check_table_id: q(id), seq: n(i + 1), values: pgTextArray(row) });
    });
  }
  out.push('-- ── check_tables ──');
  out.push(insertStatement('check_tables', ['id', 'wave_id', 'table_name', 'domain', 'field', 'used_by', 'description', 'columns'], checkTableRows));
  out.push('-- ── check_table_rows ──');
  out.push(insertStatement('check_table_rows', ['id', 'check_table_id', 'seq', 'values'], checkTableRowRows));

  // ── golden_library (state.goldenFmdVersions / state.goldenXrefVersions) ──
  const goldenRows = [
    ...(state.goldenFmdVersions ?? []).map((g) => ({ ...g, kind: 'fmd' })),
    ...(state.goldenXrefVersions ?? []).map((g) => ({ ...g, kind: 'xref' })),
  ].map((g) => ({
    id: q(stableId('golden:' + (g.guid ?? g.name))), project_id: q(projectId), kind: q(g.kind), name: q(g.name), reference: q(g.reference ?? null),
    version: q(g.version ?? null), created_by: q(g.createdBy ?? null), created_at: q(parseDmyHms(g.createdOn, g.createdAt)),
    changed_by: q(g.changedBy ?? null), changed_at: q(parseDmyHms(g.changedOn, g.changedAt)),
  }));
  out.push('-- ── golden_library ──');
  out.push(insertStatement('golden_library', ['id', 'project_id', 'kind', 'name', 'reference', 'version', 'created_by', 'created_at', 'changed_by', 'changed_at'], goldenRows));

  // ── unmapped_values (state.unmapped) — artifact-aligned addition ──
  const unmappedRows = (state.unmapped ?? []).map((u) => ({
    id: q(stableId('unmapped:' + u.id)), wave_id: q(wave1Id), set_name: q(u.set), migration_object_id: q(migObjSyntheticMap.get(u.object) ?? null),
    field: q(u.field ?? null), value: q(u.value), occurrences: n(u.occurrences ?? 0), owner: q(u.owner ?? null),
    status: q(u.status), suggestion: q(u.suggestion === '—' ? null : u.suggestion ?? null),
  }));
  out.push('-- ── unmapped_values ──');
  out.push(insertStatement('unmapped_values', ['id', 'wave_id', 'set_name', 'migration_object_id', 'field', 'value', 'occurrences', 'owner', 'status', 'suggestion'], unmappedRows));

  // ── timeline_categories + timeline_entries (state.timelineCats / state.timelineEntries) — artifact-aligned addition ──
  const timelineCatIdMap = new Map((state.timelineCats ?? []).map((c) => [c.id, stableId('timeline-cat:' + c.id)]));
  const timelineCatRows = (state.timelineCats ?? []).map((c, i) => ({
    id: q(timelineCatIdMap.get(c.id)), project_id: q(projectId), name: q(c.name), seq: n(i + 1),
  }));
  out.push('-- ── timeline_categories ──');
  out.push(insertStatement('timeline_categories', ['id', 'project_id', 'name', 'seq'], timelineCatRows));

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
  out.push('-- ── memberships (programme-wide, wave_id null) — same auth.users guard as above ──');
  for (const u of state.users) {
    const roleId = ROLE_LABEL_TO_ID[u.role] ?? 'end_user';
    out.push(
      `insert into memberships (id, user_id, project_id, wave_id, role_id)\n` +
      `select ${q(stableId('membership:' + u.email))}, au.id, ${q(projectId)}, null, ${q(roleId)} from app_users au where au.email = ${q(u.email)}\n` +
      `on conflict (user_id, project_id, wave_id, role_id) do nothing;`,
    );
  }
  out.push('');

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, out.join('\n') + '\n', 'utf8');
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`  migration_objects: ${catalogRows.length + syntheticRows.length} (${catalogRows.length} DMC + ${syntheticRows.length} synthetic)`);
  console.log(`  object_dependencies: ${depRows.length}`);
  console.log(`  releases: ${releaseRows.length}, waves: ${waveRows.length}, cycles: ${cycleRows.length}`);
  console.log(`  connections: ${connectionRows.length}, source_tables: ${sourceTableRows.length}, selection_criteria: ${criteriaRows.length}`);
  console.log(`  wave_objects: ${waveObjectRows.length}, object_structures: ${structRows.length}`);
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

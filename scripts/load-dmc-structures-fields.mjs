#!/usr/bin/env node
/**
 * Bulk-loads dmc_structures (~8.8k rows) then dmc_fields (~170k rows) via the Supabase API
 * instead of the SQL editor, which turned out to reject even ~2-3MB pasted queries. Uses the
 * SAME deterministic ids as build-seed.mjs (same stableId() + natural-key strings), so this is
 * safe to run after seed.sql (which seeds migration_objects but no longer touches these two
 * tables) and safe to re-run — it upserts, so a partial/failed run just resumes cleanly.
 *
 * Requires the *service role* key (not the anon key) — neither table has a write RLS policy at
 * all (they're read-only reference data from the app's perspective), so only a service-role
 * connection can populate them. Never commit this key or put it in a VITE_-prefixed var.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL = "https://<project-ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service role key from Settings > API>"
 *   node scripts/load-dmc-structures-fields.mjs
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

function stableId(key) {
  const hex = createHash('sha256').update(key).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DMC_COBJ_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_cobj/DMC_COBJ.xlsx');
const DMC_STREE_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_struct/DMC_STREE.xlsx');
const DMC_STREET_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_struct/DMC_STREET.xlsx');
const DMC_STRUCT_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_struct/DMC_STRUCT.xlsx');
const DMC_FIELD1_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_struct/DMC_FIELD_1.xlsx');
const DMC_FIELD2_XLSX = path.join(ROOT, 'design_handoff_dms_app/reference/dmc_struct/DMC_FIELD_2.xlsx');

function readSheet(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in ${filePath} (sheets: ${wb.SheetNames.join(', ')})`);
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
}

const parseNum = (s) => {
  if (s == null || s === '—' || s === '') return null;
  const v = parseInt(String(s).replace(/,/g, ''), 10);
  return Number.isNaN(v) ? null : v;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Upserts one batch, retrying on transient network errors (e.g. "fetch failed") with a short
 * backoff — a run over 170k+ rows takes several minutes, long enough for the occasional
 * connection blip. Real API/DB errors (bad data, RLS, etc.) still fail immediately. */
async function upsertBatchWithRetry(supabase, table, batch, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
    if (!error) return;
    const transient = /fetch failed|ECONNRESET|ETIMEDOUT|network/i.test(error.message ?? '');
    if (!transient || attempt === maxAttempts) throw new Error(`${table} failed: ${error.message}`);
    await sleep(1000 * attempt);
  }
}

async function upsertInBatches(supabase, table, rows, batchSize = 500) {
  let done = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await upsertBatchWithRetry(supabase, table, batch);
    done += batch.length;
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}`);
  }
  console.log('');
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first (see header comment).');
    process.exitCode = 1;
    return;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('Reading DMC_COBJ / DMC_STREE / DMC_STREET / DMC_STRUCT / DMC_FIELD workbooks…');
  const dmcCobj = readSheet(DMC_COBJ_XLSX, 'Data');
  const dmcStree = readSheet(DMC_STREE_XLSX, 'Data');
  const dmcStreet = readSheet(DMC_STREET_XLSX, 'Data');
  const dmcStruct = readSheet(DMC_STRUCT_XLSX, 'Data');
  // split across 2 files upstream — combined here, deduped by GUID since the split overlapped
  // (DMC_FIELD_1 and DMC_FIELD_2 share ~36k identical rows at the boundary, not a clean split)
  const dmcField = [...new Map(
    [...readSheet(DMC_FIELD1_XLSX, 'Data'), ...readSheet(DMC_FIELD2_XLSX, 'Data')].map((r) => [r.GUID, r]),
  ).values()];
  console.log(`  DMC_COBJ: ${dmcCobj.length}, DMC_STREE: ${dmcStree.length}, DMC_STRUCT: ${dmcStruct.length}, DMC_FIELD: ${dmcField.length} (deduped)`);

  const enStreeDescByGuid = new Map(dmcStreet.filter((r) => r.LANGU === 'EN').map((r) => [r.GUID, r.DESCR]));
  const streeByContainer = new Map();
  for (const r of dmcStree) {
    if (!streeByContainer.has(r.CONTAINER)) streeByContainer.set(r.CONTAINER, []);
    streeByContainer.get(r.CONTAINER).push(r);
  }
  const structByGuid = new Map(dmcStruct.map((r) => [r.GUID, r]));
  const fieldsByStructure = new Map();
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
          id: structureId, migration_object_id: moId, side, guid: stree.GUID, struct_guid: struct.GUID, ident: stree.IDENT,
          description: enStreeDescByGuid.get(stree.GUID) ?? stree.Description ?? struct.DESCR ?? null,
          seq: parseNum(stree.SEQNUM), level: parseNum(stree.STRUCLEVEL), parent_guid: stree.PARENTID || null,
          ddic_name: struct.DDICNAME || null, tab_class: struct.TABCLASS || null, technical: struct.TECHNICAL === 'X',
        });
        for (const f of fieldsByStructure.get(struct.GUID) ?? []) {
          fieldRows.push({
            id: stableId('dmc-field:' + structureId + ':' + f.GUID), structure_id: structureId, field_name: f.FIELDNAME,
            seq: parseNum(f.POS), key_flag: f.KEYFLAG === 'X', data_type: f.DATATYPE || null,
            length: parseNum(f.LEN), output_length: parseNum(f.OUTPUTLEN), decimals: parseNum(f.DECS),
            dom_name: f.DOMNAME || null, roll_name: f.ROLLNAME || null, check_table: f.CHECKTABLE || null,
            description: f.SCRTEXT_L || f.DESCR || null,
          });
        }
      }
    }
  }
  console.log(`Built ${structureRows.length} structure rows, ${fieldRows.length} field rows.`);

  console.log('Upserting dmc_structures…');
  await upsertInBatches(supabase, 'dmc_structures', structureRows);
  console.log('Upserting dmc_fields…');
  await upsertInBatches(supabase, 'dmc_fields', fieldRows);
  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });

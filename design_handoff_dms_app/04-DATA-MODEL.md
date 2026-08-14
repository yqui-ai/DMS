# Data model

Full DDL is in `supabase/migrations/0001_init.sql` (+ `0002_rls.sql`). This file explains intent.

## Hierarchy
```
projects (programme)
  └ releases            "Wave 1 – Finance & MM Foundation"
      └ waves           subproject, e.g. "Wave 1A – Material Master Core" (code W1A)
          ├ cycles      Mock Load 1, Dress Rehearsal, … (seq, migration window, data freeze)
          └ scope       wave_objects → migration_objects (catalogue)
```
`waves.scope_finalized` gates the execution/governance navigation.

## Catalogue
- `migration_objects` — the SAP migration-object catalogue from `reference/dmc_data.js`:
  guid, object id (`SIF_MATERIAL`), technical name, description, category
  (Master data / Transactional data / Not classified), approach (Direct Transfer - ERP /
  Direct Transfer - AFS / Staging Table / Not classified), component (`MM`, `FI-AA`, `IS-OIL-PRA`…).
- `object_structures` — per object, the structures/segments (name, table, seq, fields, mapped,
  mandatory, owner, status).
- `object_dependencies` — prerequisite graph used by the ERD and load sequence.

## Staging
- `connections` — landscape entries (sid, description, type, host, client, role, envs, status).
- `staging_db` — one row per wave: engine, host, schema, retention, owner, last_ingestion.
- `source_tables` — one per legacy table in scope: connection, name, tier (source/target),
  records, expected, in_scope, status (Not Extracted / Extracting / Extracted / Failed),
  extracted_on, executed_by, duration, snapshot, dq_score, load_type.
  **`staging_table` is generated**: `<connection.sid>_<upper(name without extension)>_STG`.
- `table_groups` / `table_group_members` — the per-connection grouping.
- `extraction_jobs` / `extraction_job_groups` — name, connection, schedule, status, last_run.
- `selection_criteria` — per table: mode (Simple/Complex), field, condition, value, scope.

## Mapping & rules
- `fmds` + `fmd_versions` (JSONB sheets: source / target / mapping rows), state
  Draft/In Review/Approved/Rejected, assigned per wave object.
- `rules` — rule id, object, name, type, severity, status, expression, owner, version.
- `xref_tables` + `xref_rows` — value mapping (legacy value → S/4 value, valid from, status).

## ETL designer
- `etl_objects` — id, wave_id, type (`job` | `workflow` | `dataflow`), name, parent_id, meta.
- `etl_nodes` — id, object_id, type (the 22 node types), name, x, y, w, h, data JSONB
  (the per-type field sets in `03-PIPELINES-DESIGNER.md`, plus `ref` → child `etl_objects.id`,
  `schema_in`/`schema_out` arrays for transforms, `rules` array for validation).
- `etl_edges` — id, object_id, from_node, to_node, condition (`` | Pass | Fail | Then | Else).
- `etl_globals` — global/substitution variables per wave (name, type, value).
- `etl_run_settings` — last used run options per wave.

## Execution
- `runs` — run id, wave, cycle, object, iteration, mode (Full/Delta), env, target, approach,
  pinned versions (fmd, rules, xref, staging snapshot), started, duration, by, src/tgt/rej counts, status.
- `run_log` — per run: node/object name, type, state, row_count, elapsed_ms, stream
  (monitor/trace/error), line, seq.

## Quality, cutover, governance
- `dq_dimensions`, `dq_checks` (pre/post load), `reconciliation`, `fallout_records`
- `cutover_tasks`
- `promotions` + `promotion_approvals`
- `audit_log` (append-only)
- `approval_matrix` — area, action, approval_required, approver_role

## Identity
- `app_users`, `roles`, `role_screens`, `memberships (user, project, wave, role)`

## Seed data
`supabase/seed/README.md` explains how to derive the seed from the prototype:
the SAP catalogue from `reference/dmc_data.js`, and every other fixture from the `state = {…}`
initialiser in `reference/Data Migration Solution v2.dc.html` (search for `extractTables:`,
`landscape:`, `objectStructures:`, `criteriaDefs:`, `runs:`, `roles:`, `dsObjects:`, `dsGraphs:`).

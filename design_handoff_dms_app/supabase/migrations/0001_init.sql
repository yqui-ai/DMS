-- DMS schema — generated from the design prototype's data shapes
-- Postgres / Supabase. Apply before 0002_rls.sql.

create extension if not exists "pgcrypto";

-- ─────────────────────────── identity & access ───────────────────────────
create table app_users (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  email text not null unique,
  status text not null default 'Invited' check (status in ('Active','Invited','Disabled')),
  last_login timestamptz,
  created_at timestamptz not null default now()
);

create table roles (
  id text primary key,                       -- 'program_admin', 'etl_lead', …
  name text not null unique,                 -- 'Program Admin'
  description text,
  is_standard boolean not null default true
);

create table role_screens (
  role_id text references roles on delete cascade,
  screen_key text not null,                  -- 'migration', 'preparation', …
  can_view boolean not null default true,
  can_edit boolean not null default false,
  primary key (role_id, screen_key)
);

-- ─────────────────────────── programme hierarchy ─────────────────────────
create table projects (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  start_date date,
  end_date date default '9999-12-31',
  created_at timestamptz not null default now()
);

create table releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  code text not null,
  name text not null,
  description text,
  start_date date,
  end_date date default '9999-12-31',
  seq int not null default 1
);

create table waves (                          -- "subproject"
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references releases on delete cascade,
  code text not null,
  name text not null,
  description text,
  start_date date,
  end_date date default '9999-12-31',
  freeze_date date,
  scope_finalized boolean not null default false,
  seq int not null default 1
);

create table cycles (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  name text not null,                        -- 'Mock Load 1', 'Dress Rehearsal', 'Cutover'
  seq int not null,
  description text,
  mig_start date, mig_end date, data_freeze date
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  wave_id uuid references waves on delete cascade,   -- null = whole programme
  role_id text not null references roles,
  unique (user_id, project_id, wave_id, role_id)
);

-- ─────────────────────────── migration-object catalogue ──────────────────
create table migration_objects (
  id uuid primary key default gen_random_uuid(),
  guid text unique,                          -- SAP DMC guid from dmc_data.js
  object_id text not null,                   -- 'SIF_MATERIAL'
  technical_name text,                       -- 'MATERIAL'
  description text,
  category text,                             -- 'Master data' | 'Transactional data' | 'Not classified'
  approach text,                             -- 'Direct Transfer - ERP' | 'Staging Table' | …
  component text                             -- 'MM', 'FI-AA', 'IS-OIL-PRA', …
);

create table object_structures (
  id uuid primary key default gen_random_uuid(),
  migration_object_id uuid not null references migration_objects on delete cascade,
  name text not null,                        -- 'Basic Data'
  table_name text,                           -- 'MARA'
  seq int not null default 1,
  fields int default 0,
  mapped int default 0,
  mandatory boolean default false,
  owner text,
  status text default 'Draft' check (status in ('Not Started','Draft','In Review','Approved','Rejected'))
);

create table object_dependencies (
  migration_object_id uuid references migration_objects on delete cascade,
  requires_object_id uuid references migration_objects on delete cascade,
  primary key (migration_object_id, requires_object_id)
);

create table wave_objects (                   -- scope of a wave
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  migration_object_id uuid not null references migration_objects,
  in_scope boolean not null default true,
  approach text,                             -- 'M_ADMC' | 'M_ADPG' | 'M_LSMW' | 'M_MNL'
  load_seq int,
  owner text,
  waiver_reason text,
  unique (wave_id, migration_object_id)
);

-- ─────────────────────────── landscape & staging ─────────────────────────
create table connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  sid text not null,                          -- 'ECP', 'WMS', 'SFT', 'S4Q'
  description text not null,                  -- 'SAP ECC 6.0 — Production'
  type text not null,                         -- 'SAP ECC' | 'Oracle 19c' | 'SFTP' | 'S/4HANA'
  host text, client text,
  role text not null check (role in ('Source','Target','Staging')),
  envs text,                                  -- 'DEV · QSA · PRD'
  status text not null default 'Not Configured' check (status in ('Connected','Error','Not Configured')),
  unique (project_id, sid)
);

create table staging_db (
  wave_id uuid primary key references waves on delete cascade,
  engine text, host text, schema_name text, retention text, owner text,
  last_ingestion timestamptz
);

create table source_tables (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  connection_id uuid not null references connections,
  name text not null,                         -- 'MARA' or 'MATERIAL_MASTER_2019.xlsx'
  tier text not null default 'source' check (tier in ('source','target')),
  in_scope boolean not null default true,
  records bigint, expected bigint,
  status text not null default 'Not Extracted'
    check (status in ('Not Extracted','Extracting','Extracted','Failed')),
  extracted_on timestamptz, executed_by text, duration_s int,
  snapshot text, dq_score numeric(5,2), load_type text check (load_type in ('Full','Delta')),
  unique (wave_id, connection_id, name)
);

-- generated staging table name: <SID>_<TABLE>_STG
create view source_tables_v as
select st.*,
       c.sid,
       case when st.status = 'Not Extracted' then null
            else c.sid || '_' || upper(regexp_replace(st.name, '\\.[A-Za-z0-9]+$', '')) || '_STG'
       end as staging_table
from source_tables st join connections c on c.id = st.connection_id;

create table table_groups (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  connection_id uuid not null references connections,
  name text not null
);

create table table_group_members (
  group_id uuid references table_groups on delete cascade,
  source_table_id uuid references source_tables on delete cascade,
  primary key (group_id, source_table_id)
);

create table extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  connection_id uuid not null references connections,
  name text not null,
  schedule text,                              -- 'Daily 02:00'
  status text not null default 'Idle' check (status in ('Idle','Running','Success','Failed')),
  last_run timestamptz
);

create table extraction_job_groups (
  job_id uuid references extraction_jobs on delete cascade,
  group_id uuid references table_groups on delete cascade,
  primary key (job_id, group_id)
);

create table selection_criteria (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  connection_id uuid references connections,
  table_name text not null,
  mode text not null default 'Simple' check (mode in ('Simple','Complex')),
  field text, condition text, value text,
  scope text default 'Table' check (scope in ('Table','Cross-table'))
);

-- ─────────────────────────── mapping, rules, xref ────────────────────────
create table fmds (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  migration_object_id uuid references migration_objects,
  name text not null
);

create table fmd_versions (
  id uuid primary key default gen_random_uuid(),
  fmd_id uuid not null references fmds on delete cascade,
  version text not null,                      -- 'v2.1.0'
  state text not null default 'Draft' check (state in ('Draft','In Review','Approved','Rejected')),
  sheets jsonb not null default '{}'::jsonb,   -- { source: [...], target: [...], mapping: [...] }
  created_by text, created_at timestamptz not null default now(),
  approved_by text, approved_at timestamptz,
  unique (fmd_id, version)
);

create table wave_object_fmd (
  wave_object_id uuid primary key references wave_objects on delete cascade,
  fmd_version_id uuid references fmd_versions
);

create table rules (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  code text not null,                         -- 'LOC-052'
  name text not null,
  migration_object_id uuid references migration_objects,
  type text not null check (type in ('Validation','Transformation','Enrichment')),
  severity text not null check (severity in ('Critical','High','Medium','Low')),
  status text not null default 'Draft' check (status in ('Draft','In Review','Approved','Rejected')),
  expression text, owner text, version text
);

create table xref_tables (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  name text not null,                         -- 'XREF_MTART'
  purpose text, version text
);

create table xref_rows (
  id uuid primary key default gen_random_uuid(),
  xref_table_id uuid not null references xref_tables on delete cascade,
  legacy_value text, s4_value text, valid_from date,
  status text default 'Active' check (status in ('Active','Retired'))
);

-- ─────────────────────────── ETL designer ────────────────────────────────
create table etl_objects (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  type text not null check (type in ('job','workflow','dataflow')),
  name text not null,
  parent_id uuid references etl_objects on delete cascade,
  meta text
);

create table etl_nodes (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references etl_objects on delete cascade,
  type text not null check (type in (
    'workflow','dataflow','script','conditional','whileloop','trycatch',
    'source','file','query','case','merge','validation','tablecomp','keygen',
    'mapop','lookup','sql','cleanse','match','pivot','target','template')),
  name text not null,
  x numeric not null default 60, y numeric not null default 60,
  w numeric not null default 200, h numeric not null default 60,
  ref_object_id uuid references etl_objects on delete set null,  -- for workflow/dataflow nodes
  data jsonb not null default '{}'::jsonb
);

create table etl_edges (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references etl_objects on delete cascade,
  from_node uuid not null references etl_nodes on delete cascade,
  to_node uuid not null references etl_nodes on delete cascade,
  condition text not null default '' check (condition in ('','Pass','Fail','Then','Else')),
  unique (from_node, to_node)
);

create table etl_globals (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  name text not null,                         -- '$G_WAVE' or '[$$STG_SCHEMA]'
  type text not null default 'varchar(10)',
  value text,
  unique (wave_id, name)
);

-- ─────────────────────────── execution ───────────────────────────────────
create table runs (
  id uuid primary key default gen_random_uuid(),
  code text not null,                         -- 'RUN-2026-0184'
  wave_id uuid not null references waves on delete cascade,
  cycle_id uuid references cycles,
  etl_object_id uuid references etl_objects,
  migration_object_id uuid references migration_objects,
  iteration int default 1,
  mode text check (mode in ('Full','Delta')),
  env text check (env in ('DEV','QSA','PRD')),
  target text, approach text,
  fmd_version text, rules_version text, xref_version text, staging_snapshot text,
  started_at timestamptz, duration_s int, run_by text,
  src_count bigint default 0, tgt_count bigint default 0, rej_count bigint default 0,
  status text not null default 'Running' check (status in ('Running','Completed','Completed with rejects','Failed')),
  unique (wave_id, code)
);

create table run_log (
  id bigserial primary key,
  run_id uuid not null references runs on delete cascade,
  seq int not null,
  stream text not null default 'monitor' check (stream in ('monitor','trace','error')),
  object_name text, object_type text, state text,
  row_count bigint, elapsed_ms int, line text
);

-- ─────────────────────────── quality, cutover, governance ────────────────
create table dq_dimensions (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  dimension text not null, description text,
  threshold numeric(5,2), actual numeric(5,2)
);

create table dq_checks (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  phase text not null check (phase in ('pre-load','post-load','post-transform')),
  code text not null, migration_object_id uuid references migration_objects,
  description text, expected text, actual text,
  result text check (result in ('Pass','Warning','Fail'))
);

create table reconciliation (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs on delete cascade,
  migration_object_id uuid references migration_objects,
  src_count bigint, tgt_count bigint, variance numeric(6,2),
  signed_off_by text, signed_off_at timestamptz
);

create table fallout_records (
  id bigserial primary key,
  run_id uuid not null references runs on delete cascade,
  rule_code text, key_value text, reason text, payload jsonb
);

create table cutover_tasks (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  seq int, name text not null, owner text,
  planned_start timestamptz, planned_end timestamptz,
  depends_on uuid references cutover_tasks,
  status text default 'Not Started' check (status in ('Not Started','In Progress','Done','Blocked'))
);

create table approval_matrix (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  area text not null,                          -- 'Program','Scope','Rules','Migration','Quality','Cutover'
  action text not null,                        -- 'create','update','delete','finalize','run','promote'
  approval_required boolean not null default false,
  approver_role_id text references roles
);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  artefact_type text not null,                 -- 'fmd','rules','xref','etl_object'
  artefact_id uuid, artefact_name text,
  from_env text, to_env text,
  requested_by text, requested_at timestamptz default now(),
  status text default 'Pending' check (status in ('Pending','Approved','Rejected','Promoted'))
);

create table promotion_approvals (
  promotion_id uuid references promotions on delete cascade,
  role_id text references roles,
  approver text, decision text check (decision in ('Approved','Rejected')),
  decided_at timestamptz,
  primary key (promotion_id, role_id)
);

create table audit_log (
  id bigserial primary key,
  project_id uuid references projects on delete cascade,
  wave_id uuid references waves on delete cascade,
  at timestamptz not null default now(),
  actor text, action text not null, entity text, entity_id text,
  before jsonb, after jsonb
);

-- ─────────────────────────── indexes ─────────────────────────────────────
create index on releases (project_id);
create index on waves (release_id);
create index on cycles (wave_id);
create index on wave_objects (wave_id);
create index on source_tables (wave_id, connection_id);
create index on table_groups (wave_id, connection_id);
create index on extraction_jobs (wave_id);
create index on etl_objects (wave_id, parent_id);
create index on etl_nodes (object_id);
create index on etl_edges (object_id);
create index on runs (wave_id, started_at desc);
create index on run_log (run_id, seq);
create index on audit_log (wave_id, at desc);

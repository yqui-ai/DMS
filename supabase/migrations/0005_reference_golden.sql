-- Adds schema for two screens the original design bundle never modeled: Reference Data (check
-- tables) and the Golden Library. Shapes follow the prototype's referenceTables/referenceTableRows
-- and goldenFmdVersions/goldenXrefVersions fixtures (see supabase/seed/README.md).

create table check_tables (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  table_name text not null,           -- 'T001W'
  domain text,                        -- 'Plant'
  field text,                         -- 'MARC-WERKS'
  used_by text,
  description text,
  columns text[] not null default '{}',
  unique (wave_id, table_name)
);

create table check_table_rows (
  id uuid primary key default gen_random_uuid(),
  check_table_id uuid not null references check_tables on delete cascade,
  seq int not null default 1,
  values text[] not null default '{}'   -- positional, matches check_tables.columns order
);

create table golden_library (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  kind text not null check (kind in ('fmd', 'xref')),
  name text not null,
  reference text,
  version text,
  created_by text, created_at timestamptz,
  changed_by text, changed_at timestamptz
);

-- wave-scoped, same pattern as the other wave-scoped tables in 0002_rls.sql
alter table check_tables enable row level security;
create policy check_tables_select on check_tables for select using (wave_id in (select current_wave_ids()));
create policy check_tables_write on check_tables for all
  using (wave_id in (select current_wave_ids())) with check (wave_id in (select current_wave_ids()));

-- child reached through check_tables, same pattern as xref_rows_all in 0002_rls.sql
alter table check_table_rows enable row level security;
create policy check_table_rows_all on check_table_rows for all
  using (check_table_id in (select id from check_tables where wave_id in (select current_wave_ids())))
  with check (check_table_id in (select id from check_tables where wave_id in (select current_wave_ids())));

-- project-scoped, same pattern as connections/approval_matrix in 0002_rls.sql
alter table golden_library enable row level security;
create policy golden_library_select on golden_library for select using (project_id in (select current_project_ids()));
create policy golden_library_write on golden_library for all
  using (project_id in (select current_project_ids())) with check (project_id in (select current_project_ids()));

create index on check_tables (wave_id);
create index on check_table_rows (check_table_id);
create index on golden_library (project_id);

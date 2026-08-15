-- Adds schema for features present in the current prototype reference (the "artifact") that
-- weren't in the original handoff bundle: Unmapped Values (Rules & XREF), AI Usage & Billing and
-- Timelines admin (Program Settings). The ETL Pipelines designer, Timeline as a standalone nav
-- screen, Audit Log and Golden Library are dropped from the UI in this pass; their tables
-- (etl_*, audit_log, golden_library) are left in place — nothing here drops existing data.

create table unmapped_values (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references waves on delete cascade,
  set_name text not null,                     -- 'Material Type', 'Unit of Measure', …
  migration_object_id uuid references migration_objects,
  field text,
  value text not null,
  occurrences bigint default 0,
  owner text,
  status text not null default 'Open' check (status in ('Open', 'Proposed', 'Resolved')),
  suggestion text
);

create table ai_provider_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  provider text not null,                     -- 'Anthropic Claude API', …
  label text,
  endpoint text,
  key_masked text,                            -- last 4 chars only; never store real secrets client-side
  budget numeric(10,2),
  active boolean not null default true,
  added_at timestamptz not null default now()
);

create table timeline_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  name text not null,
  seq int not null default 1
);

create table timeline_entries (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references timeline_categories on delete cascade,
  row_label text not null,
  name text not null,
  kind text not null default 'point' check (kind in ('point', 'range')),
  icon text,
  start_date date,
  end_date date
);

-- wave-scoped, same pattern as rules/xref_tables in 0002_rls.sql
alter table unmapped_values enable row level security;
create policy unmapped_values_select on unmapped_values for select using (wave_id in (select current_wave_ids()));
create policy unmapped_values_write on unmapped_values for all
  using (wave_id in (select current_wave_ids())) with check (wave_id in (select current_wave_ids()));

-- project-scoped, same pattern as connections/approval_matrix in 0002_rls.sql
alter table ai_provider_keys enable row level security;
create policy ai_provider_keys_select on ai_provider_keys for select using (project_id in (select current_project_ids()));
create policy ai_provider_keys_write on ai_provider_keys for all
  using (project_id in (select current_project_ids())) with check (project_id in (select current_project_ids()));

alter table timeline_categories enable row level security;
create policy timeline_categories_select on timeline_categories for select using (project_id in (select current_project_ids()));
create policy timeline_categories_write on timeline_categories for all
  using (project_id in (select current_project_ids())) with check (project_id in (select current_project_ids()));

-- child reached through timeline_categories, same pattern as xref_rows_all in 0002_rls.sql
alter table timeline_entries enable row level security;
create policy timeline_entries_all on timeline_entries for all
  using (category_id in (select id from timeline_categories where project_id in (select current_project_ids())))
  with check (category_id in (select id from timeline_categories where project_id in (select current_project_ids())));

create index on unmapped_values (wave_id);
create index on ai_provider_keys (project_id);
create index on timeline_categories (project_id);
create index on timeline_entries (category_id);

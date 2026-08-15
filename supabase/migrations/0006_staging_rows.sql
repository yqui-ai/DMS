-- Backs the Pipelines designer's Data preview dock tab with real queryable rows instead of the
-- synthetic fallback always firing. source_tables only ever tracked extraction *metadata* — no
-- table physically holds staged row data — so this adds a generic jsonb row store per source
-- table, seeded with a handful of representative rows per extracted table.

create table staging_rows (
  id uuid primary key default gen_random_uuid(),
  source_table_id uuid not null references source_tables on delete cascade,
  seq int not null default 1,
  row_data jsonb not null default '{}'::jsonb
);

-- child reached through source_tables, same pattern as xref_rows_all in 0002_rls.sql
alter table staging_rows enable row level security;
create policy staging_rows_all on staging_rows for all
  using (source_table_id in (select id from source_tables where wave_id in (select current_wave_ids())))
  with check (source_table_id in (select id from source_tables where wave_id in (select current_wave_ids())));

create index on staging_rows (source_table_id, seq);

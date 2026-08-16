-- Golden XREF: same structure-template + versioning pattern as Golden FMD (0013/0016/0018), for
-- cross-reference (value-mapping) tables — a singleton, program-wide, versioned field structure.

alter table xref_tables add column type text not null default 'Standard' check (type in ('Standard', 'Golden'));
alter table xref_tables alter column subproject_id drop not null;

create table xref_versions (
  id uuid primary key default gen_random_uuid(),
  xref_table_id uuid not null references xref_tables on delete cascade,
  version text not null,
  state text not null default 'Draft' check (state in ('Draft', 'In Review', 'Approved', 'Rejected')),
  structure jsonb not null default '{}'::jsonb,
  comment text,
  created_by text, created_at timestamptz not null default now(),
  unique (xref_table_id, version)
);

alter table xref_versions enable row level security;

create sequence xref_gld_seq;

-- Extends the display-id trigger from 0014 (create or replace keeps the same trigger, new body):
-- Golden gets its own prefix + a hard singleton guard, same as fmd_display_id().
create or replace function xref_display_id() returns trigger
language plpgsql as $$
declare prefix text; n bigint;
begin
  if new.display_id is not null then return new; end if;
  if new.type = 'Golden' then
    if exists (select 1 from xref_tables where type = 'Golden') then
      raise exception 'A Golden XREF already exists — only one is allowed.';
    end if;
    prefix := 'XREFGLD'; n := nextval('xref_gld_seq');
  elsif new.class = 'Global' then prefix := 'XREFGBL'; n := nextval('xref_gbl_seq');
  else prefix := 'XREFLCL'; n := nextval('xref_lcl_seq');
  end if;
  new.display_id := prefix || '-' || n;
  return new;
end;
$$;

-- RLS: allow program-wide (subproject_id is null) Golden XREF rows for any member — same fix as
-- fmds got in 0014, xref_tables never had it because subproject_id was NOT NULL until this file.
drop policy xref_tables_select on xref_tables;
create policy xref_tables_select on xref_tables for select using (
  subproject_id in (select current_wave_ids())
  or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
);

drop policy xref_tables_write on xref_tables;
create policy xref_tables_write on xref_tables for all using (
  subproject_id in (select current_wave_ids())
  or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
) with check (
  subproject_id in (select current_wave_ids())
  or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
);

create policy xref_versions_all on xref_versions for all using (
  xref_table_id in (
    select id from xref_tables
    where subproject_id in (select current_wave_ids())
       or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
  )
) with check (
  xref_table_id in (
    select id from xref_tables
    where subproject_id in (select current_wave_ids())
       or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
  )
);

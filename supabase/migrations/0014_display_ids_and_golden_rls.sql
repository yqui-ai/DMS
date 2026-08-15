-- Display IDs (FMDSTD-#, FMGLD-#, ...) for the Field Mapping / Rule / XREF catalogues, and an RLS
-- fix so program-wide (subproject_id is null) Golden FMDs can actually be inserted/read — the
-- generic subproject-scoped policies from 0002 never accounted for a null subproject_id.

/* ── fmds: extend type, add display_id ── */

alter table fmds drop constraint fmds_type_check;
alter table fmds add constraint fmds_type_check check (type in ('Standard', 'Golden', 'Historical', 'Custom'));

create sequence fmds_std_seq;
create sequence fmds_gld_seq;
create sequence fmds_hst_seq;
create sequence fmds_cst_seq;

alter table fmds add column display_id text unique;

create or replace function fmd_display_id() returns trigger
language plpgsql as $$
declare prefix text; n bigint;
begin
  if new.display_id is not null then return new; end if;
  case new.type
    when 'Golden' then prefix := 'FMGLD'; n := nextval('fmds_gld_seq');
    when 'Historical' then prefix := 'FMDHST'; n := nextval('fmds_hst_seq');
    when 'Custom' then prefix := 'FMDCST'; n := nextval('fmds_cst_seq');
    else prefix := 'FMDSTD'; n := nextval('fmds_std_seq');
  end case;
  new.display_id := prefix || '-' || n;
  return new;
end;
$$;

create trigger fmds_display_id_trg before insert on fmds
  for each row execute function fmd_display_id();

update fmds set display_id = (
  case type
    when 'Golden' then 'FMGLD-' || nextval('fmds_gld_seq')
    when 'Historical' then 'FMDHST-' || nextval('fmds_hst_seq')
    when 'Custom' then 'FMDCST-' || nextval('fmds_cst_seq')
    else 'FMDSTD-' || nextval('fmds_std_seq')
  end
) where display_id is null;

/* ── rules: Standard/Custom origin + display_id ── */

alter table rules add column origin text not null default 'Standard' check (origin in ('Standard', 'Custom'));

create sequence rules_std_seq;
create sequence rules_cst_seq;

alter table rules add column display_id text unique;

create or replace function rule_display_id() returns trigger
language plpgsql as $$
declare prefix text; n bigint;
begin
  if new.display_id is not null then return new; end if;
  if new.origin = 'Custom' then prefix := 'RULECST'; n := nextval('rules_cst_seq');
  else prefix := 'RULESTD'; n := nextval('rules_std_seq');
  end if;
  new.display_id := prefix || '-' || n;
  return new;
end;
$$;

create trigger rules_display_id_trg before insert on rules
  for each row execute function rule_display_id();

update rules set display_id = (
  case when origin = 'Custom' then 'RULECST-' || nextval('rules_cst_seq') else 'RULESTD-' || nextval('rules_std_seq') end
) where display_id is null;

/* ── xref_tables: Global/Local display_id (reuses the existing class column) ── */

create sequence xref_gbl_seq;
create sequence xref_lcl_seq;

alter table xref_tables add column display_id text unique;

create or replace function xref_display_id() returns trigger
language plpgsql as $$
declare prefix text; n bigint;
begin
  if new.display_id is not null then return new; end if;
  if new.class = 'Global' then prefix := 'XREFGBL'; n := nextval('xref_gbl_seq');
  else prefix := 'XREFLCL'; n := nextval('xref_lcl_seq');
  end if;
  new.display_id := prefix || '-' || n;
  return new;
end;
$$;

create trigger xref_display_id_trg before insert on xref_tables
  for each row execute function xref_display_id();

update xref_tables set display_id = (
  case when class = 'Global' then 'XREFGBL-' || nextval('xref_gbl_seq') else 'XREFLCL-' || nextval('xref_lcl_seq') end
) where display_id is null;

/* ── RLS: allow program-wide (subproject_id is null) fmds rows for any member ── */

drop policy fmds_select on fmds;
create policy fmds_select on fmds for select using (
  subproject_id in (select current_wave_ids())
  or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
);

drop policy fmds_write on fmds;
create policy fmds_write on fmds for all using (
  subproject_id in (select current_wave_ids())
  or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
) with check (
  subproject_id in (select current_wave_ids())
  or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
);

drop policy fmd_versions_all on fmd_versions;
create policy fmd_versions_all on fmd_versions for all using (
  fmd_id in (
    select id from fmds
    where subproject_id in (select current_wave_ids())
       or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
  )
) with check (
  fmd_id in (
    select id from fmds
    where subproject_id in (select current_wave_ids())
       or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
  )
);

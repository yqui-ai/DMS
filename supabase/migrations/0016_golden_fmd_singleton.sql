-- Golden FMD is a true singleton: exactly one row, ID always FMDGLD-1, and every save creates a
-- new fmd_versions row (a real version snapshot) instead of overwriting the latest one in place.

alter table fmd_versions add column comment text;

-- Rename the display-id prefix FMGLD -> FMDGLD (consistent with FMDSTD/FMDHST/FMDCST) and add a
-- hard singleton guard: a second Golden fmds row can never be inserted.
create or replace function fmd_display_id() returns trigger
language plpgsql as $$
declare prefix text; n bigint;
begin
  if new.display_id is not null then return new; end if;
  if new.type = 'Golden' and exists (select 1 from fmds where type = 'Golden') then
    raise exception 'A Golden FMD already exists — only one is allowed.';
  end if;
  case new.type
    when 'Golden' then prefix := 'FMDGLD'; n := nextval('fmds_gld_seq');
    when 'Historical' then prefix := 'FMDHST'; n := nextval('fmds_hst_seq');
    when 'Custom' then prefix := 'FMDCST'; n := nextval('fmds_cst_seq');
    else prefix := 'FMDSTD'; n := nextval('fmds_std_seq');
  end case;
  new.display_id := prefix || '-' || n;
  return new;
end;
$$;

-- Collapse any Golden fmds rows created before the singleton rule existed down to one (the
-- earliest, by its display-id sequence number), and normalize its id.
do $$
declare keep_id uuid;
begin
  select id into keep_id from fmds where type = 'Golden'
    order by nullif(regexp_replace(display_id, '\D', '', 'g'), '')::int asc nulls last
    limit 1;
  if keep_id is not null then
    delete from fmds where type = 'Golden' and id <> keep_id;
    update fmds set display_id = 'FMDGLD-1' where id = keep_id;
  end if;
end $$;

select setval('fmds_gld_seq', 1, false);

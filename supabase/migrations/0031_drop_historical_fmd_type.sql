-- Retires the 'Historical' FMD type.
--
-- It became unreachable when the converter changed: an uploaded legacy workbook is parsed in the
-- browser and converted straight into Custom FMDs, and the intermediate Historical record is never
-- persisted. Nothing in the app has written type='Historical' since. What remained was a filter
-- option that could only ever return nothing, a display-id sequence nobody drew from, and a
-- FmdVersion.sheets shape (historicalRaw) that was never populated.
--
-- Lineage back to the source workbook is NOT lost — it lives on the Custom FMD itself as
-- hist_source_name / hist_plant, which is what re-upload matching and the sibling-plants view key
-- on. Those columns stay.

-- Guard: refuse rather than silently strand data. If any Historical row exists (from before the
-- converter change), this migration stops and the rows must be dealt with deliberately — convert
-- them, or reclassify them — rather than being broken by a constraint they no longer satisfy.
do $$
declare n int;
begin
  select count(*) into n from fmds where type = 'Historical';
  if n > 0 then
    raise exception 'Cannot drop the Historical FMD type: % row(s) still use it. Convert or reclassify them first.', n;
  end if;
end $$;

alter table fmds drop constraint fmds_type_check;
alter table fmds add constraint fmds_type_check check (type in ('Standard', 'Golden', 'Custom'));

-- The display-id trigger loses its Historical branch. Everything else in it is unchanged from
-- 0016 — including the Golden singleton guard, which must survive this rewrite.
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
    when 'Custom' then prefix := 'FMDCST'; n := nextval('fmds_cst_seq');
    else prefix := 'FMDSTD'; n := nextval('fmds_std_seq');
  end case;
  new.display_id := prefix || '-' || n;
  return new;
end;
$$;

drop sequence if exists fmds_hst_seq;

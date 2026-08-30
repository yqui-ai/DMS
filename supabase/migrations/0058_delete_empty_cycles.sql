/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Cycles can be deleted too.

   A cycle could be created and then never edited or removed — it rendered as a plain chip on the
   subproject tile with no affordance at all, and `dms_delete_empty` rejected the level outright.
   That was a closed trap: a cycle added by mistake was permanent, and because cycles are the FIRST
   thing that blocks deleting a subproject, the mistake also made the subproject undeletable.

   A cycle has nothing beneath it in the hierarchy, so it is always a candidate — with one real
   exception. `runs.cycle_id references cycles` carries NO on-delete clause, so it defaults to NO
   ACTION: a cycle that has runs cannot be removed, and the database would refuse with an opaque
   foreign-key error. Named here instead, like every other blocker.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

create or replace function dms_delete_empty(p_level text, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  blocker text;
  prog uuid;
begin
  if p_level not in ('PRGM', 'PRJT', 'SPRJ', 'CYCL') then
    raise exception 'Only a program, project, subproject or cycle can be deleted this way.'
      using errcode = '22023';
  end if;

  prog := case p_level
    when 'PRGM' then p_id
    when 'PRJT' then (select program_id from projects where id = p_id)
    when 'SPRJ' then (select pj.program_id from subprojects s join projects pj on pj.id = s.project_id
                       where s.id = p_id)
    when 'CYCL' then (select pj.program_id
                        from cycles c
                        join subprojects s on s.id = c.subproject_id
                        join projects pj on pj.id = s.project_id
                       where c.id = p_id)
  end;
  if prog is null then
    raise exception 'That record no longer exists.' using errcode = 'P0002';
  end if;
  if not is_program_wide_admin(prog) then
    raise exception 'Only a program administrator may delete this.' using errcode = '42501';
  end if;

  if p_level = 'PRGM' then
    select case
      when exists (select 1 from migration_objects where program_id = p_id)
        then 'the SAP object catalogue'
      when exists (select 1 from projects where program_id = p_id) then 'projects'
    end into blocker;

  elsif p_level = 'PRJT' then
    select case
      when exists (select 1 from subprojects where project_id = p_id) then 'subprojects'
    end into blocker;

  elsif p_level = 'CYCL' then
    select case
      -- The only thing that can hold a cycle down. Without this the delete fails on the FK with a
      -- constraint name and nothing a person can act on.
      when exists (select 1 from runs where cycle_id = p_id) then 'migration runs'
    end into blocker;

  else
    select case
      when exists (select 1 from cycles where subproject_id = p_id) then 'cycles'
      when exists (select 1 from subproject_objects where subproject_id = p_id) then 'scope objects'
      when exists (select 1 from fmds where subproject_id = p_id) then 'Field Mappings'
      when exists (select 1 from rules where subproject_id = p_id) then 'rules'
      when exists (select 1 from xref_tables where subproject_id = p_id) then 'cross reference tables'
      when exists (select 1 from scope_candidates where subproject_id = p_id) then 'scope candidates'
    end into blocker;
  end if;

  if blocker is not null then
    raise exception 'This still has % — archive it instead of deleting it.', blocker
      using errcode = '23503',
            hint = 'Only an empty record can be deleted. Archiving keeps it and everything under it.';
  end if;

  perform set_config('dms.allow_hard_delete', 'on', true);
  case p_level
    when 'PRGM' then delete from programs where id = p_id;
    when 'PRJT' then delete from projects where id = p_id;
    when 'SPRJ' then delete from subprojects where id = p_id;
    when 'CYCL' then delete from cycles where id = p_id;
  end case;
  perform set_config('dms.allow_hard_delete', 'off', true);
end $$;

comment on function dms_delete_empty is
  'Deletes a program, project, subproject or cycle with no work beneath it. Blocks on the hierarchy '
  'below, the SAP catalogue, and (for a cycle) its runs — naming what is in the way so the caller '
  'can archive instead. Program admin only, checked here.';

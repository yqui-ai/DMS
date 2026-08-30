/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Delete an EMPTY program, project or subproject, instead of archiving it.

   0041's rule stands: records are archived, not deleted, because a hard delete once cascaded away
   a subproject's cycles, scope, FMDs, rules and runs. But that rule exists to protect what is
   BELOW a record. A project nobody ever put a subproject under has nothing below it, so archiving
   it only moves a typo into a list of archived typos — the archive becomes a bin for mistakes and
   stops being a record of things that mattered.

   So: empty means deletable. Not empty means archive, exactly as before.

   Emptiness is decided HERE, not by the caller. The client shows Delete when the tree it has
   loaded looks empty, but the tree does not carry scope rows or FMDs — this function is what makes
   the answer true, and it names what is in the way when it refuses.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

create or replace function dms_delete_empty(p_level text, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  blocker text;
  prog uuid;
begin
  if p_level not in ('PRGM', 'PRJT', 'SPRJ') then
    raise exception 'Only a program, project or subproject can be deleted this way.'
      using errcode = '22023';
  end if;

  /* ── Authorise against the programme the record belongs to ──────────────────────────────── */
  prog := case p_level
    when 'PRGM' then p_id
    when 'PRJT' then (select program_id from projects where id = p_id)
    when 'SPRJ' then (select pj.program_id from subprojects s join projects pj on pj.id = s.project_id
                       where s.id = p_id)
  end;
  if prog is null then
    raise exception 'That record no longer exists.' using errcode = 'P0002';
  end if;
  if not is_program_wide_admin(prog) then
    raise exception 'Only a program administrator may delete this.' using errcode = '42501';
  end if;

  /* ── Emptiness. First thing found is reported; the message names it so the answer is actionable
        rather than "cannot delete". ───────────────────────────────────────────────────────── */
  if p_level = 'PRGM' then
    select case
      -- The catalogue is OWNED by a program (migration_objects.program_id, cascade). Deleting a
      -- program that holds it would take the DMC objects and their structures and fields with it,
      -- and those only come back from a re-seed. This is the important one.
      when exists (select 1 from migration_objects where program_id = p_id)
        then 'the SAP object catalogue'
      when exists (select 1 from projects where program_id = p_id) then 'projects'
      when exists (select 1 from plants where program_id = p_id) then 'plants'
      when exists (select 1 from archive_requests where program_id = p_id) then 'archive requests'
    end into blocker;

  elsif p_level = 'PRJT' then
    select case
      when exists (select 1 from subprojects where project_id = p_id) then 'subprojects'
    end into blocker;

  else
    select case
      when exists (select 1 from cycles where subproject_id = p_id) then 'cycles'
      when exists (select 1 from subproject_objects where subproject_id = p_id) then 'scope objects'
      when exists (select 1 from fmds where subproject_id = p_id) then 'Field Mappings'
      when exists (select 1 from rules where subproject_id = p_id) then 'rules'
      when exists (select 1 from xref_tables where subproject_id = p_id) then 'cross reference tables'
      when exists (select 1 from scope_candidates where subproject_id = p_id) then 'scope candidates'
      when exists (select 1 from subproject_plants where subproject_id = p_id) then 'plant assignments'
    end into blocker;
  end if;

  if blocker is not null then
    raise exception 'This still has % — archive it instead of deleting it.', blocker
      using errcode = '23503',
            hint = 'Only an empty record can be deleted. Archiving keeps it and everything under it.';
  end if;

  /* ── Past the 0041 block trigger, for this one row, inside this one transaction ──────────── */
  perform set_config('dms.allow_hard_delete', 'on', true);
  case p_level
    when 'PRGM' then delete from programs where id = p_id;
    when 'PRJT' then delete from projects where id = p_id;
    when 'SPRJ' then delete from subprojects where id = p_id;
  end case;
  perform set_config('dms.allow_hard_delete', 'off', true);
end $$;

comment on function dms_delete_empty is
  'Deletes a program, project or subproject that has nothing beneath it. Refuses with the name of '
  'what is in the way otherwise, so the caller can archive instead. Program admin only, checked '
  'here. A program owning catalogue rows is never deletable — migration_objects cascades from it.';

revoke all on function dms_delete_empty(text, uuid) from public;
grant execute on function dms_delete_empty(text, uuid) to authenticated;

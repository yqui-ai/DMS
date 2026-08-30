/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Narrow what blocks deleting an empty record.

       This still has plants — archive it instead of deleting it.

   A program with no projects and no subprojects was refused because two plants hung off it. That
   is the wrong answer: 0055 treated everything attached to a record as a downstream dependency,
   but a plant is not work done underneath a program, it is a small piece of the program's own
   master data. With no subprojects there is nothing assigned to it and nothing referring to it —
   it is a leaf that cascades away cleanly.

   The distinction the rule should draw is not "is anything attached" but "would deleting this
   destroy work, or something expensive to get back":

     BLOCKS                                    CASCADES QUIETLY
     ─────────────────────────────────         ───────────────────────────────
     migration_objects  the SAP catalogue      plants              master data on the record
     projects           the hierarchy below    archive_requests    about the record itself
     subprojects        "                      subproject_plants   a link, not a thing
     cycles, scope, FMDs, rules, XREF

   What cascades is not hidden — the confirm dialog names it and its count before you agree, using
   data the page has already loaded. Told, rather than blocked.
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

  if p_level = 'PRGM' then
    select case
      -- The one that genuinely cannot be undone. migration_objects.program_id cascades, so
      -- deleting a program that owns catalogue rows takes the DMC objects and their structures and
      -- fields with it, and those only come back from a re-seed with a service-role key.
      when exists (select 1 from migration_objects where program_id = p_id)
        then 'the SAP object catalogue'
      when exists (select 1 from projects where program_id = p_id) then 'projects'
    end into blocker;
    -- plants and archive_requests deliberately no longer block. Both belong TO the program rather
    -- than sitting under it, both cascade, and the confirm dialog names them first.

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
    end into blocker;
    -- subproject_plants deliberately no longer blocks: it is a link to a plant, not the plant, and
    -- the plant itself is program-level and survives.
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
  end case;
  perform set_config('dms.allow_hard_delete', 'off', true);
end $$;

comment on function dms_delete_empty is
  'Deletes a program, project or subproject with no work beneath it. Blocks on the hierarchy below '
  'and on the SAP catalogue, naming what is in the way; plants, archive requests and plant '
  'assignments cascade instead of blocking, and the caller names them in the confirm. Program '
  'admin only, checked here.';

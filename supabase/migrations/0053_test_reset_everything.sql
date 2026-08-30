/* ─────────────────────────────────────────────────────────────────────────────────────────────
   TEMPORARY — a third reset mode: 'everything'.
   Drop with dms_reset_program and the Reset test data button. See 0052.

   "Delete everything except the migration object catalogue" cannot be done by deleting every
   program, and the reason is worth writing down because it is not obvious from the UI:

       programs → migration_objects → dmc_structures → dmc_fields
               (cascade)          (cascade)        (cascade)

   `migration_objects.program_id` is NOT NULL with ON DELETE CASCADE (0009) — the catalogue is
   OWNED by a program. Deleting the last program therefore takes the 442 DMC objects and the
   ~180k structure/field rows with it, and those do not come back from seed.sql: they load
   separately through `npm run seed:load-structures` with a service-role key.

   So 'everything' keeps exactly the programs that own catalogue rows, and empties them completely.
   Every other program is deleted outright. What is left is a programme shell holding the SAP
   catalogue and nothing else — which is what "start from scratch" has to mean here.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

create or replace function dms_reset_program(p_program_id uuid, p_mode text default 'data')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  keep_ids uuid[];
  drop_ids uuid[];
  sub_ids uuid[];
  prj_ids uuid[];
  n_fmds int := 0; n_rules int := 0; n_xrefs int := 0;
  n_scope int := 0; n_cand int := 0; n_waiv int := 0;
  n_cycles int := 0; n_subs int := 0; n_prjs int := 0;
  n_programs int := 0; n_plants int := 0; n_archive int := 0; n_log int := 0;
begin
  if p_mode not in ('data', 'hierarchy', 'everything') then
    raise exception 'Unknown reset mode: %', p_mode using errcode = '22023';
  end if;

  /* ── 'everything': programme-wide, so the authorisation has to be too ─────────────────────── */
  if p_mode = 'everything' then
    -- Every program that owns catalogue rows survives as its shell. Usually one.
    select coalesce(array_agg(distinct program_id), '{}'::uuid[]) into keep_ids
      from migration_objects;

    select coalesce(array_agg(id), '{}'::uuid[]) into drop_ids
      from programs where not (id = any(keep_ids));

    -- Admin of every programme this will touch, checked here rather than trusted from the caller.
    -- A reset that reaches across programmes must not be authorised by rights over just one.
    if exists (
      select 1 from programs p
      where (p.id = any(keep_ids) or p.id = any(drop_ids))
        and not is_program_wide_admin(p.id)
    ) then
      raise exception 'You must administer every program to reset everything.' using errcode = '42501';
    end if;

    select count(*) into n_programs from programs where id = any(drop_ids);
    select count(*) into n_prjs   from projects;
    select count(*) into n_subs   from subprojects;
    select count(*) into n_cycles from cycles;
    select count(*) into n_fmds   from fmds;
    select count(*) into n_rules  from rules;
    select count(*) into n_xrefs  from xref_tables;
    select count(*) into n_scope  from subproject_objects;
    select count(*) into n_cand   from scope_candidates;
    select count(*) into n_waiv   from scope_waivers;
    select count(*) into n_plants from plants;
    select count(*) into n_archive from archive_requests;
    select count(*) into n_log    from change_log;

    perform set_config('dms.allow_hard_delete', 'on', true);

    -- Programmes with no catalogue rows go whole: projects, subprojects, cycles, every
    -- subproject-scoped table, their plants, their memberships and their archive requests all
    -- cascade from here.
    delete from programs where id = any(drop_ids);

    -- The kept shells are emptied by hand, since nothing above them is being removed.
    delete from projects where program_id = any(keep_ids);   -- cascades the whole tree below
    -- Program-wide rows have no subproject to cascade from: the Golden FMD, every Standard FMD and
    -- the Golden XREF live at `subproject_id is null` and survive everything else. This is the one
    -- mode that clears them, which is the whole point of it.
    delete from fmds;
    delete from xref_tables;
    delete from plants where program_id = any(keep_ids);
    delete from archive_requests where program_id = any(keep_ids);

    -- Append-only for everyone else: `change_log` has a SELECT policy and deliberately no INSERT,
    -- UPDATE or DELETE policy. This function is SECURITY DEFINER so it runs as the owner and RLS
    -- does not apply — the only route that can clear the log, which is as it should be.
    delete from change_log;

    perform set_config('dms.allow_hard_delete', 'off', true);

    /* Memberships on the kept programmes are deliberately NOT deleted. They are not test data, and
       removing your own program_admin row would lock you out of the programme you just reset with
       no way back in — `programs_insert` lets you make a NEW one, but not re-enter this one.
       Memberships on deleted programmes cascade away on their own. */

    return jsonb_build_object(
      'programs', n_programs, 'projects', n_prjs, 'subprojects', n_subs, 'cycles', n_cycles,
      'fmds', n_fmds, 'rules', n_rules, 'xrefs', n_xrefs, 'scopeObjects', n_scope,
      'candidates', n_cand, 'waivers', n_waiv, 'plants', n_plants,
      'archiveRequests', n_archive, 'changeLog', n_log
    );
  end if;

  /* ── 'data' and 'hierarchy': one programme, exactly as 0052 ──────────────────────────────── */
  if not is_program_wide_admin(p_program_id) then
    raise exception 'Only a program administrator may reset this program.' using errcode = '42501';
  end if;

  select array_agg(id) into prj_ids from projects where program_id = p_program_id;
  if prj_ids is null then
    return jsonb_build_object('programs', 0, 'projects', 0, 'subprojects', 0, 'cycles', 0,
                              'fmds', 0, 'rules', 0, 'xrefs', 0, 'scopeObjects', 0,
                              'candidates', 0, 'waivers', 0, 'plants', 0,
                              'archiveRequests', 0, 'changeLog', 0);
  end if;

  select array_agg(id) into sub_ids from subprojects where project_id = any(prj_ids);
  sub_ids := coalesce(sub_ids, '{}'::uuid[]);

  select count(*) into n_waiv  from scope_waivers      where subproject_id = any(sub_ids);
  select count(*) into n_cand  from scope_candidates   where subproject_id = any(sub_ids);
  select count(*) into n_scope from subproject_objects where subproject_id = any(sub_ids);
  select count(*) into n_rules from rules              where subproject_id = any(sub_ids);
  select count(*) into n_xrefs from xref_tables        where subproject_id = any(sub_ids);
  select count(*) into n_fmds  from fmds               where subproject_id = any(sub_ids);
  select count(*) into n_cycles from cycles            where subproject_id = any(sub_ids);

  perform set_config('dms.allow_hard_delete', 'on', true);

  if p_mode = 'hierarchy' then
    n_subs := coalesce(array_length(sub_ids, 1), 0);
    n_prjs := coalesce(array_length(prj_ids, 1), 0);
    delete from projects where id = any(prj_ids);
  else
    delete from scope_waivers      where subproject_id = any(sub_ids);
    delete from scope_candidates   where subproject_id = any(sub_ids);
    delete from subproject_objects where subproject_id = any(sub_ids);
    delete from rules              where subproject_id = any(sub_ids);
    delete from xref_tables        where subproject_id = any(sub_ids);
    delete from fmds               where subproject_id = any(sub_ids);
    n_cycles := 0;
  end if;

  perform set_config('dms.allow_hard_delete', 'off', true);

  return jsonb_build_object(
    'programs', 0, 'projects', n_prjs, 'subprojects', n_subs, 'cycles', n_cycles,
    'fmds', n_fmds, 'rules', n_rules, 'xrefs', n_xrefs, 'scopeObjects', n_scope,
    'candidates', n_cand, 'waivers', n_waiv, 'plants', 0,
    'archiveRequests', 0, 'changeLog', 0
  );
end $$;

comment on function dms_reset_program is
  'TEMPORARY. Empties a programme (data | hierarchy) or the whole system (everything), in one '
  'transaction. Admin-checked here, not trusted from the caller. NEVER deletes migration_objects, '
  'dmc_structures, dmc_fields, app_users or roles — the catalogue is owned by a program via a '
  'cascading FK, so ''everything'' keeps the programs holding it and empties them instead. '
  'Drop with the reset feature.';

revoke all on function dms_reset_program(uuid, text) from public;
grant execute on function dms_reset_program(uuid, text) to authenticated;

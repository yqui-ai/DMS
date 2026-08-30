/* ─────────────────────────────────────────────────────────────────────────────────────────────
   TEMPORARY — fix for 0053's 'everything' mode. Drop with the reset feature.

       reset: DELETE requires a WHERE clause · 21000

   Supabase runs the `safeupdate` guard, which rejects an unqualified DELETE or UPDATE. It is an
   executor hook rather than a PostgREST check, so it fires inside a SECURITY DEFINER function too —
   `delete from fmds;` is refused wherever it is written. 0053 had three such statements and the
   whole mode failed on the first one.

   The fix is not to disable the guard. It is there for exactly the mistake this function would be
   making if the WHERE were ever wrong, and turning it off inside the one function that deletes the
   most would be precisely backwards. Each statement gets the predicate it should have had:

     · fmds / xref_tables — `subproject_id is null`. By this point every subproject is already gone
       (all projects under the kept programmes were deleted, and the other programmes deleted
       outright), so the only rows left are the program-wide ones: the Golden FMD, the Standard
       FMDs and the Golden XREF. Naming that condition says what is being removed instead of
       relying on "whatever survived".

     · change_log — has no scoping column to speak of and is genuinely emptied whole, so
       `id is not null` is the honest form: a predicate that satisfies the guard without pretending
       to narrow anything.
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

  if p_mode = 'everything' then
    select coalesce(array_agg(distinct program_id), '{}'::uuid[]) into keep_ids
      from migration_objects;

    select coalesce(array_agg(id), '{}'::uuid[]) into drop_ids
      from programs where not (id = any(keep_ids));

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

    delete from programs where id = any(drop_ids);
    delete from projects where program_id = any(keep_ids);

    -- Program-wide rows: the Golden FMD, the Standard FMDs, the Golden XREF. Everything scoped to a
    -- subproject has already gone with the subprojects above, so this predicate names precisely
    -- what is left rather than deleting whatever remains.
    delete from fmds        where subproject_id is null;
    delete from xref_tables where subproject_id is null;

    delete from plants           where program_id = any(keep_ids);
    delete from archive_requests where program_id = any(keep_ids);

    -- Append-only for everyone else: `change_log` has a SELECT policy and deliberately no INSERT,
    -- UPDATE or DELETE policy, so this SECURITY DEFINER function is the only thing that can empty
    -- it. `id is not null` is the whole-table predicate `safeupdate` requires.
    delete from change_log where id is not null;

    perform set_config('dms.allow_hard_delete', 'off', true);

    /* Memberships on the kept programmes are deliberately NOT deleted. Removing your own
       program_admin row would lock you out of the programme you just reset with no way back in —
       `programs_insert` lets you make a NEW one, but not re-enter this one. Memberships on deleted
       programmes cascade away on their own. */

    return jsonb_build_object(
      'programs', n_programs, 'projects', n_prjs, 'subprojects', n_subs, 'cycles', n_cycles,
      'fmds', n_fmds, 'rules', n_rules, 'xrefs', n_xrefs, 'scopeObjects', n_scope,
      'candidates', n_cand, 'waivers', n_waiv, 'plants', n_plants,
      'archiveRequests', n_archive, 'changeLog', n_log
    );
  end if;

  /* ── 'data' and 'hierarchy': one programme. Every statement below was already qualified. ──── */
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
  'transaction. Admin-checked here, not trusted from the caller. Every DELETE is qualified — '
  'Supabase''s safeupdate guard rejects unqualified ones, and rightly so in the function that '
  'deletes the most. NEVER touches migration_objects, dmc_structures, dmc_fields, app_users or '
  'roles. Drop with the reset feature.';

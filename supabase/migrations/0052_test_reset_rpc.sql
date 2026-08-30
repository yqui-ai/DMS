/* ─────────────────────────────────────────────────────────────────────────────────────────────
   TEMPORARY — the test-data reset, done properly.
   Drop `dms_reset_program` and revert `dms_block_delete` to its 0041 body when the Reset test data
   button is removed. See src/lib/queries/testReset.ts.

   The reset feature collided with a deliberate rule. 0041 blocks DELETE on programs, projects,
   subprojects, cycles, migration_objects, fmds, xref_tables and rules — "nothing is deleted,
   enforced here, not only in the UI" — because a hard delete once cascaded away a subproject's
   entire contents. That rule is correct and stays.

   Two things went wrong doing the reset from the client:

   1. It could not finish. `scope_waivers`, `scope_candidates` and `subproject_objects` are not on
      0041's list so they deleted; `fmds` is, so it raised. The reset stopped half-done — scope
      gone, documents still there — which is a worse state than either end of it.

   2. Six separate PostgREST calls are six transactions. There was never a point at which the whole
      reset either happened or did not.

   Both are fixed by doing it in one authorised function: a transaction-local escape hatch the
   blocking trigger honours, and every delete in a single statement block that rolls back together.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

/* ── The escape hatch ─────────────────────────────────────────────────────────────────────────

   `dms.allow_hard_delete` is set with `set_config(..., is_local => true)`, so it lives for the
   duration of one transaction and cannot leak into the next statement on a pooled connection. It
   is set in exactly one place — `dms_reset_program` below, after that function has checked the
   caller administers the programme.

   A client cannot set it itself: GUCs are not settable over PostgREST, and `set_config` lives in
   `pg_catalog` rather than an exposed schema. The only route to a hard delete remains the one
   authorised function. */

create or replace function dms_block_delete() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('dms.allow_hard_delete', true), '') = 'on' then
    return old;
  end if;
  raise exception
    'Records are archived, not deleted. Raise an archive request for this % instead.', tg_table_name
    using errcode = '42501',
          hint = 'See archive_requests. Archiving keeps the record and its history, and can be undone.';
end $$;

comment on function dms_block_delete is
  'Backstop for the archive-not-delete rule. Fires before delete on every record-bearing table. '
  'Yields only to dms.allow_hard_delete, which only dms_reset_program sets, and only for one '
  'transaction. TEMPORARY exception — remove with the reset feature.';

/* ── The reset ────────────────────────────────────────────────────────────────────────────────

   SECURITY DEFINER, and it authorises the caller itself rather than trusting the argument: only a
   program-wide admin of the programme being reset may run it. Everything happens in this one
   function, so it is one transaction — a failure part-way leaves the programme exactly as it was.

   What it can never reach, in either mode:
     · the programme row itself
     · the Golden FMD, every Standard FMD and the Golden XREF — program-wide rows
       (`subproject_id is null`), so neither the subproject-scoped delete nor the cascade from
       `projects` touches them
     · plants, and the SAP migration_objects catalogue
   That protection is structural, not a filter: there is no argument to this function that widens
   it. */

create or replace function dms_reset_program(p_program_id uuid, p_mode text default 'data')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sub_ids uuid[];
  prj_ids uuid[];
  removed jsonb;
  n_fmds int := 0; n_rules int := 0; n_xrefs int := 0;
  n_scope int := 0; n_cand int := 0; n_waiv int := 0;
  n_cycles int := 0; n_subs int := 0; n_prjs int := 0;
begin
  if p_mode not in ('data', 'hierarchy') then
    raise exception 'Unknown reset mode: %', p_mode using errcode = '22023';
  end if;

  if not is_program_wide_admin(p_program_id) then
    raise exception 'Only a program administrator may reset this program.' using errcode = '42501';
  end if;

  select array_agg(id) into prj_ids from projects where program_id = p_program_id;
  if prj_ids is null then
    return jsonb_build_object('projects', 0, 'subprojects', 0, 'cycles', 0, 'fmds', 0,
                              'rules', 0, 'xrefs', 0, 'scopeObjects', 0, 'candidates', 0, 'waivers', 0);
  end if;

  select array_agg(id) into sub_ids from subprojects where project_id = any(prj_ids);
  sub_ids := coalesce(sub_ids, '{}'::uuid[]);

  -- Counted before the deletes, so the caller is told what actually went rather than what a
  -- separate preview guessed a moment earlier.
  select count(*) into n_waiv  from scope_waivers      where subproject_id = any(sub_ids);
  select count(*) into n_cand  from scope_candidates   where subproject_id = any(sub_ids);
  select count(*) into n_scope from subproject_objects where subproject_id = any(sub_ids);
  select count(*) into n_rules from rules              where subproject_id = any(sub_ids);
  select count(*) into n_xrefs from xref_tables        where subproject_id = any(sub_ids);
  select count(*) into n_fmds  from fmds               where subproject_id = any(sub_ids);
  select count(*) into n_cycles from cycles            where subproject_id = any(sub_ids);

  -- Transaction-local, and only from here.
  perform set_config('dms.allow_hard_delete', 'on', true);

  if p_mode = 'hierarchy' then
    n_subs := coalesce(array_length(sub_ids, 1), 0);
    n_prjs := coalesce(array_length(prj_ids, 1), 0);
    -- `subprojects.project_id`, `cycles.subproject_id` and every subproject-scoped table declare
    -- `on delete cascade`, so one statement takes the whole tree. Row triggers still fire on
    -- cascaded deletes, so the change log records every one of them.
    delete from projects where id = any(prj_ids);
  else
    delete from scope_waivers      where subproject_id = any(sub_ids);
    delete from scope_candidates   where subproject_id = any(sub_ids);
    delete from subproject_objects where subproject_id = any(sub_ids);
    -- fmd_versions and fmd_field_notes cascade from fmds; xref_versions from xref_tables.
    delete from rules              where subproject_id = any(sub_ids);
    delete from xref_tables        where subproject_id = any(sub_ids);
    delete from fmds               where subproject_id = any(sub_ids);
    n_cycles := 0;  -- cycles survive a data-only reset; the waves are meant to be re-walked
  end if;

  -- Belt and braces. `is_local` already ends it with the transaction; clearing it makes the narrow
  -- window explicit to anyone reading this rather than implied by an argument three lines up.
  perform set_config('dms.allow_hard_delete', 'off', true);

  removed := jsonb_build_object(
    'projects', n_prjs, 'subprojects', n_subs, 'cycles', n_cycles,
    'fmds', n_fmds, 'rules', n_rules, 'xrefs', n_xrefs,
    'scopeObjects', n_scope, 'candidates', n_cand, 'waivers', n_waiv
  );
  return removed;
end $$;

comment on function dms_reset_program is
  'TEMPORARY. Empties one programme for testing, in one transaction. Program-wide admin only, '
  'checked here rather than trusted from the caller. Cannot reach the programme row, the Golden '
  'or Standard FMDs, the Golden XREF, plants or the object catalogue. Drop with the reset feature.';

revoke all on function dms_reset_program(uuid, text) from public;
grant execute on function dms_reset_program(uuid, text) to authenticated;

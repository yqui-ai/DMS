/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Plants stop belonging to a program.

   0049 gave `plants` a NOT NULL `program_id`, reasoning that a plant is programme master data. That
   was wrong twice over.

   Wrong about the world: plant 1010 is a physical SAP site. It is the same site whichever programme
   happens to be migrating it, and two programmes touching 1010 are touching one plant, not two
   records that share a code.

   Wrong on screen, which is how it surfaced: Plant Maintenance showed 1010 with a Program column
   naming PROJX and a Used by column reading "Not assigned" — one row asserting both that the plant
   belonged to a programme and that it was assigned to nothing. The program column read as an
   assignment because there was nothing else for it to mean.

   A plant now has exactly one relationship: the subprojects that cover it, through
   `subproject_plants`. Everything above that — which project, which programme — is DERIVED from
   those assignments, the same way a project's plants are derived from its subprojects'.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

/* The code is unique across the system now, not per programme. Dropped and rebuilt rather than
   altered, because the column it keys on is going. Still partial on `archived_at is null`, so
   retiring a plant frees its code for reuse. */
drop index if exists plants_program_code_key;
drop index if exists plants_program_idx;

/* The POLICIES have to go before the column does. Both read `program_id`, and Postgres refuses to
   drop a column anything still depends on:

     cannot drop column program_id of table plants because other objects depend on it
     policy plants_select on table plants depends on column program_id of table plants

   Dropped here and recreated at the bottom in their new, programme-free form. The gap between is
   not an exposure: `supabase db push` runs each migration in one transaction, so the table is never
   visible without a policy — and RLS stays enabled throughout, which denies by default anyway. */
drop policy if exists plants_select on plants;
drop policy if exists plants_write on plants;

/* Any duplicate that only existed because two programmes each had their own 1010 has to go before
   the global index can be built. The survivor is the oldest — it is the one anything already
   points at — and its assignments absorb the others' so no subproject silently loses a plant. */
update subproject_plants sp
   set plant_id = keep.id
  from plants dup
  join lateral (
    select p2.id from plants p2
     where upper(p2.code) = upper(dup.code) and p2.archived_at is null
     order by p2.created_at
     limit 1
  ) keep on true
 where sp.plant_id = dup.id
   and dup.archived_at is null
   and dup.id <> keep.id
   and not exists (
     select 1 from subproject_plants x
      where x.subproject_id = sp.subproject_id and x.plant_id = keep.id
   );

delete from subproject_plants sp
 using plants dup
 where sp.plant_id = dup.id
   and dup.archived_at is null
   and exists (
     select 1 from plants p2
      where upper(p2.code) = upper(dup.code) and p2.archived_at is null
        and p2.created_at < dup.created_at
   );

delete from plants dup
 where dup.archived_at is null
   and exists (
     select 1 from plants p2
      where upper(p2.code) = upper(dup.code) and p2.archived_at is null
        and p2.created_at < dup.created_at
   );

alter table plants drop column if exists program_id;

create unique index if not exists plants_code_key
  on plants (upper(code)) where archived_at is null;

/* ── RLS ──────────────────────────────────────────────────────────────────────────────────────
   Reading: anyone with a membership. A plant is a site name and a location; there is nothing in it
   to scope, and a plant list that differed per programme is precisely the model being removed.

   Writing: any program admin. Not narrower, because there is no longer a programme to check the
   plant against — the check has to be about the person, not about the row. */

create policy plants_select on plants for select
  using (exists (select 1 from memberships m where m.user_id = auth.uid()));

create policy plants_write on plants for all
  using (exists (
    select 1 from memberships m where m.user_id = auth.uid() and m.role_id = 'program_admin'
  ))
  with check (exists (
    select 1 from memberships m where m.user_id = auth.uid() and m.role_id = 'program_admin'
  ));

/* ── The two functions that named plants by programme ────────────────────────────────────────
   `dms_delete_empty` no longer has to think about plants at all: deleting a program cannot reach
   them any more, so they were never a blocker and are no longer a cascade either.

   `dms_reset_program` keeps clearing them, but only in 'everything' — a plant is system-wide now,
   so a programme-scoped reset has no business touching it. */

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
      when exists (select 1 from migration_objects where program_id = p_id)
        then 'the SAP object catalogue'
      when exists (select 1 from projects where program_id = p_id) then 'projects'
    end into blocker;
    -- Plants are gone from this list for good: they are no longer owned by a programme, so deleting
    -- one neither blocks on them nor takes them with it.

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

/* Only the plants line changes in the reset; the rest is 0054 verbatim. */
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
    delete from fmds        where subproject_id is null;
    delete from xref_tables where subproject_id is null;
    -- System-wide now, so the whole table goes rather than one programme's share.
    delete from plants where id is not null;
    delete from archive_requests where program_id = any(keep_ids);
    delete from change_log where id is not null;

    perform set_config('dms.allow_hard_delete', 'off', true);

    return jsonb_build_object(
      'programs', n_programs, 'projects', n_prjs, 'subprojects', n_subs, 'cycles', n_cycles,
      'fmds', n_fmds, 'rules', n_rules, 'xrefs', n_xrefs, 'scopeObjects', n_scope,
      'candidates', n_cand, 'waivers', n_waiv, 'plants', n_plants,
      'archiveRequests', n_archive, 'changeLog', n_log
    );
  end if;

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

comment on table plants is
  'SAP plants (sites). System-wide master data — a plant belongs to no programme. Its only '
  'relationship is the subprojects covering it, via subproject_plants; project and programme are '
  'derived from those.';

/* Restructures the programme hierarchy from Project > Release > Wave > Cycle to
   Program > Project > Subproject > Cycle:
     projects  (old top level)  -> programs
     releases  (old mid level)  -> projects   (repurposed as the new mid tier — existing
                                                release rows carry over as project rows)
     waves     (old bottom-but-one) -> subprojects
     cycles stays "cycles", just re-parented under subprojects
   Every scoping column is renamed to match: the old top-level scope (project_id) becomes
   program_id everywhere; the old wave scope (wave_id) becomes subproject_id everywhere.
   These are pure ALTER TABLE .. RENAME operations — Postgres tracks columns by attnum, so
   every dependent RLS policy, view, index and FK auto-follows the rename with no data loss
   and no policy rewrite needed.

   The two RLS helper functions keep their existing names (current_project_ids,
   current_wave_ids) even though they now compute program/subproject ids — only their bodies
   are redefined in place via CREATE OR REPLACE, so every policy that calls them (by OID, not
   by text) keeps working automatically with zero edits. Nothing in the application code calls
   these functions directly; they're only ever referenced from inside RLS policy bodies. */

/* entity tables */

alter table projects rename to programs;

alter table releases rename to projects;

alter table projects rename column project_id to program_id;

alter table waves rename to subprojects;

alter table subprojects rename column release_id to project_id;

alter table cycles rename column wave_id to subproject_id;

alter table wave_objects rename to subproject_objects;

alter table subproject_objects rename column wave_id to subproject_id;

/* subproject-scoped tables: wave_id -> subproject_id */

alter table memberships rename column wave_id to subproject_id;

alter table staging_db rename column wave_id to subproject_id;

alter table source_tables rename column wave_id to subproject_id;

alter table table_groups rename column wave_id to subproject_id;

alter table extraction_jobs rename column wave_id to subproject_id;

alter table selection_criteria rename column wave_id to subproject_id;

alter table fmds rename column wave_id to subproject_id;

alter table rules rename column wave_id to subproject_id;

alter table xref_tables rename column wave_id to subproject_id;

alter table etl_objects rename column wave_id to subproject_id;

alter table etl_globals rename column wave_id to subproject_id;

alter table runs rename column wave_id to subproject_id;

alter table dq_dimensions rename column wave_id to subproject_id;

alter table dq_checks rename column wave_id to subproject_id;

alter table cutover_tasks rename column wave_id to subproject_id;

alter table promotions rename column wave_id to subproject_id;

alter table audit_log rename column wave_id to subproject_id;

alter table check_tables rename column wave_id to subproject_id;

alter table unmapped_values rename column wave_id to subproject_id;

/* program-scoped tables: project_id -> program_id */

alter table memberships rename column project_id to program_id;

alter table connections rename column project_id to program_id;

alter table approval_matrix rename column project_id to program_id;

alter table audit_log rename column project_id to program_id;

alter table golden_library rename column project_id to program_id;

alter table ai_provider_keys rename column project_id to program_id;

alter table timeline_categories rename column project_id to program_id;

/* RLS helper functions: redefined in place under their existing names */

create or replace function current_project_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct program_id from memberships where user_id = auth.uid();
$$;

create or replace function current_wave_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.id from subprojects s
    join projects p on p.id = s.project_id
    join memberships m on m.program_id = p.program_id and m.user_id = auth.uid()
   where m.subproject_id is null
  union
  select m.subproject_id from memberships m where m.user_id = auth.uid() and m.subproject_id is not null;
$$;

create or replace function is_program_admin(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m where m.user_id = auth.uid() and m.role_id = 'program_admin' and m.program_id = p_project_id
  );
$$;

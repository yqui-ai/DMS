-- Row level security: access is granted through memberships (project + optional wave).

create or replace function current_project_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct project_id from memberships where user_id = auth.uid();
$$;

create or replace function current_wave_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  -- waves explicitly granted, plus every wave of a project-wide membership
  select w.id from waves w
    join releases r on r.id = w.release_id
    join memberships m on m.project_id = r.project_id and m.user_id = auth.uid()
   where m.wave_id is null
  union
  select m.wave_id from memberships m where m.user_id = auth.uid() and m.wave_id is not null;
$$;

create or replace function has_screen(screen text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
      join role_screens rs on rs.role_id = m.role_id
     where m.user_id = auth.uid() and rs.screen_key = screen and rs.can_view
  );
$$;

-- wave-scoped tables
do $$
declare t text;
begin
  foreach t in array array[
    'cycles','wave_objects','staging_db','source_tables','table_groups','extraction_jobs',
    'selection_criteria','fmds','rules','xref_tables','etl_objects','etl_globals','runs',
    'dq_dimensions','dq_checks','cutover_tasks','promotions','audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$create policy %I_select on %I for select using (wave_id in (select current_wave_ids()))$f$, t, t);
    execute format($f$create policy %I_write on %I for all using (wave_id in (select current_wave_ids())) with check (wave_id in (select current_wave_ids()))$f$, t, t);
  end loop;
end $$;

-- project-scoped tables
do $$
declare t text;
begin
  foreach t in array array['releases','connections','approval_matrix'] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$create policy %I_select on %I for select using (project_id in (select current_project_ids()))$f$, t, t);
    execute format($f$create policy %I_write on %I for all using (project_id in (select current_project_ids())) with check (project_id in (select current_project_ids()))$f$, t, t);
  end loop;
end $$;

alter table projects enable row level security;
create policy projects_select on projects for select using (id in (select current_project_ids()));

alter table waves enable row level security;
create policy waves_select on waves for select using (id in (select current_wave_ids()));
create policy waves_update on waves for update using (id in (select current_wave_ids())) with check (id in (select current_wave_ids()));

-- children reached through a parent (nodes/edges/rows/logs)
alter table etl_nodes enable row level security;
create policy etl_nodes_all on etl_nodes for all
  using (object_id in (select id from etl_objects where wave_id in (select current_wave_ids())))
  with check (object_id in (select id from etl_objects where wave_id in (select current_wave_ids())));

alter table etl_edges enable row level security;
create policy etl_edges_all on etl_edges for all
  using (object_id in (select id from etl_objects where wave_id in (select current_wave_ids())))
  with check (object_id in (select id from etl_objects where wave_id in (select current_wave_ids())));

alter table run_log enable row level security;
create policy run_log_all on run_log for all
  using (run_id in (select id from runs where wave_id in (select current_wave_ids())))
  with check (run_id in (select id from runs where wave_id in (select current_wave_ids())));

alter table table_group_members enable row level security;
create policy tgm_all on table_group_members for all
  using (group_id in (select id from table_groups where wave_id in (select current_wave_ids())))
  with check (group_id in (select id from table_groups where wave_id in (select current_wave_ids())));

alter table extraction_job_groups enable row level security;
create policy ejg_all on extraction_job_groups for all
  using (job_id in (select id from extraction_jobs where wave_id in (select current_wave_ids())))
  with check (job_id in (select id from extraction_jobs where wave_id in (select current_wave_ids())));

alter table fmd_versions enable row level security;
create policy fmd_versions_all on fmd_versions for all
  using (fmd_id in (select id from fmds where wave_id in (select current_wave_ids())))
  with check (fmd_id in (select id from fmds where wave_id in (select current_wave_ids())));

alter table xref_rows enable row level security;
create policy xref_rows_all on xref_rows for all
  using (xref_table_id in (select id from xref_tables where wave_id in (select current_wave_ids())))
  with check (xref_table_id in (select id from xref_tables where wave_id in (select current_wave_ids())));

-- catalogue is readable by any authenticated member, writable by Program Admin only
alter table migration_objects enable row level security;
create policy mo_select on migration_objects for select using (auth.uid() is not null);
create policy mo_write on migration_objects for all
  using (exists (select 1 from memberships m where m.user_id = auth.uid() and m.role_id = 'program_admin'))
  with check (exists (select 1 from memberships m where m.user_id = auth.uid() and m.role_id = 'program_admin'));

alter table object_structures enable row level security;
create policy os_select on object_structures for select using (auth.uid() is not null);

alter table object_dependencies enable row level security;
create policy od_select on object_dependencies for select using (auth.uid() is not null);

-- identity
alter table app_users enable row level security;
create policy app_users_self on app_users for select using (
  id = auth.uid() or exists (select 1 from memberships m where m.user_id = auth.uid())
);
alter table roles enable row level security;
create policy roles_select on roles for select using (auth.uid() is not null);
alter table role_screens enable row level security;
create policy role_screens_select on role_screens for select using (auth.uid() is not null);
alter table memberships enable row level security;
create policy memberships_select on memberships for select using (
  user_id = auth.uid() or project_id in (select current_project_ids())
);

-- audit log is append-only
create policy audit_no_update on audit_log for update using (false);
create policy audit_no_delete on audit_log for delete using (false);

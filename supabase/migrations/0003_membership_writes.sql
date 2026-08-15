-- Fills two gaps left by 0001/0002: memberships/app_users had no write policies, and there was no
-- trigger to create an app_users row when someone signs up through the app's own sign-up form
-- (the seed script's guarded inserts only backfill the four demo users once).

-- auto-create an app_users row for every new auth.users row (name falls back to the email's local part)
create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into app_users (id, name, email, status)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email, 'Active')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- same security-definer pattern as current_project_ids()/current_wave_ids() in 0002_rls.sql,
-- so this doesn't recurse back into memberships' own RLS policy.
create or replace function is_program_admin(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m where m.user_id = auth.uid() and m.role_id = 'program_admin' and m.project_id = p_project_id
  );
$$;

create policy memberships_write on memberships for all
  using (is_program_admin(project_id))
  with check (is_program_admin(project_id));

-- users can update their own profile (name, notification prefs, etc. — used by the /me screen)
create policy app_users_self_update on app_users for update using (id = auth.uid()) with check (id = auth.uid());

-- role_screens is global reference data (not project-scoped) — same program_admin check as
-- migration_objects' mo_write policy in 0002_rls.sql.
create policy role_screens_write on role_screens for all
  using (exists (select 1 from memberships m where m.user_id = auth.uid() and m.role_id = 'program_admin'))
  with check (exists (select 1 from memberships m where m.user_id = auth.uid() and m.role_id = 'program_admin'));

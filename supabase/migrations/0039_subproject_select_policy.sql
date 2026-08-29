-- A subproject could not be created, because its SELECT policy cannot see a subproject that does
-- not exist yet.
--
--   new row violates row-level security policy for table "subprojects"
--
-- `waves_select` (0002, renamed by 0008) is `id in (select current_wave_ids())`, and
-- `current_wave_ids()` derives that set by QUERYING SUBPROJECTS. The function is STABLE, so it sees
-- the snapshot from the start of the statement — which does not contain the row the statement is
-- inserting. The client inserts with RETURNING, RETURNING applies the SELECT policy to the new row,
-- the policy asks a function that structurally cannot know about it, and the insert is rejected.
--
-- `projects` never hit this because its policy reads only `memberships`; it judges the new row by
-- the row's own `program_id`. That is the property this needs too: decide visibility from the
-- columns in front of you, not by looking the row up in the table it is still being written to.
--
-- `current_wave_ids()` itself is LEFT ALONE. Every other wave-scoped policy uses it to check a
-- `subproject_id` pointing at an already-committed subproject, where it is correct and cheap.

create or replace function can_see_subproject(p_subproject_id uuid, p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  -- A program-wide membership reaches every subproject of that program. Resolved through the
  -- subproject's own project_id, so it works for a row mid-insert.
  select exists (
    select 1
      from projects pj
      join memberships m on m.program_id = pj.program_id
     where pj.id = p_project_id
       and m.user_id = auth.uid()
       and m.subproject_id is null
  )
  -- ...or the subproject was granted explicitly.
  or exists (
    select 1 from memberships m
     where m.user_id = auth.uid() and m.subproject_id = p_subproject_id
  );
$$;

comment on function can_see_subproject is
  'Subproject visibility decided from the row''s own keys rather than by re-reading subprojects, '
  'so INSERT ... RETURNING can read back the row it just wrote.';

-- Same access as before, expressed without the self-reference. Program-wide membership → every
-- subproject in the program; explicit subproject membership → that one.
drop policy if exists waves_select on subprojects;
drop policy if exists subprojects_select on subprojects;
create policy subprojects_select on subprojects for select
  using (can_see_subproject(id, project_id));

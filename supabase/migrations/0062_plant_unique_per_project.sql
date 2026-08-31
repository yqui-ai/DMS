/* ─────────────────────────────────────────────────────────────────────────────────────────────
   A plant belongs to at most ONE subproject within a project.

   A subproject is the unit of migration work for a set of plants: it carries the scope, the FMDs,
   the rules and the load sequence for them. Two subprojects of the same project both covering
   plant 1010 means two scopes, two sets of FMDs and two load plans for the same physical site, and
   nothing in the data says which one actually runs — so the question "what is being migrated for
   1010?" stops having an answer. Across DIFFERENT projects it is fine and expected: a later project
   revisits the same plant for a different wave of objects.

   This is also what makes replicating a subproject meaningful. Copying a subproject's scope and
   pointing it at another plant is a normal thing to do; copying it and leaving the same plant on
   both is the ambiguity above, and it should fail at the database rather than being caught (or not)
   by whichever screen happened to create it.

   ── Why a trigger and not a unique index ──────────────────────────────────────────────────────
   The uniqueness spans a join: `subproject_plants` holds subproject_id, and the project is one hop
   away on `subprojects`. A unique index cannot express that. The alternatives were denormalising
   project_id onto subproject_plants — a second copy of a fact, needing its own trigger to stay
   true when a subproject moves — or this: check the actual relationship at write time.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

create or replace function subproject_plants_unique_per_project() returns trigger
language plpgsql as $$
declare
  my_project uuid;
  clash_code text;
  clash_name text;
  plant_code text;
begin
  select project_id into my_project from subprojects where id = new.subproject_id;
  if my_project is null then return new; end if;

  select s.code, s.name into clash_code, clash_name
    from subproject_plants sp
    join subprojects s on s.id = sp.subproject_id
   where sp.plant_id = new.plant_id
     and s.project_id = my_project
     and sp.subproject_id <> new.subproject_id
   limit 1;

  if clash_code is not null or clash_name is not null then
    select code into plant_code from plants where id = new.plant_id;
    -- Names the plant AND the subproject already holding it: "already assigned" without saying
    -- where sends someone hunting through every subproject in the project.
    raise exception
      'Plant % is already assigned to subproject % (%) in this project. A plant belongs to one subproject per project — remove it there first, or use a different plant.',
      coalesce(plant_code, new.plant_id::text), coalesce(clash_code, '?'), coalesce(clash_name, 'unnamed')
      using errcode = '23505';
  end if;

  return new;
end $$;

drop trigger if exists subproject_plants_one_per_project on subproject_plants;
create trigger subproject_plants_one_per_project
  before insert or update on subproject_plants
  for each row execute function subproject_plants_unique_per_project();

comment on function subproject_plants_unique_per_project is
  'Enforces one subproject per plant within a project. Cross-project reuse stays allowed — a later '
  'project revisiting the same plant is normal. Existing rows are NOT rewritten by this migration; '
  'run supabase/checks/plant_assignment_health.sql to find any that already violate it.';

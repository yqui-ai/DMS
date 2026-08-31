/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Plant assignment health — read-only. Paste into the Supabase SQL editor.

   Migration 0062 stops a plant being assigned to two subprojects of the same project, but a
   trigger only guards writes made AFTER it exists. Rows already in the table are untouched, and a
   violation that predates the rule is invisible: nothing on screen distinguishes "these two
   subprojects legitimately cover different plants" from "these two both claim 1010 and only one of
   them is really running".

   Everything here is a SELECT. Read the FAIL rows; the OK rows prove the check ran.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

-- 1. The rule itself is installed. A trigger that was never created enforces nothing, and the app
--    would go on happily assuming the database is holding the line.
select
  '1. One-plant-per-project trigger installed' as check,
  case when count(*) = 1 then 'OK' else 'FAIL' end as verdict,
  coalesce(
    string_agg(
      t.tgname || ' — ' ||
      case t.tgenabled when 'O' then 'enabled' when 'D' then 'DISABLED' else 'enabled (' || t.tgenabled || ')' end,
      '; '),
    'no trigger on subproject_plants runs subproject_plants_unique_per_project') as detail
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where c.relname = 'subproject_plants' and not t.tgisinternal
  and p.proname = 'subproject_plants_unique_per_project'

union all

-- 2. Rows that already break it. These predate the trigger, so they are still there and still
--    ambiguous: two subprojects in one project both claiming the same plant.
select
  '2. No plant claimed twice in one project',
  case when count(*) = 0 then 'OK' else 'FAIL' end,
  case when count(*) = 0 then 'every plant belongs to at most one subproject per project'
       else count(*) || ' clash(es): ' || string_agg(detail, ' | ') end
from (
  select
    pl.code || ' in project ' || coalesce(pr.code, pr.name) || ' → subprojects ' ||
    string_agg(coalesce(s.code, s.name), ', ' order by coalesce(s.code, s.name)) as detail
  from subproject_plants sp
  join subprojects s on s.id = sp.subproject_id
  join projects pr on pr.id = s.project_id
  join plants pl on pl.id = sp.plant_id
  group by pl.id, pl.code, pr.id, pr.code, pr.name
  having count(distinct s.id) > 1
) clashes

union all

-- 3. Cross-project reuse, which is ALLOWED. Listed as INFO so a reader does not mistake check 2's
--    silence for "no plant is ever used twice" — the rule is per project, deliberately.
select
  '3. Plants used by more than one project',
  'INFO',
  case when count(*) = 0 then 'no plant spans projects'
       else count(*) || ' plant(s) span projects, which is expected: ' || string_agg(code, ', ') end
from (
  select pl.code
  from subproject_plants sp
  join subprojects s on s.id = sp.subproject_id
  join plants pl on pl.id = sp.plant_id
  group by pl.id, pl.code
  having count(distinct s.project_id) > 1
) spanning

union all

-- 4. Assignments pointing at an archived plant. Not a rule violation, but a subproject planning
--    work for a site that has been retired is worth seeing before someone builds a load for it.
select
  '4. No assignment to an archived plant',
  case when count(*) = 0 then 'OK' else 'FAIL' end,
  case when count(*) = 0 then 'every assigned plant is live'
       else count(*) || ' assignment(s) to archived plants: ' || string_agg(code, ', ') end
from (
  select distinct pl.code
  from subproject_plants sp
  join plants pl on pl.id = sp.plant_id
  where pl.archived_at is not null
) archived

order by 1;

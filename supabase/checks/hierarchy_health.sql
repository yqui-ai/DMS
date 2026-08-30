/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Hierarchy health check — read-only. Paste into the Supabase SQL editor.

   Everything here is a SELECT. Nothing is written, nothing is locked. It answers the questions a
   static review of the code cannot: what the LIVE database actually contains and enforces.

   Every row of the output is one check with a verdict. Read the FAIL rows; the OK rows are there
   so you can see the check ran rather than silently matched nothing.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

-- 1. RLS is on for every table in public. A table with RLS off is readable by any signed-in user.
select
  '1. RLS enabled everywhere' as check,
  case when count(*) = 0 then 'OK' else 'FAIL' end as verdict,
  coalesce(string_agg(c.relname, ', ' order by c.relname), 'all tables have RLS') as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

union all

-- 2. Every table with RLS on has at least one policy. RLS with no policy denies everyone, which
--    reads in the app as "this screen is empty" rather than "you cannot see this".
select
  '2. No table locked out by RLS with no policy',
  case when count(*) = 0 then 'OK' else 'FAIL' end,
  coalesce(string_agg(c.relname, ', ' order by c.relname), 'every RLS table has a policy')
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)

union all

-- 3. The archive-not-delete backstop is still attached everywhere 0041 put it.
select
  '3. Delete-blocking triggers present',
  case when count(*) = 8 then 'OK' else 'FAIL' end,
  count(*) || ' of 8 (' || coalesce(string_agg(c.relname, ', ' order by c.relname), 'none') || ')'
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where t.tgname like '%_no_delete' and not t.tgisinternal

union all

-- 4. The change log is attached to everything it should be.
select
  '4. Change-log triggers present',
  case when count(*) >= 16 then 'OK' else 'FAIL' end,
  count(*) || ' tables logged'
from pg_trigger t
where t.tgname like '%_change_log' and not t.tgisinternal

union all

-- 5. change_log must be append-only: a SELECT policy and nothing else. An UPDATE or DELETE policy
--    here would make history editable, which is not history.
select
  '5. change_log is append-only',
  case when count(*) filter (where p.polcmd <> 'r') = 0 then 'OK' else 'FAIL' end,
  count(*) filter (where p.polcmd <> 'r') || ' write policies (want 0)'
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname = 'change_log'

union all

-- 6. Plants are no longer program-scoped (0057).
select
  '6. plants has no program_id',
  case when count(*) = 0 then 'OK' else 'FAIL' end,
  case when count(*) = 0 then 'column dropped' else 'column still present' end
from information_schema.columns
where table_schema = 'public' and table_name = 'plants' and column_name = 'program_id'

union all

-- 7. Plant codes are unique system-wide, case-insensitively, among live rows.
select
  '7. No duplicate live plant codes',
  case when count(*) = 0 then 'OK' else 'FAIL' end,
  coalesce(string_agg(code || ' x' || n, ', '), 'all codes unique')
from (
  select upper(code) as code, count(*) as n
  from plants where archived_at is null
  group by upper(code) having count(*) > 1
) dup

union all

-- 8. The catalogue is intact. Losing it costs a re-seed, so it is worth asserting rather than
--    assuming — every reset and delete path is written around not touching it.
select
  '8. SAP object catalogue intact',
  case when count(*) >= 400 then 'OK' else 'FAIL' end,
  count(*) || ' migration objects'
from migration_objects

union all

select
  '9. Catalogue structures intact',
  case when count(*) > 0 then 'OK' else 'FAIL' end,
  count(*) || ' structures'
from dmc_structures

union all

-- 10. Every programme holding catalogue rows is one a full reset must keep as a shell.
select
  '10. Catalogue-owning programs',
  'INFO',
  coalesce(string_agg(distinct p.code, ', '), 'none')
from migration_objects mo join programs p on p.id = mo.program_id

union all

-- 11. Orphans. Cascades should make these impossible; a non-zero count means a delete path wrote
--     around a foreign key somewhere.
select
  '11. No orphaned projects / subprojects / cycles',
  case when (
    (select count(*) from projects pj where not exists (select 1 from programs p where p.id = pj.program_id))
    + (select count(*) from subprojects s where not exists (select 1 from projects pj where pj.id = s.project_id))
    + (select count(*) from cycles c where not exists (select 1 from subprojects s where s.id = c.subproject_id))
  ) = 0 then 'OK' else 'FAIL' end,
  'projects ' || (select count(*) from projects pj where not exists (select 1 from programs p where p.id = pj.program_id))
  || ', subprojects ' || (select count(*) from subprojects s where not exists (select 1 from projects pj where pj.id = s.project_id))
  || ', cycles ' || (select count(*) from cycles c where not exists (select 1 from subprojects s where s.id = c.subproject_id))

union all

-- 12. Scope rows pointing at a Field Mapping that no longer exists. `fmd_id` is ON DELETE SET NULL,
--     so this should be impossible — if it is not, something deleted an FMD around the constraint.
select
  '12. No scope rows pointing at a deleted FMD',
  case when count(*) = 0 then 'OK' else 'FAIL' end,
  count(*) || ' dangling assignments'
from subproject_objects so
where so.fmd_id is not null
  and not exists (select 1 from fmds f where f.id = so.fmd_id)

union all

-- 13. The trap this review found: an FMD assigned to an object it was not written for. Every row
--     here is a wrong assignment, most likely from the Assign dialog carrying a stale selection.
select
  '13. FMDs assigned to the object they document',
  case when count(*) = 0 then 'OK' else 'REVIEW' end,
  coalesce(string_agg(detail, '; '), 'every assignment matches its object')
from (
  select mo.object_id || ' <- ' || f.name as detail
  from subproject_objects so
  join fmds f on f.id = so.fmd_id
  join migration_objects mo on mo.id = so.migration_object_id
  where f.migration_object_id is not null
    and f.migration_object_id <> so.migration_object_id
) mismatched

union all

-- 14. Ordering. Every project at seq 1 means the hierarchy has no stable order of its own; the app
--     now sorts by (seq, code), so this is informational rather than a failure.
select
  '14. Sequence values in use',
  'INFO',
  'projects: ' || (select count(distinct seq) from projects)
  || ' distinct seq, subprojects: ' || (select count(distinct seq) from subprojects)
  || ' distinct seq'

order by 1;

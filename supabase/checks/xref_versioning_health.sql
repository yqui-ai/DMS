/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Golden XREF versioning health check — read-only. Paste into the Supabase SQL editor.

   Verifies migration 0059 landed whole: the columns, the freeze trigger behind them, and the state
   of the data it backfilled. Everything here is a SELECT — nothing is written, nothing is locked.

   Why a script rather than a glance at the migration: 0059's guarantees are only worth as much as
   what is actually installed. A column can arrive without its trigger (the statement after a failed
   one simply does not run), and the app's Save button then looks correct while nothing enforces it
   — which is the exact failure mode 0029/0030 were written for on the FMD side.

   Every row of the output is one check with a verdict. Read the FAIL rows; the OK rows are there so
   you can see the check ran rather than silently matched nothing.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

-- 1. The two columns 0059 adds. Without these the app cannot tell a draft from a release at all.
select
  '1. published_at / published_by exist' as check,
  case when count(*) = 2 then 'OK' else 'FAIL' end as verdict,
  coalesce(string_agg(column_name || ' ' || data_type, ', ' order by column_name), 'neither column exists') as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'xref_versions'
  and column_name in ('published_at', 'published_by')

union all

-- 2. The freeze function itself.
select
  '2. Freeze function installed',
  case when count(*) = 1 then 'OK' else 'FAIL' end,
  case when count(*) = 1 then 'xref_versions_block_published_edit() present'
       else 'missing — nothing stops a published structure being rewritten' end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'xref_versions_block_published_edit'

union all

-- 3. …and actually ATTACHED to the table, enabled, before update, per row. A function that exists
--    but is not wired to anything enforces nothing; this is the check that separates the two.
select
  '3. Freeze trigger attached and enabled',
  case when count(*) = 1 then 'OK' else 'FAIL' end,
  coalesce(
    string_agg(
      t.tgname || ' — ' ||
      case t.tgenabled when 'O' then 'enabled' when 'D' then 'DISABLED' else 'enabled (' || t.tgenabled || ')' end ||
      case when (t.tgtype & 2) <> 0 then ', before' else ', AFTER (wrong — too late to reject)' end ||
      case when (t.tgtype & 1) <> 0 then ', per row' else ', PER STATEMENT (wrong)' end ||
      case when (t.tgtype & 16) <> 0 then ', on update' else ', NOT on update (wrong)' end,
      '; '),
    'no trigger on xref_versions runs the freeze function')
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where c.relname = 'xref_versions' and not t.tgisinternal
  and p.proname = 'xref_versions_block_published_edit'

union all

-- 4. One draft per table, which is what makes "the draft" a thing you can name. 0059 leans on the
--    unique (xref_table_id, version) index from 0019 for this rather than adding its own rule, so
--    the index is load-bearing now — confirm it is still there.
select
  '4. unique (xref_table_id, version) present',
  case when count(*) >= 1 then 'OK' else 'FAIL' end,
  case when count(*) >= 1 then 'a second concurrent draft is rejected by the database'
       else 'MISSING — two drafts can exist at once, and neither one is "the" draft' end
from pg_indexes
where schemaname = 'public' and tablename = 'xref_versions' and indexdef ilike '%UNIQUE%'
  and indexdef ilike '%xref_table_id%' and indexdef ilike '%version%'

union all

-- 5. The backfill. Every row that existed before 0059 has been the live template since the day it
--    was written, so all of them must now read as published. A NUMBERED version left unpublished is
--    the damaging case: the app would show a released version as an unreleased draft, and offer to
--    publish it again under a number that is already taken.
select
  '5. No numbered version left unpublished',
  case when count(*) = 0 then 'OK' else 'FAIL' end,
  case when count(*) = 0 then 'every numbered version carries published_at'
       else count(*) || ' numbered version(s) have no published_at: ' ||
            string_agg(version, ', ' order by version) end
from xref_versions
where published_at is null and version <> 'Draft'

union all

-- 6. The mirror of 5: anything carrying the literal 'Draft' must NOT be published. A published row
--    still labelled Draft would be frozen by the trigger yet offered as editable by the app.
select
  '6. No published row still labelled Draft',
  case when count(*) = 0 then 'OK' else 'FAIL' end,
  case when count(*) = 0 then 'draft label and published_at agree'
       else count(*) || ' row(s) are published but still versioned ''Draft''' end
from xref_versions
where published_at is not null and version = 'Draft'

union all

-- 7. What is open right now. Informational, never a FAIL — a draft in progress is the normal state
--    of a template someone is working on. It is here so the numbers below are read in context.
select
  '7. Drafts currently open',
  'INFO',
  case when count(*) = 0 then 'no open drafts'
       else count(*) || ' table(s) have an unpublished draft: ' ||
            string_agg(coalesce(t.display_id, t.name), ', ' order by t.name) end
from xref_versions v
join xref_tables t on t.id = v.xref_table_id
where v.published_at is null

union all

-- 8. Parity with the FMD. The whole point of 0059 was that two templates in one catalogue should
--    not be versioned by opposite rules; if the FMD's freeze trigger is present and the XREF's is
--    not (or vice versa), they have drifted apart again.
select
  '8. FMD and XREF are frozen by the same rule',
  case when count(*) = 2 then 'OK' else 'FAIL' end,
  coalesce(string_agg(c.relname, ' + ' order by c.relname), 'neither table has a freeze trigger')
  || case when count(*) = 2 then ' — both frozen' else ' — only one of the two is frozen' end
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relname in ('fmd_versions', 'xref_versions') and not t.tgisinternal
  and t.tgname in ('fmd_versions_no_published_edit', 'xref_versions_no_published_edit')

union all

/* ── 0060: review points and lineage ──────────────────────────────────────────────────────────
   The columns themselves are easy to confirm from outside (a PostgREST select either resolves or
   names the missing column). What follows is the part that ISN'T visible from the API: whether the
   RLS policy exists, whether the CHECK constraint matches the app's vocabulary, and what the
   foreign key does when its target disappears. */

-- 9. Lineage column, and — the part that actually matters — its ON DELETE behaviour. SET NULL means
--    deleting a Golden version makes the tables built from it read as "never built". CASCADE would
--    delete the TABLES, which is why 0026 exists as a cautionary sibling.
select
  '9. Lineage FK is ON DELETE SET NULL',
  case when count(*) = 1 and min(confdeltype) = 'n' then 'OK' else 'FAIL' end,
  case
    when count(*) = 0 then 'xref_tables.based_on_golden_version_id has no foreign key'
    when min(confdeltype) = 'n' then 'set null — deleting a template version orphans the pointer, not the table'
    when min(confdeltype) = 'c' then 'CASCADE — deleting a template version would DELETE the tables built from it'
    else 'unexpected on-delete action: ' || min(confdeltype)
  end
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_attribute a on a.attrelid = c.oid and a.attnum = any (con.conkey)
where c.relname = 'xref_tables' and con.contype = 'f' and a.attname = 'based_on_golden_version_id'

union all

-- 10. RLS on the review table. A table with RLS off is readable by any signed-in user; a table with
--     RLS on and no policy denies everyone, which reads in the app as an empty list rather than as
--     an error. Both are silent, so both are checked here.
select
  '10. xref_review_points is protected by RLS',
  case when bool_and(c.relrowsecurity) and count(p.polname) > 0 then 'OK' else 'FAIL' end,
  case
    when not bool_and(c.relrowsecurity) then 'RLS is OFF — every signed-in user can read every review point'
    when count(p.polname) = 0 then 'RLS is on with NO policy — nobody can read anything, and it looks like an empty list'
    else count(p.polname) || ' policy/policies: ' || string_agg(p.polname, ', ')
  end
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'xref_review_points'
group by c.relname

union all

-- 11. The tag vocabulary. src/lib/reviewPointCategories.ts renders todo/issue/remark and still maps
--     the retired question/decision; a value the app can post but the constraint rejects fails at
--     the database with no clue why, which is exactly the trap the FMD's 0028 documents.
select
  '11. Review tags the app posts are all accepted',
  case when count(*) = 1 and bool_and(
    pg_get_constraintdef(con.oid) like '%todo%'
    and pg_get_constraintdef(con.oid) like '%issue%'
    and pg_get_constraintdef(con.oid) like '%remark%'
  ) then 'OK' else 'FAIL' end,
  coalesce(string_agg(pg_get_constraintdef(con.oid), ' | '), 'no CHECK constraint on tag')
from pg_constraint con
join pg_class c on c.oid = con.conrelid
where c.relname = 'xref_review_points' and con.contype = 'c'
  and pg_get_constraintdef(con.oid) like '%tag%'

union all

-- 12. Lineage sanity. Every pointer should name a version OF THE GOLDEN TABLE — a table built from
--     some other table's version is a bug in whatever wrote it, and it would report a confident,
--     wrong answer on Where used rather than failing visibly.
select
  '12. Every lineage pointer names a Golden version',
  case when count(*) = 0 then 'OK' else 'FAIL' end,
  case when count(*) = 0 then 'no table points at a non-Golden version'
       else count(*) || ' table(s) point at a version that is not the Golden template''s' end
from xref_tables t
join xref_versions v on v.id = t.based_on_golden_version_id
join xref_tables golden on golden.id = v.xref_table_id
where golden.type <> 'Golden'

order by 1;

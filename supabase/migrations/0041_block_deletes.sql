-- Nothing is deleted. Enforced here, not only in the UI.
--
-- 0040 added the archive machinery but left DELETE reachable, and a Delete button was still wired
-- to it — so a subproject was hard-deleted, taking its cycles, scope, FMDs, rules and runs with it
-- through the cascades. A policy decision that lives only in a button is not a policy.
--
-- These triggers are the backstop. The UI offers Archive instead, but the database is what makes
-- "nothing is deleted" true.

create or replace function dms_block_delete() returns trigger
language plpgsql as $$
begin
  raise exception
    'Records are archived, not deleted. Raise an archive request for this % instead.', tg_table_name
    using errcode = '42501',
          hint = 'See archive_requests. Archiving keeps the record and its history, and can be undone.';
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'programs', 'projects', 'subprojects', 'cycles',
    'migration_objects', 'fmds', 'xref_tables', 'rules'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_no_delete', t);
    execute format(
      'create trigger %I before delete on %I for each row execute function dms_block_delete()',
      t || '_no_delete', t);
  end loop;
end $$;

-- The RLS delete policies from 0037 are now dead weight — the trigger fires first regardless — but
-- they are dropped so nothing reads as though deleting were a supported path.
drop policy if exists subprojects_delete on subprojects;

comment on function dms_block_delete is
  'Backstop for the archive-not-delete rule. Fires before delete on every record-bearing table.';

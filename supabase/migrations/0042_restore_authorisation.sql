-- `dms_restore_archive` was SECURITY DEFINER with no authorisation check.
--
-- SECURITY DEFINER runs as the function's owner, which means RLS does not apply inside it. Any
-- signed-in user could call it with any request id and un-archive anything in the database,
-- including records in programs they have no membership on. It had no UI yet, which is the only
-- reason this was not exploitable; adding the Restore button is what makes it urgent.
--
-- A definer function has to do its own authorisation. This one now does.

-- 'Restored' is a distinct outcome from 'Cancelled'. Cancelled means withdrawn before it was ever
-- approved; Restored means it WAS approved, applied, and later reversed. Collapsing the two loses
-- the fact that the archive actually happened, which is exactly what the history is for.
alter table archive_requests drop constraint if exists archive_requests_status_check;
alter table archive_requests add constraint archive_requests_status_check
  check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled', 'Restored'));

create or replace function dms_restore_archive(p_request uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t text;
  r archive_requests%rowtype;
begin
  select * into r from archive_requests where id = p_request;
  if not found then
    raise exception 'Archive request not found.' using errcode = 'P0002';
  end if;

  -- Restoring reverses a decision three people signed off on, so it takes the same standing as
  -- administering the program. Checked here because RLS cannot reach inside a definer function.
  if not is_program_wide_admin(r.program_id) then
    raise exception 'Only a Program Admin of this program can restore an archived record.'
      using errcode = '42501';
  end if;

  if r.status not in ('Approved', 'Pending') then
    raise exception 'This request is % — there is nothing to restore.', r.status
      using errcode = '22023';
  end if;

  foreach t in array array[
    'programs', 'projects', 'subprojects', 'cycles',
    'migration_objects', 'fmds', 'xref_tables', 'rules'
  ] loop
    execute format(
      'update %I set archived_at = null, archived_by = null, archived_via = null where archived_via = $1', t)
      using p_request;
  end loop;

  -- A Pending request that never applied anything is a withdrawal, not a restore.
  update archive_requests
     set status = case when r.status = 'Approved' then 'Restored' else 'Cancelled' end,
         decided_at = now()
   where id = p_request;
end $$;

revoke all on function dms_restore_archive(uuid) from public;
grant execute on function dms_restore_archive(uuid) to authenticated;

comment on function dms_restore_archive is
  'Reverses exactly what one archive request archived (its archived_via stamp). Program Admin only '
  '— the function is SECURITY DEFINER, so it authorises the caller itself.';

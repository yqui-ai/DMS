-- Creating a program is a bootstrap, and bootstraps do not fit row-level security.
--
-- 0037 allowed any signed-in user to INSERT a program and granted them Program Admin through an
-- AFTER INSERT trigger. That fails in practice, because the client inserts with `RETURNING` — and
-- under RLS, `INSERT ... RETURNING` also requires the new row to pass the SELECT policy. The SELECT
-- policy on `programs` is "a program you hold a membership on", and the membership is created by
-- that same AFTER trigger, which has not fired when RETURNING is evaluated. The insert is legal and
-- the read-back is not, so the statement is rejected:
--
--   new row violates row-level security policy for table "programs"
--
-- Splitting it into two client calls would leave a program with no administrator whenever the second
-- one failed. One SECURITY DEFINER function does both, atomically, and returns the id.

create or replace function dms_create_program(
  p_code text,
  p_name text,
  p_owner text,
  p_co_lead text default null,
  p_status text default null,
  p_start_date date default null,
  p_end_date date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  -- SECURITY DEFINER runs as the owner, so this function must do its own authorisation. Without
  -- this check it would be an anonymous program factory.
  if auth.uid() is null then
    raise exception 'You must be signed in to create a program.' using errcode = '42501';
  end if;

  if coalesce(trim(p_code), '') = '' or coalesce(trim(p_name), '') = '' then
    raise exception 'A program needs an ID and a name.' using errcode = '23514';
  end if;
  -- Program Lead is mandatory in the field spec. Enforced here as well as in the dialog, because
  -- the dialog is not the only thing that can call this.
  if coalesce(trim(p_owner), '') = '' then
    raise exception 'A program needs a Program Lead.' using errcode = '23514';
  end if;

  insert into programs (code, name, owner, co_lead, status, start_date, end_date)
  values (trim(p_code), trim(p_name), trim(p_owner), nullif(trim(coalesce(p_co_lead, '')), ''),
          nullif(p_status, ''), p_start_date, p_end_date)
  returning id into new_id;

  -- Whoever creates a program administers it. The trigger from 0037 does this too and is harmless
  -- either way (`on conflict do nothing`); doing it here as well means the grant is part of the
  -- same statement rather than a side effect nobody can see.
  insert into memberships (user_id, program_id, subproject_id, role_id)
  values (auth.uid(), new_id, null, 'program_admin')
  on conflict do nothing;

  return new_id;
end $$;

revoke all on function dms_create_program(text, text, text, text, text, date, date) from public;
grant execute on function dms_create_program(text, text, text, text, text, date, date) to authenticated;

comment on function dms_create_program is
  'Creates a program and grants the caller Program Admin on it, atomically. Needed because '
  'INSERT ... RETURNING on programs cannot pass the SELECT policy before the membership exists.';

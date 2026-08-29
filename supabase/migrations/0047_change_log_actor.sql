-- The change log was recording every write as "system".
--
-- 0046 read the actor with `current_setting('request.jwt.claim.email', true)`. That GUC was
-- deprecated in PostgREST v10 and is not set on current Supabase, so the lookup returned NULL and
-- every entry fell through to the 'system' fallback. The log still recorded WHAT changed and WHEN,
-- but "who did it" — the column an audit trail exists for — was constant and useless.
--
-- `auth.jwt()` is the supported accessor and is what the rest of the schema would have used had it
-- needed the email. Three fallbacks behind it, in decreasing order of usefulness, because an entry
-- attributed to a uuid is still better than one attributed to nobody:
--   1. the email claim on the JWT
--   2. the signed-in user's email from app_users
--   3. the raw auth.uid()
--   4. 'system' — a migration, a service-role job, or a write with no session at all
--
-- Only the actor line changes. Everything else in dms_log_change is 0046's, unmodified.

create or replace function dms_log_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_j jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_j jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  diff jsonb := '{}'::jsonb;
  k text;
  changed_cols text[] := '{}';
  uid uuid := auth.uid();
  who text;
  row_id uuid;
  prog uuid;
  sub uuid;
  label text;
begin
  -- `auth.jwt()` raises rather than returning null when there is no request context (a direct psql
  -- session, a migration), so it is guarded rather than relied on.
  begin
    who := nullif(auth.jwt() ->> 'email', '');
  exception when others then
    who := null;
  end;
  if who is null and uid is not null then
    select nullif(u.email, '') into who from app_users u where u.id = uid;
  end if;
  who := coalesce(who, uid::text, 'system');

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      if k = any (dms_log_ignored_columns()) then continue; end if;
      if old_j -> k is distinct from new_j -> k then
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k));
        changed_cols := changed_cols || k;
      end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
  end if;

  row_id := nullif(coalesce(new_j ->> 'id', old_j ->> 'id'), '')::uuid;
  sub := nullif(coalesce(new_j ->> 'subproject_id', old_j ->> 'subproject_id'), '')::uuid;
  prog := nullif(coalesce(new_j ->> 'program_id', old_j ->> 'program_id'), '')::uuid;
  if prog is null and sub is not null then
    select p.program_id into prog
    from subprojects s join projects p on p.id = s.project_id
    where s.id = sub;
  end if;

  label := coalesce(
    new_j ->> 'display_id', old_j ->> 'display_id',
    new_j ->> 'name', old_j ->> 'name',
    new_j ->> 'object_id', old_j ->> 'object_id',
    new_j ->> 'code', old_j ->> 'code',
    new_j ->> 'version', old_j ->> 'version',
    row_id::text, '(unnamed)'
  );

  insert into change_log (actor, entity, entity_id, op, changes, summary, program_id, subproject_id)
  values (
    who, tg_table_name, row_id, lower(tg_op), diff,
    case lower(tg_op)
      when 'insert' then format('Created %s', label)
      when 'delete' then format('Deleted %s', label)
      else format('Updated %s (%s)', label, array_to_string(changed_cols, ', '))
    end,
    prog, sub
  );
  return null;
end $$;

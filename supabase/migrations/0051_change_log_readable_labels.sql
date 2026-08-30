/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Make the change log readable.

   0046's label chain is `display_id → name → object_id → code → version → the row's uuid`. For
   every table that carries one of those columns it works. For the ones that do not — the scope
   rows, the link tables, the version and note children — it falls through to the uuid, and the log
   fills with lines like:

     Updated ba201d27-4f8b-455b-b480-fb47de6f708e (etl_developer)
     Created a7132d1c-c8ea-4b9b-8e27-e50974254376

   which tell a reader nothing and, worse, look as though they should. A uuid is an internal handle;
   it has no place in a log a consultant reads.

   `dms_log_label()` resolves a human name for those tables by joining out to the record that has
   one. See the `change-log-writing` skill for the rules this implements.

   Entries already recorded are NOT rewritten — `change_log` is append-only by design, which is the
   point of it. The client unpicks old summaries instead (`describeChange()` in
   src/lib/queries/changeLog.ts), so history reads correctly too; this fixes the stored text from
   here on.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

create or replace function dms_log_label(p_table text, p_row jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  lbl text;
begin
  -- Tables whose own columns already name the row. Ordered most-specific first, exactly as 0046
  -- had it, so nothing that reads well today starts reading differently.
  lbl := coalesce(
    p_row ->> 'display_id',
    p_row ->> 'object_id',
    p_row ->> 'name',
    p_row ->> 'code',
    -- Added: an imported scope candidate is known by what the customer called it.
    p_row ->> 'source_ident'
  );
  if lbl is not null and lbl <> '' then return lbl; end if;

  -- Tables with no naming column of their own. Each joins out to the record a person would use to
  -- refer to this one. SECURITY DEFINER because the trigger must be able to resolve a label even
  -- where the actor cannot select the joined row — the log is written for the programme, not for
  -- whoever happened to trigger it.
  begin
    case p_table
      when 'subproject_objects' then
        select o.object_id into lbl from migration_objects o
         where o.id = (p_row ->> 'migration_object_id')::uuid;

      when 'subproject_plants' then
        select p.code || ' · ' || s.name into lbl
          from plants p, subprojects s
         where p.id = (p_row ->> 'plant_id')::uuid
           and s.id = (p_row ->> 'subproject_id')::uuid;

      when 'scope_waivers' then
        select o.object_id || ' → ' || r.object_id into lbl
          from migration_objects o, migration_objects r
         where o.id = (p_row ->> 'migration_object_id')::uuid
           and r.id = (p_row ->> 'requires_object_id')::uuid;

      when 'fmd_versions' then
        select f.display_id || ' ' || coalesce(p_row ->> 'version', '') into lbl
          from fmds f where f.id = (p_row ->> 'fmd_id')::uuid;

      when 'fmd_field_notes' then
        select 'review point on ' || f.display_id into lbl
          from fmds f where f.id = (p_row ->> 'fmd_id')::uuid;

      when 'memberships' then
        select u.email || ' as ' || coalesce(p_row ->> 'role_id', 'a role') into lbl
          from app_users u where u.id = (p_row ->> 'user_id')::uuid;

      else lbl := null;
    end case;
  exception when others then
    -- A malformed or missing key must never take down the write being logged. An entry with a
    -- generic label is a small loss; a failed insert because the audit trail could not name it is
    -- a large one.
    lbl := null;
  end;

  if lbl is not null and lbl <> '' then return lbl; end if;

  -- Still nothing. Say what the record IS rather than printing its id — "a scope entry" is useful,
  -- "ba201d27-…" is not.
  return 'a ' || replace(rtrim(p_table, 's'), '_', ' ');
end $$;

comment on function dms_log_label is
  'Human label for one logged row: its own naming column, else a join to the record that has one, '
  'else a description of what it is. Never a uuid. See the change-log-writing skill.';

/* ── dms_log_change: same as 0047, with the label resolved through dms_log_label ─────────────── */

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
  who text;
  uid uuid := auth.uid();
  row_id uuid;
  prog uuid;
  sub uuid;
  label text;
begin
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

  -- Actor, exactly as 0047 established it: auth.jwt() raises outside a request context, and the
  -- deprecated request.jwt.claim.email GUC silently returns null.
  begin
    who := nullif(auth.jwt() ->> 'email', '');
  exception when others then
    who := null;
  end;
  if who is null and uid is not null then
    select nullif(u.email, '') into who from app_users u where u.id = uid;
  end if;
  who := coalesce(who, uid::text, 'system');

  row_id := nullif(coalesce(new_j ->> 'id', old_j ->> 'id'), '')::uuid;
  sub := nullif(coalesce(new_j ->> 'subproject_id', old_j ->> 'subproject_id'), '')::uuid;
  prog := nullif(coalesce(new_j ->> 'program_id', old_j ->> 'program_id'), '')::uuid;
  if prog is null and sub is not null then
    select p.program_id into prog
    from subprojects s join projects p on p.id = s.project_id
    where s.id = sub;
  end if;

  label := dms_log_label(tg_table_name, case when tg_op = 'DELETE' then old_j else new_j end);

  insert into change_log (actor, entity, entity_id, op, changes, summary, program_id, subproject_id)
  values (
    who, tg_table_name, row_id, lower(tg_op), diff,
    case lower(tg_op)
      when 'insert' then format('Created %s', label)
      when 'delete' then format('Deleted %s', label)
      -- Column names stay in the stored sentence: it is the deterministic record, and the client
      -- maps them to readable labels for display (FIELD_LABEL / describeChange). Putting prose here
      -- would make the audit text depend on a vocabulary that lives in the frontend.
      else format('Updated %s (%s)', label, array_to_string(changed_cols, ', '))
    end,
    prog, sub
  );
  return null;
end $$;

comment on function dms_log_change is
  'AFTER trigger. One change_log row per meaningful write; skips updates that touched only audit '
  'columns. Names the row via dms_log_label so an entry never reads as a uuid.';

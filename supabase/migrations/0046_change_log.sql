-- One place that answers "what changed, when, and who did it".
--
-- The app already records history in three unrelated shapes: `fmd_versions.sheets.changeLog` for
-- cell edits, `archive_requests` for archiving, and `created_by`/`changed_by` stamps on the
-- hierarchy. None of them answer the question people actually ask — "what happened in this
-- programme last week" — because each covers one record type and none of them covers deletes,
-- scope changes, rules or XREF at all.
--
-- This is a single append-only log written by a trigger, so coverage does not depend on a developer
-- remembering to log. Anything registered below is logged, including writes made from the SQL
-- editor or a future service.

create table if not exists change_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  -- The signed-in user, or a marker when the write came from outside a session (a migration, a
  -- service role). Never null: "we do not know" is itself worth recording.
  actor text not null,
  entity text not null,                       -- table name
  entity_id uuid,                             -- the row, when it has a uuid pk
  op text not null check (op in ('insert', 'update', 'delete')),
  /** Only the columns that actually changed, as {column: {from, to}}. An update that touched one
   * cell of a 40-column row logs one entry, not forty. */
  changes jsonb not null default '{}'::jsonb,
  /** A short, deterministic sentence built at write time — always present, always correct, costs
   * nothing. The AI summary in the UI is an enrichment on top of this, never a replacement: a log
   * that is blank when the model is unreachable is not a log. */
  summary text,
  /** Scope, so the log can be filtered and RLS can be written against it. Resolved by the trigger
   * where the row makes it possible; null means programme-wide or unknown. */
  program_id uuid,
  subproject_id uuid
);

create index if not exists change_log_at_idx on change_log (at desc);
create index if not exists change_log_entity_idx on change_log (entity, entity_id);
create index if not exists change_log_program_idx on change_log (program_id);

comment on table change_log is
  'Append-only record of every write to a registered table. Written by dms_log_change(); never '
  'written by the client. See migration 0046.';

/* ───────────────────────────────────────────────────────────────────── noise the log skips */

-- Columns that change on every write and say nothing about intent. Logging them would make every
-- entry claim a change nobody made.
create or replace function dms_log_ignored_columns() returns text[] language sql immutable as $$
  select array['changed_at', 'changed_by', 'updated_at', 'created_at', 'search_vector']::text[];
$$;

/* ─────────────────────────────────────────────────────────────────────────── the trigger */

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
  who text := coalesce(nullif(current_setting('request.jwt.claim.email', true), ''), 'system');
  row_id uuid;
  prog uuid;
  sub uuid;
  label text;
begin
  -- Only the columns that differ. `is distinct from` rather than `<>` so a null↔value change counts.
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      if k = any (dms_log_ignored_columns()) then continue; end if;
      if old_j -> k is distinct from new_j -> k then
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k));
        changed_cols := changed_cols || k;
      end if;
    end loop;
    -- An update that changed nothing meaningful is not an event.
    if diff = '{}'::jsonb then return null; end if;
  end if;

  row_id := nullif(coalesce(new_j ->> 'id', old_j ->> 'id'), '')::uuid;
  sub := nullif(coalesce(new_j ->> 'subproject_id', old_j ->> 'subproject_id'), '')::uuid;
  prog := nullif(coalesce(new_j ->> 'program_id', old_j ->> 'program_id'), '')::uuid;
  -- Resolve the programme through the subproject when the row does not carry it directly, so an
  -- FMD or a scope row can still be filtered by programme.
  if prog is null and sub is not null then
    select p.program_id into prog
    from subprojects s join projects p on p.id = s.project_id
    where s.id = sub;
  end if;

  -- Something a person recognises. Falls back to the id, never to nothing.
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

comment on function dms_log_change is
  'AFTER trigger. Writes one change_log row per meaningful write; skips updates that only touched '
  'the audit columns. SECURITY DEFINER so the log is written even where the actor cannot select it.';

/* ───────────────────────────────────────────────────────────────── which tables are logged */

do $$
declare t text;
begin
  foreach t in array array[
    'programs', 'projects', 'subprojects', 'cycles',
    'fmds', 'fmd_versions', 'fmd_field_notes',
    'rules', 'xref_tables', 'xref_versions',
    'subproject_objects', 'scope_candidates', 'scope_waivers',
    'memberships', 'archive_requests', 'archive_approvals'
  ] loop
    -- `to_regclass` so a table that does not exist in this database is skipped rather than aborting
    -- the migration — the set above spans several features and not every install has all of them.
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists %I on %I', t || '_change_log', t);
    execute format(
      'create trigger %I after insert or update or delete on %I
         for each row execute function dms_log_change()',
      t || '_change_log', t
    );
  end loop;
end $$;

/* ───────────────────────────────────────────────────────────────────────────────── RLS */

alter table change_log enable row level security;

-- Read what you can already reach: entries for your subprojects, entries for your programmes, and
-- programme-wide entries. The log must never become a side channel to records RLS hides — an entry
-- naming an FMD you cannot open would leak both its existence and its name.
drop policy if exists change_log_select on change_log;
create policy change_log_select on change_log for select
  using (
    subproject_id in (select current_wave_ids())
    or program_id in (select program_id from memberships where user_id = auth.uid())
    or (subproject_id is null and program_id is null
        and exists (select 1 from memberships where user_id = auth.uid()))
  );

-- No client writes, ever. The log is trigger-written; an INSERT policy would let someone forge an
-- entry, and an UPDATE policy would let them edit history. Append-only means append-only.

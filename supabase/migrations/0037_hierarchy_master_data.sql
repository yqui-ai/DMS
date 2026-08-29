-- Program / Project / Subproject / Cycle as real master data.
--
-- These four tables have carried a name, a code and a couple of dates since 0001, which was enough
-- while the hierarchy was seeded. They now have to be CREATED and MAINTAINED in the app, which needs
-- the rest of it: a stable display key, a status, an owner, and an audit trail.
--
-- Follows the field spec, with the deviations noted at the points where they occur. Nothing here
-- drops or renames an existing column, so everything already written keeps working.

/* ─────────────────────────────────────────────────────────── status reference (DMS_REF_STATUS) */

create table if not exists dms_ref_status (
  -- Which level of the hierarchy the status belongs to.
  type text not null check (type in ('PRGM', 'PRJT', 'SPRJ', 'CYCL')),
  code text not null,
  name text not null,
  seq int not null default 1,
  -- Exactly one status per type is what a newly created record gets.
  is_default boolean not null default false,
  -- A status that means "no longer running", so progress screens can tell finished from active
  -- without hardcoding a list of names.
  is_closed boolean not null default false,
  primary key (type, code)
);

insert into dms_ref_status (type, code, name, seq, is_default, is_closed) values
  ('PRGM', 'PLANNED',   'Planned',     1, true,  false),
  ('PRGM', 'ACTIVE',    'Active',      2, false, false),
  ('PRGM', 'ON_HOLD',   'On Hold',     3, false, false),
  ('PRGM', 'CLOSED',    'Closed',      4, false, true),
  ('PRJT', 'PLANNED',   'Planned',     1, true,  false),
  ('PRJT', 'ACTIVE',    'Active',      2, false, false),
  ('PRJT', 'ON_HOLD',   'On Hold',     3, false, false),
  ('PRJT', 'CLOSED',    'Closed',      4, false, true),
  ('SPRJ', 'PLANNED',   'Planned',     1, true,  false),
  ('SPRJ', 'PREP',      'Preparation', 2, false, false),
  ('SPRJ', 'ACTIVE',    'Active',      3, false, false),
  ('SPRJ', 'ON_HOLD',   'On Hold',     4, false, false),
  ('SPRJ', 'CLOSED',    'Closed',      5, false, true),
  ('CYCL', 'PLANNED',   'Planned',     1, true,  false),
  ('CYCL', 'RUNNING',   'Running',     2, false, false),
  ('CYCL', 'COMPLETED', 'Completed',   3, false, true),
  ('CYCL', 'CANCELLED', 'Cancelled',   4, false, true)
on conflict (type, code) do nothing;

alter table dms_ref_status enable row level security;
-- Reference data: every signed-in user reads it, nobody edits it from the app.
drop policy if exists dms_ref_status_select on dms_ref_status;
create policy dms_ref_status_select on dms_ref_status for select to authenticated using (true);

/* ─────────────────────────────────────────────────────────────────────── GUID generation */

-- Prefix + 11 random uppercase alphanumerics = 15 characters, per the spec.
--
-- Deviation: the Project-set spec calls the same values CHAR 10. Fifteen wins — it is what the four
-- entity specs say, and a key that is one length in its own table and another in the set table
-- cannot join.
create or replace function dms_make_guid(prefix text) returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := prefix;
begin
  for i in 1..(15 - length(prefix)) loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end $$;

/* ────────────────────────────────────────────────────────────────────────── shared columns */

-- CREATED_ON / CREATED_AT are stored as ONE timestamptz rather than two columns.
--
-- The spec types both as DATS(10), which would store the same date twice; in SAP the pair is a date
-- plus a TIMS time, and splitting one instant across two columns is how they drift. `created_at`
-- carries both halves and the app formats whichever it needs.
do $$
declare t text;
begin
  foreach t in array array['programs', 'projects', 'subprojects', 'cycles'] loop
    execute format('alter table %I add column if not exists guid text', t);
    execute format('alter table %I add column if not exists status text', t);
    execute format('alter table %I add column if not exists created_by text', t);
    execute format('alter table %I add column if not exists created_at timestamptz not null default now()', t);
    execute format('alter table %I add column if not exists changed_by text', t);
    execute format('alter table %I add column if not exists changed_at timestamptz', t);
  end loop;
end $$;

-- Program lead is mandatory in the spec, but cannot be enforced as NOT NULL: rows created before
-- this migration have nobody recorded, and inventing an owner for them would be worse than an
-- honest blank. The app requires it on create.
alter table programs add column if not exists owner text;
alter table programs add column if not exists co_lead text;

alter table subprojects add column if not exists prep_start_date date;
alter table subprojects add column if not exists prep_end_date date;
-- MIG_FMD_FREEZE_DATE. `freeze_date` from 0001 already meant exactly this, so it is reused rather
-- than duplicated — two columns for one date is how they disagree.
comment on column subprojects.freeze_date is 'MIG_FMD_FREEZE_DATE — field mapping freeze.';

-- Cycles had no ID of their own and no overall dates; only the migration window.
alter table cycles add column if not exists code text;
alter table cycles add column if not exists start_date date;
alter table cycles add column if not exists end_date date;

/* ───────────────────────────────────────────────────────────────────── backfill + defaults */

update programs    set guid = dms_make_guid('PRGM') where guid is null;
update projects    set guid = dms_make_guid('PRJT') where guid is null;
update subprojects set guid = dms_make_guid('SPRJ') where guid is null;
update cycles      set guid = dms_make_guid('CYCL') where guid is null;

update programs    set status = 'ACTIVE'  where status is null;
update projects    set status = 'ACTIVE'  where status is null;
update subprojects set status = 'ACTIVE'  where status is null;
update cycles      set status = 'PLANNED' where status is null;

-- A cycle's ID: 'CYCLE-1' from its sequence, so existing rows get something stable and readable
-- rather than a random string nobody can refer to in a meeting.
update cycles set code = 'CYCLE-' || seq where code is null;

do $$
declare t text;
begin
  foreach t in array array['programs', 'projects', 'subprojects', 'cycles'] loop
    execute format('alter table %I alter column guid set not null', t);
    execute format('create unique index if not exists %I on %I (guid)', t || '_guid_key', t);
    -- ID is CHAR(10) in the spec. Enforced as a length check rather than a char(10) type, which
    -- would pad every code with trailing spaces and break every existing equality comparison.
    execute format('alter table %I drop constraint if exists %I', t, t || '_code_len');
    execute format('alter table %I add constraint %I check (char_length(code) <= 10) not valid', t, t || '_code_len');
  end loop;
end $$;

-- `dms_ref_status` is keyed on (type, code), so a foreign key from `status` alone cannot reference
-- it. Each table gets a generated column holding its own constant level, and the FK is composite.
-- That is what makes CHECK_TABLE real: a status invalid for this level is rejected by the database
-- rather than only by the dropdown that happened to be on screen.
alter table programs    add column if not exists status_type text generated always as ('PRGM') stored;
alter table projects    add column if not exists status_type text generated always as ('PRJT') stored;
alter table subprojects add column if not exists status_type text generated always as ('SPRJ') stored;
alter table cycles      add column if not exists status_type text generated always as ('CYCL') stored;

alter table programs drop constraint if exists programs_status_fk;
alter table programs    add constraint programs_status_fk    foreign key (status_type, status) references dms_ref_status (type, code) not valid;
alter table projects drop constraint if exists projects_status_fk;
alter table projects    add constraint projects_status_fk    foreign key (status_type, status) references dms_ref_status (type, code) not valid;
alter table subprojects drop constraint if exists subprojects_status_fk;
alter table subprojects add constraint subprojects_status_fk foreign key (status_type, status) references dms_ref_status (type, code) not valid;
alter table cycles drop constraint if exists cycles_status_fk;
alter table cycles      add constraint cycles_status_fk      foreign key (status_type, status) references dms_ref_status (type, code) not valid;

/* ────────────────────────────────────────────────────────────── auto-fill on insert/update */

-- security definer: it reads app_users to resolve who is acting, and app_users is not readable by
-- every caller. The function returns only that one email into the row being written.
create or replace function dms_stamp_hierarchy() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prefix text := case tg_table_name
    when 'programs' then 'PRGM' when 'projects' then 'PRJT'
    when 'subprojects' then 'SPRJ' else 'CYCL' end;
  who text := coalesce((select email from app_users where id = auth.uid()), 'system');
begin
  if tg_op = 'INSERT' then
    if new.guid is null then new.guid := dms_make_guid(prefix); end if;
    if new.status is null then
      new.status := (select code from dms_ref_status where type = prefix and is_default limit 1);
    end if;
    new.created_by := coalesce(new.created_by, who);
    new.created_at := coalesce(new.created_at, now());
  else
    -- GUID and creation stamps are immutable. A record whose identity can be edited is not an
    -- identity, and an audit trail you can rewrite is not an audit trail.
    new.guid := old.guid;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.changed_by := who;
    new.changed_at := now();
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['programs', 'projects', 'subprojects', 'cycles'] loop
    execute format('drop trigger if exists %I on %I', t || '_stamp', t);
    execute format(
      'create trigger %I before insert or update on %I for each row execute function dms_stamp_hierarchy()',
      t || '_stamp', t);
  end loop;
end $$;

/* ──────────────────────────────────────────────────────────────────── project set (view) */

-- The flattened Program → Project → Subproject → Cycle combination.
--
-- Deviation: a VIEW, not a table with copied parent ids on each row. The spec puts PROGRAM_ID on
-- subprojects and PROGRAM_ID + PROJECT_ID on cycles, which is the same fact stored in three places
-- and free to disagree the moment one is updated and the others aren't. Every consumer of those
-- columns can read them here instead, always derived from the live foreign keys.
--
-- security_invoker so RLS still applies — you see a row only for a subproject you can reach.
create or replace view project_set
with (security_invoker = on) as
select
  pr.guid    as program_guid,  pr.code as program_id,    pr.name as program_name,    pr.status as program_status,
  pj.guid    as project_guid,  pj.code as project_id,    pj.name as project_name,    pj.status as project_status,
  sp.guid    as subproject_guid, sp.code as subproject_id, sp.name as subproject_name, sp.status as subproject_status,
  cy.guid    as cycle_guid,    cy.code as cycle_id,      cy.name as cycle_name,      cy.status as cycle_status,
  pr.id      as program_uuid,
  pj.id      as project_uuid,
  sp.id      as subproject_uuid,
  cy.id      as cycle_uuid
from programs pr
join projects pj    on pj.program_id = pr.id
join subprojects sp on sp.project_id = pj.id
left join cycles cy on cy.subproject_id = sp.id;

comment on view project_set is
  'Flattened Program > Project > Subproject > Cycle. A view rather than a table so the parent keys '
  'on each row are always derived and can never drift from the hierarchy they describe.';

/* ─────────────────────────────────────────────────────────────────────────── write access */

-- Creating and editing the hierarchy is a Program Admin act. RLS in 0002 already limits SELECT to
-- what your memberships reach; these add the write half, which simply did not exist because nothing
-- wrote to these tables.
-- NOT `is_program_admin` — that already exists (0003, re-pointed in 0008) and means something
-- slightly different: any program_admin membership on the program, subproject-scoped ones included.
-- It is left exactly as it is, because it gates membership management and quietly retightening that
-- as a side effect of a hierarchy migration is how people get locked out of their own program.
--
-- This one is stricter on purpose: administering the hierarchy requires a PROGRAM-WIDE admin
-- membership. Someone made admin of one subproject has no business renaming the program or adding
-- projects beside it. Matches `adminProgramIds` in the client.
create or replace function is_program_wide_admin(target_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
     where user_id = auth.uid() and program_id = target_program
       and subproject_id is null and role_id = 'program_admin'
  );
$$;

drop policy if exists programs_update on programs;
create policy programs_update on programs for update
  using (is_program_wide_admin(id)) with check (is_program_wide_admin(id));

-- Creating a PROGRAM cannot be gated on administering it — nobody can be admin of a program that
-- does not exist yet, and gating it on some higher role would mean inventing one. Any signed-in
-- user may create a program and becomes its Program Admin by doing so; everything below a program
-- is then gated normally.
drop policy if exists programs_insert on programs;
create policy programs_insert on programs for insert to authenticated with check (true);

create or replace function dms_grant_program_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into memberships (user_id, program_id, subproject_id, role_id)
    values (auth.uid(), new.id, null, 'program_admin')
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists programs_grant_creator on programs;
create trigger programs_grant_creator after insert on programs
  for each row execute function dms_grant_program_creator();

-- `projects` and `cycles` inherited blanket `for all` write policies from 0002 (as `releases_write`
-- and `cycles_write`), which let ANY member of the program write them. That was harmless while
-- nothing wrote to these tables; now that the app does, it has to say what it means. Permissive
-- policies OR together, so the loose ones are dropped rather than merely joined by stricter ones.
drop policy if exists releases_write on projects;
drop policy if exists projects_write on projects;
create policy projects_write on projects for all
  using (is_program_wide_admin(program_id)) with check (is_program_wide_admin(program_id));

-- Only INSERT and DELETE are added for subprojects. The existing `waves_update` policy (any member
-- of the subproject) is deliberately LEFT ALONE: finalizing scope writes `scope_finalized` on this
-- row, and that is a consultant's act, not an admin's. Tightening update here would break the scope
-- wizard for everyone who actually uses it.
--
-- The cost is that a member can also rename a subproject or move its dates, which the UI does not
-- offer them but the API would allow. Fixing that properly needs a column-level rule — a trigger
-- comparing OLD and NEW and rejecting master-data changes from non-admins — not an RLS policy,
-- which can only see the whole row. Recorded rather than half-done.
drop policy if exists subprojects_insert on subprojects;
create policy subprojects_insert on subprojects for insert
  with check (is_program_wide_admin((select pj.program_id from projects pj where pj.id = project_id)));
drop policy if exists subprojects_delete on subprojects;
create policy subprojects_delete on subprojects for delete
  using (is_program_wide_admin((select pj.program_id from projects pj where pj.id = project_id)));

-- Same for cycles. The SELECT half stays as it was (`cycles_select`, membership-based) — reading a
-- cycle is part of doing the work; creating one is administering the plan.
drop policy if exists cycles_write on cycles;
create policy cycles_write on cycles for all
  using (is_program_wide_admin((
    select pj.program_id from subprojects sp join projects pj on pj.id = sp.project_id where sp.id = subproject_id)))
  with check (is_program_wide_admin((
    select pj.program_id from subprojects sp join projects pj on pj.id = sp.project_id where sp.id = subproject_id)));

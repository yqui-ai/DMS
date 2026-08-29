-- Nothing is deleted. Everything is archived.
--
-- A migration programme's records are its audit trail — what was in scope, what a field mapped to,
-- which rule was applied on the day. Deleting any of it destroys the answer to a question somebody
-- will ask a year later, and the cascades from `programs` reach the whole database. Archiving keeps
-- the record, takes it out of the working lists, and makes it read-only.
--
-- Archiving a program, project, subproject or cycle needs THREE approvals — Program Admin, Data
-- Governance Lead and CAB. Objects, FMDs, XREF tables and rules are configurable per area through
-- the existing `approval_matrix`.

/* ─────────────────────────────────────────────────────────────────── the archive columns */

-- `archived_via` records WHICH request archived a row, so restoring reverses exactly the set that
-- request touched. Without it, restoring a program would un-archive a subproject that had been
-- archived separately months earlier.
do $$
declare t text;
begin
  foreach t in array array[
    'programs', 'projects', 'subprojects', 'cycles',
    'migration_objects', 'fmds', 'xref_tables', 'rules'
  ] loop
    execute format('alter table %I add column if not exists archived_at timestamptz', t);
    execute format('alter table %I add column if not exists archived_by text', t);
    execute format('alter table %I add column if not exists archived_via uuid', t);
    execute format('create index if not exists %I on %I (archived_at)', t || '_archived_idx', t);
  end loop;
end $$;

/* ──────────────────────────────────────────────────────────────────── requests + approvals */

create table if not exists archive_requests (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in
    ('program', 'project', 'subproject', 'cycle', 'object', 'fmd', 'xref', 'rule')),
  entity_id uuid not null,
  -- Snapshotted so a decided request still reads properly even after the thing it names changes.
  entity_label text,
  -- Which program the request belongs to. Everything here is scoped by it, including RLS.
  program_id uuid not null references programs on delete cascade,
  reason text,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'Pending'
    check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  decided_at timestamptz
);

-- Only one OPEN request per thing: two people requesting the same archive would collect approvals
-- in two places and neither would reach the threshold. A partial index, because the rule applies
-- only to Pending rows — a table constraint cannot express that.
create unique index if not exists archive_requests_one_open
  on archive_requests (entity_type, entity_id) where status = 'Pending';

create table if not exists archive_approvals (
  request_id uuid not null references archive_requests on delete cascade,
  role_id text not null references roles,
  approver text,
  decision text check (decision in ('Approved', 'Rejected')),
  decided_at timestamptz,
  primary key (request_id, role_id)
);

/* ───────────────────────────────────────────────────────────────────────── who must approve */

-- Fixed, not configurable: these three roles are the governance of a migration programme, and a
-- programme that can reconfigure who signs off on destroying its own history has not got a control.
-- WHETHER approval is needed at all is configurable per area — see the approval_matrix rows below.
create or replace function dms_archive_approver_roles() returns text[]
language sql immutable as $$
  select array['program_admin', 'data_governance_lead', 'cab']::text[];
$$;

-- Hierarchy levels always require approval. Everything else asks `approval_matrix`, so a programme
-- can decide that archiving a single obsolete rule is not a three-signature affair.
create or replace function dms_archive_needs_approval(p_program_id uuid, p_entity_type text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_entity_type in ('program', 'project', 'subproject', 'cycle') then true
    else coalesce((
      select am.approval_required
        from approval_matrix am
       where am.program_id = p_program_id
         and am.action = 'archive'
         and am.area = case p_entity_type
               when 'object' then 'Scope'
               when 'fmd' then 'Scope'
               when 'xref' then 'Rules'
               when 'rule' then 'Rules'
             end
       limit 1), false)
  end;
$$;

-- Seed the configurable half. 0008 renamed this column project_id -> program_id along with the
-- rest of the hierarchy; it points at a program.
insert into approval_matrix (program_id, area, action, approval_required, approver_role_id)
select p.id, a.area, 'archive', false, 'data_governance_lead'
  from programs p
  cross join (values ('Scope'), ('Rules')) as a(area)
 where not exists (
   select 1 from approval_matrix m
    where m.program_id = p.id and m.area = a.area and m.action = 'archive');

/* ─────────────────────────────────────────────────────────────────────────────── cascade */

-- Archives one record and everything beneath it, stamping each row with the request that did it.
-- Idempotent: a row already archived is left exactly as it was, so its own `archived_via` survives
-- and a later restore of THIS request will not sweep it up.
create or replace function dms_apply_archive(p_request uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r archive_requests%rowtype;
  who text;
  now_ts timestamptz := now();
begin
  select * into r from archive_requests where id = p_request;
  if not found then raise exception 'Archive request not found.'; end if;
  who := r.requested_by;

  if r.entity_type = 'program' then
    update programs set archived_at = now_ts, archived_by = who, archived_via = r.id
     where id = r.entity_id and archived_at is null;
    update projects set archived_at = now_ts, archived_by = who, archived_via = r.id
     where program_id = r.entity_id and archived_at is null;
    update subprojects set archived_at = now_ts, archived_by = who, archived_via = r.id
     where project_id in (select id from projects where program_id = r.entity_id) and archived_at is null;

  elsif r.entity_type = 'project' then
    update projects set archived_at = now_ts, archived_by = who, archived_via = r.id
     where id = r.entity_id and archived_at is null;
    update subprojects set archived_at = now_ts, archived_by = who, archived_via = r.id
     where project_id = r.entity_id and archived_at is null;

  elsif r.entity_type = 'subproject' then
    update subprojects set archived_at = now_ts, archived_by = who, archived_via = r.id
     where id = r.entity_id and archived_at is null;

  elsif r.entity_type = 'cycle' then
    update cycles set archived_at = now_ts, archived_by = who, archived_via = r.id
     where id = r.entity_id and archived_at is null;

  elsif r.entity_type = 'object' then
    update migration_objects set archived_at = now_ts, archived_by = who, archived_via = r.id
     where id = r.entity_id and archived_at is null;
  elsif r.entity_type = 'fmd' then
    update fmds set archived_at = now_ts, archived_by = who, archived_via = r.id
     where id = r.entity_id and archived_at is null;
  elsif r.entity_type = 'xref' then
    update xref_tables set archived_at = now_ts, archived_by = who, archived_via = r.id
     where id = r.entity_id and archived_at is null;
  elsif r.entity_type = 'rule' then
    update rules set archived_at = now_ts, archived_by = who, archived_via = r.id
     where id = r.entity_id and archived_at is null;
  end if;

  -- Cycles under any subproject this request archived. Done last so it covers every branch above.
  update cycles set archived_at = now_ts, archived_by = who, archived_via = r.id
   where archived_at is null
     and subproject_id in (select id from subprojects where archived_via = r.id);
end $$;

/* ─────────────────────────────────────────────────────────────────────────────── restore */

-- Reverses exactly what a request archived — the `archived_via` stamp — and nothing else.
create or replace function dms_restore_archive(p_request uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array array[
    'programs', 'projects', 'subprojects', 'cycles',
    'migration_objects', 'fmds', 'xref_tables', 'rules'
  ] loop
    execute format(
      'update %I set archived_at = null, archived_by = null, archived_via = null where archived_via = $1', t)
      using p_request;
  end loop;
  update archive_requests set status = 'Cancelled', decided_at = now() where id = p_request;
end $$;

/* ────────────────────────────────────────────────────── apply once every role has approved */

create or replace function dms_check_archive_approvals() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  required text[] := dms_archive_approver_roles();
  approved int;
  rejected int;
begin
  select count(*) filter (where decision = 'Approved'),
         count(*) filter (where decision = 'Rejected')
    into approved, rejected
    from archive_approvals
   where request_id = new.request_id and role_id = any(required);

  -- One rejection ends it. Requiring every role to reject before stopping would leave a request
  -- that governance has already refused sitting open, collecting approvals.
  if rejected > 0 then
    update archive_requests set status = 'Rejected', decided_at = now()
     where id = new.request_id and status = 'Pending';
  elsif approved >= array_length(required, 1) then
    update archive_requests set status = 'Approved', decided_at = now()
     where id = new.request_id and status = 'Pending';
    perform dms_apply_archive(new.request_id);
  end if;
  return new;
end $$;

drop trigger if exists archive_approvals_check on archive_approvals;
create trigger archive_approvals_check
  after insert or update on archive_approvals
  for each row execute function dms_check_archive_approvals();

/* ───────────────────────────────────────── apply immediately when no approval is required */

-- An area whose approval_matrix row says approval is NOT required still went through a request,
-- and without this the request would sit Pending forever waiting for signatures nobody owes it.
-- The request is still recorded — the audit trail is the point, not the ceremony.
create or replace function dms_auto_apply_archive() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not dms_archive_needs_approval(new.program_id, new.entity_type) then
    update archive_requests set status = 'Approved', decided_at = now() where id = new.id;
    perform dms_apply_archive(new.id);
  end if;
  return new;
end $$;

drop trigger if exists archive_requests_auto_apply on archive_requests;
create trigger archive_requests_auto_apply
  after insert on archive_requests
  for each row execute function dms_auto_apply_archive();

/* ───────────────────────────────────────────────────────────────────── archived = read-only */

-- An archived record is a record of what was, so it stops changing. The trigger allows writes to
-- the archive columns themselves, which is how restore works.
create or replace function dms_block_archived_edit() returns trigger
language plpgsql as $$
begin
  if old.archived_at is not null and new.archived_at is not null then
    raise exception 'This % is archived and cannot be edited. Restore it first.', tg_table_name
      using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'programs', 'projects', 'subprojects', 'cycles',
    'migration_objects', 'fmds', 'xref_tables', 'rules'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_archived_readonly', t);
    execute format(
      'create trigger %I before update on %I for each row execute function dms_block_archived_edit()',
      t || '_archived_readonly', t);
  end loop;
end $$;

/* ──────────────────────────────────────────────────────────────────────────────────── RLS */

alter table archive_requests enable row level security;
alter table archive_approvals enable row level security;

drop policy if exists archive_requests_select on archive_requests;
create policy archive_requests_select on archive_requests for select
  using (program_id in (select current_project_ids()));

-- Anyone who can reach the program may ASK. Only the approver roles can decide, which is the
-- control that matters.
drop policy if exists archive_requests_insert on archive_requests;
create policy archive_requests_insert on archive_requests for insert
  with check (program_id in (select current_project_ids()));

drop policy if exists archive_requests_update on archive_requests;
create policy archive_requests_update on archive_requests for update
  using (program_id in (select current_project_ids()))
  with check (program_id in (select current_project_ids()));

drop policy if exists archive_approvals_select on archive_approvals;
create policy archive_approvals_select on archive_approvals for select
  using (request_id in (select id from archive_requests where program_id in (select current_project_ids())));

-- You may only record a decision for a role you actually hold on that program.
drop policy if exists archive_approvals_write on archive_approvals;
create policy archive_approvals_write on archive_approvals for all
  using (exists (
    select 1 from archive_requests r
      join memberships m on m.program_id = r.program_id
     where r.id = request_id and m.user_id = auth.uid() and m.role_id = archive_approvals.role_id))
  with check (exists (
    select 1 from archive_requests r
      join memberships m on m.program_id = r.program_id
     where r.id = request_id and m.user_id = auth.uid() and m.role_id = archive_approvals.role_id));

comment on table archive_requests is
  'Requests to archive a record. Program/Project/Subproject/Cycle always need the three approver '
  'roles; everything else follows approval_matrix (area, action = archive).';

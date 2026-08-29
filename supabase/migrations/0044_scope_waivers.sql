-- Waivers move from the object to the PAIR.
--
-- `subproject_objects.waiver_reason` holds one reason per dependent object. That was fine while the
-- UI asked "why are this object's gaps deliberate", but the Dependency Check now waives one
-- prerequisite at a time — and an object with four missing prerequisites can easily have three that
-- are genuinely covered elsewhere and one that is an oversight. One column cannot say that.
--
-- The old column is left in place and still readable; nothing is migrated away from it, because a
-- reason recorded against an object is a true statement about that object even after the grain
-- changes.

create table if not exists scope_waivers (
  subproject_id uuid not null references subprojects on delete cascade,
  -- The object that needs something.
  migration_object_id uuid not null references migration_objects on delete cascade,
  -- The prerequisite being left out of scope.
  requires_object_id uuid not null references migration_objects on delete cascade,
  reason text,
  waived_by text,
  waived_at timestamptz not null default now(),
  primary key (subproject_id, migration_object_id, requires_object_id)
);

create index if not exists scope_waivers_subproject_idx on scope_waivers (subproject_id);

alter table scope_waivers enable row level security;

-- Same shape as every other subproject-scoped table (0002). Waiving is a consultant's judgement
-- about their own scope, not an administrative act.
drop policy if exists scope_waivers_select on scope_waivers;
create policy scope_waivers_select on scope_waivers for select
  using (subproject_id in (select current_wave_ids()));

drop policy if exists scope_waivers_write on scope_waivers;
create policy scope_waivers_write on scope_waivers for all
  using (subproject_id in (select current_wave_ids()))
  with check (subproject_id in (select current_wave_ids()));

comment on table scope_waivers is
  'One accepted missing prerequisite, per (object, prerequisite) pair. Supersedes the object-grain '
  'subproject_objects.waiver_reason, which stays readable for scopes recorded before this.';

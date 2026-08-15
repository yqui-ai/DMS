/* Ties the migration-object catalogue to a specific Program instead of being fully global, and
   adds fields carried through from the raw DMC_COBJ export: SCONTAINER/RCONTAINER (the sender/
   receiver container guids a future structure-and-field drill-down will join through), plus the
   DMC_DMOL_REF reference fields url/custom_field_support/analyze_selection and the raw INVALID
   flag. class defaults to 'Global' — these are SAP's standard objects, not anything programme-
   specific yet; a future "Local"/custom class is expected once objects can be added at the
   program level. */

alter table migration_objects add column class text not null default 'Global';

alter table migration_objects add column program_id uuid references programs on delete cascade;

alter table migration_objects add column scontainer text;

alter table migration_objects add column rcontainer text;

alter table migration_objects add column url text;

alter table migration_objects add column custom_field_support text;

alter table migration_objects add column analyze_selection text;

alter table migration_objects add column invalid boolean not null default false;

/* backfill the handful of synthetic demo-scope rows that predate this migration (the real DMC
   catalogue rows are dropped below and reseeded fresh, already carrying program_id) */

update migration_objects set program_id = (select id from programs order by created_at limit 1) where program_id is null;

alter table migration_objects alter column program_id set not null;

/* the previous DMC catalogue import is fully replaced by scripts/build-seed.mjs's new
   DMC_COBJ/DMC_COBJT/DMC_DMOL_REF source — remove the old rows (guid is not null identifies
   them; the synthetic demo-scope rows have guid is null and are left alone) so re-seeding
   doesn't leave stale duplicates. object_dependencies rows for them cascade-delete
   automatically; nothing else references the real catalogue rows (only the synthetic ones are
   used by subproject_objects/fmds/rules/runs/etc in the seeded demo data). */

delete from migration_objects where guid is not null;

create index on migration_objects (program_id);

drop policy mo_select on migration_objects;

create policy mo_select on migration_objects for select using (program_id in (select current_project_ids()));

drop policy mo_write on migration_objects;

create policy mo_write on migration_objects for all
  using (exists (
    select 1 from memberships m where m.user_id = auth.uid() and m.role_id = 'program_admin' and m.program_id = migration_objects.program_id
  ))
  with check (exists (
    select 1 from memberships m where m.user_id = auth.uid() and m.role_id = 'program_admin' and m.program_id = migration_objects.program_id
  ));

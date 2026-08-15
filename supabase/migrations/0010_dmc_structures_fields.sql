/* Object deep-dive: the sender/receiver structure tree and field list behind each migration
   object, sourced from SAP DMC_STREE (tree node — one per sender/receiver structure position,
   STYPE S=sender/T=receiver) + DMC_STRUCT (1:1 with DMC_STREE via STREE.STRUCT = STRUCT.GUID)
   merged into a single row per structure, plus DMC_FIELD (one row per field, joined via
   DMC_FIELD.DSTRUCTURE = DMC_STRUCT.GUID). A structure's sender/receiver container is resolved
   from migration_objects.scontainer/rcontainer (DMC_COBJ-SCONTAINER/RCONTAINER) matching
   DMC_STREE.CONTAINER. */

create table dmc_structures (
  id uuid primary key default gen_random_uuid(),
  migration_object_id uuid not null references migration_objects on delete cascade,
  side text not null check (side in ('sender', 'receiver')),
  guid text not null,
  struct_guid text not null,
  ident text not null,
  description text,
  seq int,
  level int,
  parent_guid text,
  ddic_name text,
  tab_class text,
  technical boolean not null default false,
  unique (migration_object_id, guid)
);

create table dmc_fields (
  id uuid primary key default gen_random_uuid(),
  structure_id uuid not null references dmc_structures on delete cascade,
  field_name text not null,
  seq int,
  key_flag boolean not null default false,
  data_type text,
  length int,
  output_length int,
  decimals int,
  dom_name text,
  roll_name text,
  check_table text,
  description text
);

create index on dmc_structures (migration_object_id);

create index on dmc_structures (struct_guid);

create index on dmc_fields (structure_id, seq);

alter table dmc_structures enable row level security;

create policy dmc_structures_select on dmc_structures for select
  using (migration_object_id in (select id from migration_objects where program_id in (select current_project_ids())));

alter table dmc_fields enable row level security;

create policy dmc_fields_select on dmc_fields for select
  using (structure_id in (
    select s.id from dmc_structures s
      join migration_objects mo on mo.id = s.migration_object_id
     where mo.program_id in (select current_project_ids())
  ));

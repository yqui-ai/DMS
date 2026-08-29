-- Design > Scope, steps 1 and 2: choosing what to migrate, and tying it to SAP's catalogue.
--
-- A subproject's scope arrives one of two ways: the customer uploads their own object list, or
-- someone picks from the SAP standard catalogue. Either way, step 2 has to end with every selected
-- object MAPPED to a standard SAP migration object — that mapping is what makes the object's
-- dependencies knowable, because dependencies are published against SAP idents, not customer names.
--
-- `subproject_objects` cannot hold this. Its `migration_object_id` is NOT NULL and it is keyed on
-- (subproject, migration_object), so it can only represent an object that has ALREADY been matched
-- to the catalogue. An uploaded row called "Material Master (EU)" has no catalogue id yet, and two
-- unmapped rows would collide on a null key.
--
-- So this is a staging table: rows live here through steps 1 and 2, and confirming one writes it
-- into `subproject_objects`, which stays what it has always been — the settled scope everything
-- downstream reads.

create table if not exists scope_candidates (
  id uuid primary key default gen_random_uuid(),
  subproject_id uuid not null references subprojects on delete cascade,

  -- 'import' — from the customer's uploaded list. 'standard' — picked from the SAP catalogue, in
  -- which case the mapping is itself and step 2 is a confirmation rather than a decision.
  origin text not null default 'import' check (origin in ('import', 'standard')),

  -- What the customer calls it. For a 'standard' row this is the catalogue ident, so both origins
  -- read the same way in a list.
  source_ident text not null,
  source_name text,
  source_description text,

  -- Their own in-scope tag from the template. A list can legitimately carry objects that are out of
  -- scope — recording that is the point of importing the whole list rather than a filtered one.
  in_scope boolean not null default true,

  -- Flagged in the template as not an SAP standard object. Deliberately parked: custom objects need
  -- a different conversation, and forcing them through a standard-object mapping produces a wrong
  -- answer rather than no answer.
  custom boolean not null default false,

  -- Step 2's result.
  mapped_object_id uuid references migration_objects on delete set null,
  mapping_note text,

  -- Confirmation is explicit and separate from having a mapping: a suggested match is not a
  -- decision until a person agrees with it.
  confirmed_at timestamptz,
  confirmed_by text,

  created_at timestamptz not null default now(),
  created_by text,

  -- One row per identifier per subproject. Re-importing a list updates rather than duplicates.
  unique (subproject_id, source_ident)
);

create index if not exists scope_candidates_subproject_idx on scope_candidates (subproject_id);

/* ──────────────────────────────────────────────────────────────────────────────────── RLS */

alter table scope_candidates enable row level security;

-- Same shape as every other subproject-scoped table (0002): visible and writable if the subproject
-- is one you can reach. Scope selection is the consultant's job, not an administrator's, so this is
-- deliberately not gated on program_admin.
drop policy if exists scope_candidates_select on scope_candidates;
create policy scope_candidates_select on scope_candidates for select
  using (subproject_id in (select current_wave_ids()));

drop policy if exists scope_candidates_write on scope_candidates;
create policy scope_candidates_write on scope_candidates for all
  using (subproject_id in (select current_wave_ids()))
  with check (subproject_id in (select current_wave_ids()));

comment on table scope_candidates is
  'Staging for Design > Scope steps 1-2. Confirmed rows are written into subproject_objects, which '
  'remains the settled scope. Holds rows that have no catalogue match yet, which subproject_objects '
  'structurally cannot.';

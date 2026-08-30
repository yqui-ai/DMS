/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Plants as a first-class dimension.

   Plants already existed in this app, but only as free text: `fmds.hist_plant`, a code scraped out
   of a legacy workbook's column headers by src/lib/plantSplit.ts. That was enough to keep an
   AI-converted FMD's lineage straight and no more — nothing could list the plants a programme
   actually runs, and nothing could say which subproject covers which site.

   This makes a plant a record, and attaches it to the level that does the work.

   ── Where plants attach, and why only there ──────────────────────────────────────────────────

   To SUBPROJECTS, many-to-many. A subproject can cover several plants (the stated requirement),
   and a plant can appear in several subprojects over the life of a programme — a trial load in one,
   the production wave in another.

   A project's plants are DERIVED as the union of its subprojects', never stored. Storing them at
   both levels is the two-sources-of-truth trap this schema has hit before (`fmds.owner` in 0030,
   `xref_tables.version`): the moment a subproject's plants change, a stored project-level list is
   wrong and nothing tells you. The union is one join and is always right.

   ── FMD and scope sharing across plants needs no new mechanism ───────────────────────────────

   Since 0045 an FMD is ASSIGNED (`subproject_objects.fmd_id`), not owned — many subprojects may
   point at the same document. Plants hang off subprojects, so two plants covered by the same
   subproject share its scope and its FMDs by construction, and two plants in different subprojects
   share an FMD as soon as both subprojects assign it. That is the reuse the request asks for, and
   it falls out of the existing model rather than needing a parallel plant→FMD link that would then
   have to be kept in step with the assignment.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

create table if not exists plants (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs on delete cascade,
  /* The SAP plant code — 4 characters in a standard S/4 system ('1010'), but legacy landscapes in
     this data use up to 8 ('RBTA', '928A'), which is also what plantSplit.ts's CODE_TOKEN accepts.
     Kept as text and matched case-insensitively rather than constrained to a length that real
     source files already break. */
  code text not null,
  name text not null,
  description text,
  country text,
  city text,
  archived_at timestamptz,
  archived_by text,
  created_at timestamptz not null default now(),
  created_by text,
  changed_at timestamptz,
  changed_by text
);

/* One code per programme, case-insensitively: '1010' and '1010' typed by two people on different
   days is one plant, and a list with both in it is worse than useless — it silently splits a site's
   scope in two. Partial on archived_at so retiring a plant frees its code for reuse. */
create unique index if not exists plants_program_code_key
  on plants (program_id, upper(code)) where archived_at is null;
create index if not exists plants_program_idx on plants (program_id);
create index if not exists plants_archived_idx on plants (archived_at);

/* The link.

   A surrogate `id` with the pair as a UNIQUE constraint, rather than the pair as the primary key.
   The pair is still the fact — the constraint enforces that, so a plant cannot be attached to a
   subproject twice — but the change log keys entries on a uuid primary key (`change_log.entity_id`,
   0046) and a composite-key table logs every assignment as "(unnamed)" with a null id. An audit
   entry you cannot trace back to a row is not worth writing. */
create table if not exists subproject_plants (
  id uuid primary key default gen_random_uuid(),
  subproject_id uuid not null references subprojects on delete cascade,
  plant_id uuid not null references plants on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by text,
  unique (subproject_id, plant_id)
);

create index if not exists subproject_plants_plant_idx on subproject_plants (plant_id);
create index if not exists subproject_plants_subproject_idx on subproject_plants (subproject_id);

/* ── RLS ──────────────────────────────────────────────────────────────────────────────────────

   `plants` follows the shape every programme-wide table here uses: visible to anyone with a
   membership in the programme. `current_project_ids()` returns PROGRAM ids — it kept its name
   through the 0008 rename while its body changed, which is a trap worth naming rather than
   rediscovering.

   `subproject_plants` is judged by its subproject, like every other subproject-scoped table. */

alter table plants enable row level security;

drop policy if exists plants_select on plants;
create policy plants_select on plants for select
  using (program_id in (select current_project_ids()));

/* Writing master data is an administrative act, not something any programme member should do:
   renaming a plant re-labels every subproject that covers it. `is_program_wide_admin` is the same
   gate 0037 puts on programme settings. */
drop policy if exists plants_write on plants;
create policy plants_write on plants for all
  using (is_program_wide_admin(program_id))
  with check (is_program_wide_admin(program_id));

alter table subproject_plants enable row level security;

drop policy if exists subproject_plants_all on subproject_plants;
create policy subproject_plants_all on subproject_plants for all
  using (subproject_id in (select current_wave_ids()))
  with check (subproject_id in (select current_wave_ids()));

/* Assigning a plant to a subproject is ordinary planning work, so it is open to the subproject's
   members — unlike creating the plant itself. The two are deliberately different gates: deciding
   which sites a wave covers is the wave's business; deciding which sites exist is the programme's. */

/* ── Change log ───────────────────────────────────────────────────────────────────────────────
   Both tables join the append-only log from 0046. Which plants a wave covers is exactly the kind
   of decision people later disagree about having made. */

do $$
declare t text;
begin
  foreach t in array array['plants', 'subproject_plants'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists %I on %I', t || '_change_log', t);
    execute format(
      'create trigger %I after insert or update or delete on %I
         for each row execute function dms_log_change()',
      t || '_change_log', t
    );
  end loop;
end $$;

comment on table plants is
  'SAP plants (sites) a programme migrates. Attached to subprojects via subproject_plants; a '
  'project''s plants are the union of its subprojects'', derived and never stored.';

comment on table subproject_plants is
  'Which plants a subproject covers. Many-to-many: a subproject spans several sites, and a site '
  'recurs across waves. Scope and FMDs are shared across plants through the subproject, not here.';

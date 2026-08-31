/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Per-plant mapping rules.

   A Custom FMD belongs to one (object, subproject) pair, and a subproject can cover several
   plants. For most fields that is fine — the mapping is the mapping. But a LOCAL field is local
   precisely because its handling differs by plant: the same target column is filled from a
   different source, or with a different default, in Hamburg than in Osaka. Until now the FMD had
   one TRANSFORMATION_RULE and one TECHNICAL_RULE per row and no way to say that, so the difference
   lived in a comment, in a spreadsheet, or in somebody's head.

   ── Keyed on `row_key`, not on a version ──────────────────────────────────────────────────────
   Exactly as `fmd_field_notes` is (0027), and for the same reason. `row_key` is the CONTENT-based
   identity from src/lib/rowDiff.ts (the SRC/TGT field combination), so a rule survives
   regeneration: sync the FMD to a newer Golden template, or regenerate it entirely, and the rule
   is still attached to the mapping it was written about. Keying on a version id would discard
   every per-plant rule the first time the document was rebuilt — which is the moment they matter
   most, because that is when someone has to check them all again.

   The consequence to remember: renaming SRC_FIELD or TGT_FIELD changes a row's identity. The app
   re-keys these rows in the same transaction as the rename (see useEditFmdField), the way it
   already does for field notes. A rule left behind by a rename is not deleted, just orphaned —
   which is worse, because nothing shows it.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

create table fmd_plant_rules (
  id uuid primary key default gen_random_uuid(),
  fmd_id uuid not null references fmds on delete cascade,
  structure_id text not null,
  row_key text not null,
  plant_id uuid not null references plants on delete cascade,

  /* Both nullable. A plant may override only the business rule, only the technical one, or add a
     note explaining why it differs at all — and "no override" has to be expressible, because a
     blank string is a rule that says "map this to nothing". */
  transformation_rule text,
  technical_rule text,
  note text,

  created_by text not null,
  created_at timestamptz not null default now(),
  changed_by text,
  changed_at timestamptz,

  /* One override per plant per row. A second row for the same plant is not a second opinion, it is
     an ambiguity nobody can resolve at load time — which of the two does the ETL developer build? */
  unique (fmd_id, structure_id, row_key, plant_id)
);

create index fmd_plant_rules_row_idx on fmd_plant_rules (fmd_id, structure_id, row_key);

alter table fmd_plant_rules enable row level security;

/* The Library RLS shape, copied exactly from fmd_field_notes: visible if the FMD's subproject is
   one of mine, OR the FMD is programme-wide and I have any membership. The second clause is the
   only reason Golden/Standard rows are reachable at all — see the library-section-design skill. */
create policy fmd_plant_rules_all on fmd_plant_rules for all using (
  fmd_id in (
    select id from fmds
    where subproject_id in (select current_wave_ids())
       or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
  )
) with check (
  fmd_id in (
    select id from fmds
    where subproject_id in (select current_wave_ids())
       or (subproject_id is null and exists (select 1 from memberships m where m.user_id = auth.uid()))
  )
);

comment on table fmd_plant_rules is
  'Per-plant overrides of a mapping row''s transformation/technical rule, for fields whose handling '
  'differs by plant. Anchored to the content-based row_key so an override survives regeneration.';

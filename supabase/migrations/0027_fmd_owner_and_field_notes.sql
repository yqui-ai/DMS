-- FMD "owner" — a plain email string (same convention as created_by/approved_by everywhere else
-- in this schema, not a foreign key to a users table), used only to gate who can post field notes
-- below. This is an application-level/workflow gate, not a hard security boundary: RLS on
-- fmd_field_notes still governs actual DB write access by program/subproject membership, same as
-- every other table here — "owner" just controls whether the UI's note composer is enabled.
alter table fmds add column owner text;

-- Per-field notes/comments — attached to the FMD itself (not a specific version), keyed by
-- structure + row identity, so a note like "double-check this XREF" persists across versions
-- instead of disappearing the moment a new version is generated. row_key matches the same
-- content-based identity src/lib/rowDiff.ts already uses for version diffing (SRC/TGT field
-- combo), not a row index, so it stays stable even if rows get re-sorted or re-ordered.
create table fmd_field_notes (
  id uuid primary key default gen_random_uuid(),
  fmd_id uuid not null references fmds on delete cascade,
  structure_id text not null,
  row_key text not null,
  tag text not null default 'note' check (tag in ('note', 'todo')),
  body text not null,
  resolved boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index fmd_field_notes_field_idx on fmd_field_notes (fmd_id, structure_id, row_key);

alter table fmd_field_notes enable row level security;
create policy fmd_field_notes_all on fmd_field_notes for all using (
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

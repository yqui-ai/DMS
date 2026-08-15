-- Golden FMD Designer: distinguishes curated "Golden" FMDs (built via the dedicated designer)
-- from ad-hoc "Standard" FMDs created per-object during scoping, and adds a changed-by/at audit
-- trail alongside the existing created-by/at columns on fmd_versions.

alter table fmds
  add column type text not null default 'Standard' check (type in ('Standard', 'Golden'));

alter table fmd_versions
  add column changed_by text,
  add column changed_at timestamptz;

-- Golden FMDs are program-wide by definition and have no owning subproject/object — relax the
-- not-null constraint on subproject_id so the designer can create them without a fixture.
alter table fmds alter column subproject_id drop not null;

-- Remove the seeded demo FMD ("FMD — MARA/MARC Core Fields") — dummy fixture data, not a real
-- Golden FMD produced by the designer. fmd_versions rows cascade with it.
delete from fmds where name = 'FMD — MARA/MARC Core Fields';

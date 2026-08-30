/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Give the Golden XREF the same draft-and-publish model as the Golden FMD.

   Editing an FMD produces a DRAFT: `fmd_versions.published_at is null` means the row is still being
   worked on, publishing stamps it and freezes it, and a trigger enforces that however the write
   arrives (0029/0030). Version numbers are assigned at PUBLISH time, so nothing is numbered until
   somebody decides it is finished.

   `xref_versions` had none of that — no `published_at`, only a `state` word — so every save from the
   designer inserted a fresh row with a bumped version. Saving mid-edit released it. Two templates
   in one catalogue, versioned by opposite rules, and the XREF's rule silently published work in
   progress.

   Backfill treats every EXISTING row as published: they have been the live template since the day
   they were written, and marking them drafts retroactively would un-release the current one.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

alter table xref_versions add column if not exists published_at timestamptz;
alter table xref_versions add column if not exists published_by text;

update xref_versions
   set published_at = coalesce(created_at, now()),
       published_by = coalesce(created_by, 'System')
 where published_at is null;

/* ── The same freeze the FMD has ──────────────────────────────────────────────────────────────
   A policy decision that lives only in a Save button is not a policy: the FMD learned that when a
   published version could still be edited from anywhere that forgot to check. */

create or replace function xref_versions_block_published_edit() returns trigger
language plpgsql as $$
begin
  if old.published_at is not null
     and (new.structure is distinct from old.structure
          or new.version is distinct from old.version) then
    raise exception
      'Version % is published — its structure cannot be edited. Save a new draft instead.', old.version
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists xref_versions_no_published_edit on xref_versions;
create trigger xref_versions_no_published_edit
  before update on xref_versions
  for each row execute function xref_versions_block_published_edit();

comment on function xref_versions_block_published_edit is
  'Published XREF versions are frozen. Mirrors fmd_versions_block_published_edit — the comment and '
  'state may still change, the structure and version number may not.';

/* A draft carries the literal version 'Draft' until it is released, exactly as an FMD draft does,
   so nothing is numbered before somebody decides it is finished. `unique (xref_table_id, version)`
   then does useful work for free: it allows only ONE draft per table, which is the intended model —
   a second concurrent draft has no way to merge with the first. */

-- Two changes: review points become threaded, and FMD versions gain an explicit publish moment.

/* ── 1. Threaded replies on a review point ──────────────────────────────────────────────────
   A reply is just another fmd_field_notes row with parent_id set, rather than a second table:
   it inherits the same RLS policy, the same fmd/structure/row identity, and the same created_by
   convention for free. Top-level points have parent_id null.

   Replies deliberately reuse the parent's category and resolution rather than carrying their own —
   a thread resolves as a unit, so `tag` and `resolved` are ignored on child rows. The app writes
   'remark'/false there; nothing reads them. */
alter table fmd_field_notes
  add column parent_id uuid references fmd_field_notes(id) on delete cascade;

create index fmd_field_notes_parent_idx on fmd_field_notes (parent_id);

/* ── 2. Draft vs published versions ────────────────────────────────────────────────────────
   fmd_versions.state already carries Draft/In Review/Approved/Rejected, so "is this published"
   needs no new column — but there was no record of WHO published a version or WHEN, distinct from
   who created it. Editing a draft mutates it in place; publishing seals it, and the next edit
   starts a fresh draft. published_at being null is what makes a version editable. */
alter table fmd_versions add column published_by text;
alter table fmd_versions add column published_at timestamptz;

-- Every version created before this migration was generated-and-final, never an editable working
-- draft — backfill them as published so nothing pre-existing is suddenly mutable.
update fmd_versions
  set published_at = coalesce(created_at, now()), published_by = coalesce(created_by, 'System')
  where published_at is null;

-- Guard the core invariant in the database, not just the UI: a published version's content can
-- never be rewritten. Drafts stay freely editable; publishing is a one-way door.
create or replace function fmd_versions_block_published_edit() returns trigger
language plpgsql as $$
begin
  if old.published_at is not null
     and (new.sheets is distinct from old.sheets or new.version is distinct from old.version) then
    raise exception 'Version % is published and cannot be edited — create a new draft instead', old.version;
  end if;
  return new;
end;
$$;

create trigger fmd_versions_block_published_edit_trg before update on fmd_versions
  for each row execute function fmd_versions_block_published_edit();

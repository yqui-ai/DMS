-- Fixes an over-broad guard from 0029: it froze the whole `sheets` blob on a published version,
-- which also blocked SAVING A MAPPING REVIEW against it. That's wrong — a review is an assessment
-- of existing content, not a change to it, and reviewing the published version is exactly what you
-- want to do. Reviews are stored inside `sheets` (mappingReviews), so the guard caught them.
--
-- The real invariant is "published MAPPING CONTENT is immutable", not "the sheets column never
-- changes". Comparing with the review keys stripped (jsonb `-` removes a key) states that
-- precisely: generatedColumns/generatedTables/goldenStructure/etc. stay frozen, review results
-- can still be appended.

/* ── FMD ownership moves to the scope register ────────────────────────────────────────────────
   An FMD's owner is now whoever owns the migration object in that subproject (assigned during
   in-scope selection), not a per-document field. Keeping fmds.owner as well would leave two
   sources of truth that can disagree — the same shape of bug as the dead xref_tables.version
   column, which silently showed stale data for months.

   Any owner already set on an FMD is carried across to the matching scope row before the column
   goes, so nothing anyone entered is lost. Only fills gaps: an owner already recorded in scope
   wins, since that's the register this is consolidating onto. */
update subproject_objects so
  set owner = f.owner
  from fmds f
  where f.owner is not null
    and so.subproject_id = f.subproject_id
    and so.migration_object_id = f.migration_object_id
    and so.owner is null;

alter table fmds drop column owner;

create or replace function fmd_versions_block_published_edit() returns trigger
language plpgsql as $$
begin
  if old.published_at is not null
     and (
       (new.sheets - 'mappingReviews' - 'mappingReview')
         is distinct from
       (old.sheets - 'mappingReviews' - 'mappingReview')
       or new.version is distinct from old.version
     ) then
    raise exception 'Version % is published — its mapping content cannot be edited. Create a new draft instead.', old.version;
  end if;
  return new;
end;
$$;

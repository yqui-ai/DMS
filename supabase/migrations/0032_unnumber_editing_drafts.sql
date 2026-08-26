-- Editing drafts stop carrying a version number.
--
-- A draft is a staging area for edits, not a version: numbering it at the first keystroke made a
-- new version appear the moment anyone touched a cell, and pinned the number before it was known
-- to be right. The app now writes 'Draft' and allocates the real number at publish time
-- (see nextPublishedVersion in src/lib/queries/fmds.ts).
--
-- This backfills drafts opened under the old behaviour. The `exists` clause is what separates the
-- two kinds of unpublished row:
--   * an EDITING draft — something is already published, so this row exists only to collect changes
--   * a FIRST version   — nothing is published yet, so its v1.0.0 is a real number that a
--                         generation or conversion assigned, and must be left alone
--
-- unique (fmd_id, version) keeps this safe: at most one row per FMD can end up as 'Draft', and if
-- an FMD somehow holds two unpublished editing rows the constraint rejects the update rather than
-- silently merging them.
update fmd_versions v
   set version = 'Draft'
 where v.published_at is null
   and v.version <> 'Draft'
   and exists (
     select 1 from fmd_versions p
      where p.fmd_id = v.fmd_id
        and p.published_at is not null
   );

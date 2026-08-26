-- An editing draft stops being a row in fmd_versions.
--
-- 0032 removed the draft's version NUMBER, but the row itself remained: saving one cell still added
-- an entry to the FMD's version list. A draft is not a version — it's a set of uncommitted changes
-- against one — so it now lives on the FMD as `draft`:
--
--   { "baseVersionId": "<uuid>", "pendingChanges": [ …FmdPendingChange… ] }
--
-- The draft holds ONLY the changes, never a copy of the mapping content. The edited document is
-- derived (base version + changes) wherever it's shown, so there is exactly one copy of the data
-- and no second thing to keep in sync. Publishing applies the selected changes to the base and
-- inserts the one new version row that should ever have been created.
--
-- fmd_versions therefore contains only released versions and generations — never a work-in-progress.

alter table fmds add column if not exists draft jsonb;

comment on column fmds.draft is
  'Uncommitted cell edits: { baseVersionId, pendingChanges[] }. Null when nothing is in progress. '
  'Never holds mapping content — the edited document is derived from baseVersion + pendingChanges.';

-- Move drafts created under the old model onto the FMD, then drop their rows.
-- Only rows named 'Draft' (0032's label) are editing drafts; an unpublished v1.0.0 is a generated
-- first version awaiting release, which is a real version and stays put.
update fmds f
   set draft = jsonb_build_object(
         'baseVersionId', (
           select p.id from fmd_versions p
            where p.fmd_id = f.id and p.published_at is not null
            order by p.created_at desc limit 1
         ),
         'pendingChanges', coalesce(
           (select v.sheets -> 'pendingChanges' from fmd_versions v
             where v.fmd_id = f.id and v.version = 'Draft' limit 1),
           '[]'::jsonb
         )
       )
 where exists (select 1 from fmd_versions v where v.fmd_id = f.id and v.version = 'Draft');

-- A draft with no base to apply to can't be published; it would have been unreachable anyway.
update fmds set draft = null where draft -> 'baseVersionId' = 'null'::jsonb;

delete from fmd_versions where version = 'Draft';

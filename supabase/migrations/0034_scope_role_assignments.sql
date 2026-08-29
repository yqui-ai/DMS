-- Scope assignment splits into the two roles the project actually has.
--
-- There was one free-text `owner` column doing three jobs at once: naming who is accountable for
-- the object, deciding who may publish its FMD, and standing in for whoever builds the ETL. Those
-- are different people. A consultant owns the mapping — what the data means and what it becomes;
-- an ETL developer is responsible for developing the ETL pipelines and nothing else.
--
-- `owner` is RENAMED rather than kept alongside a new column: two fields that could disagree about
-- who owns an object is the same two-sources-of-truth trap as the dropped `fmds.owner` (0030) and
-- the dead `xref_tables.version`. Existing values move to `consultant`, which is what they were —
-- publishing has always been gated on this column.
alter table subproject_objects rename column owner to consultant;

alter table subproject_objects add column if not exists etl_developer text;

comment on column subproject_objects.consultant is
  'Email of the consultant who owns this object''s mapping. Gates FMD publishing together with the '
  'governance roles — see canPublish() in src/lib/rbac.ts.';

comment on column subproject_objects.etl_developer is
  'Email of the developer building this object''s ETL pipeline. Carries no publishing rights: '
  'responsible for the pipeline, not for what the mapping says.';

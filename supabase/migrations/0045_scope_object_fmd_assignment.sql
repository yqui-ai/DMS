-- An FMD is ASSIGNED to a subproject's object, not owned by one subproject.
--
-- `fmds.subproject_id` made the relationship one-to-one: a document belonged to exactly one
-- subproject, so two subprojects migrating the same object each needed their own copy of the same
-- mapping. That is the wrong shape for how the work actually runs. A Custom FMD for SIF_CUSTOMER_2
-- is a real deliverable someone wrote once; the next wave that migrates customers wants to REUSE
-- it, not re-derive it from the Golden template and drift from the original.
--
-- The assignment lives on `subproject_objects` rather than in a new join table because that row is
-- already exactly the (subproject, object) grain, and "which FMD is this subproject using for this
-- object" is a fact about that pair. Many rows may point at one `fmd_id` — that is the reuse.
--
-- `fmds.subproject_id` is NOT dropped. It still records where a document ORIGINATED, which is what
-- the Library's reference column (PRG-PRJ) and its Global/Local class are derived from. What
-- changes is that it stops being read as "the only place this is used" — Where-Used now reads the
-- assignments below.

alter table subproject_objects
  add column if not exists fmd_id uuid references fmds on delete set null;

-- Un-assign rather than cascade-delete the scope row: losing an FMD must never quietly remove an
-- object from a subproject's scope. `on delete set null` is doing that work; this index makes the
-- reverse lookup ("where is this FMD used") cheap, which is the query Where-Used runs.
create index if not exists subproject_objects_fmd_idx
  on subproject_objects (fmd_id) where fmd_id is not null;

comment on column subproject_objects.fmd_id is
  'The Field Mapping Document this subproject uses for this object. Many subprojects may share one '
  'FMD — assignment is the reuse mechanism. Null means none assigned yet.';

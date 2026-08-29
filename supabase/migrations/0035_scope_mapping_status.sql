-- Scope wizard step 2: Mapping.
--
-- Selecting an object from the SAP catalogue says "we think we need this". Mapping is the second
-- pass that says "we have confirmed a source for it" — the two are different facts and a project
-- lives in the gap between them for weeks. Recording only the selection meant nobody could tell a
-- confirmed object from one that had merely been ticked.
--
-- Left null on insert: an object nobody has looked at yet is not "Missing", it is unreviewed, and
-- the wizard counts those separately.
alter table subproject_objects
  add column if not exists mapping_status text
    check (mapping_status in ('Confirmed', 'Review', 'Missing'));

-- Why an object is in Review or Missing. Free text on purpose: the reason a source system cannot
-- supply an object is never one of five options.
alter table subproject_objects
  add column if not exists mapping_note text;

comment on column subproject_objects.mapping_status is
  'Mapping step verdict: Confirmed | Review | Missing. Null = not yet reviewed.';
comment on column subproject_objects.waiver_reason is
  'Why a prerequisite of this object is deliberately left out of scope.';

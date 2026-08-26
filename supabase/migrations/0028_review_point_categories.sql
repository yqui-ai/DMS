-- Review points grow from a 2-value tag (note/todo) into a real category set, and gain an optional
-- field so a point can be pinned to one CELL rather than the whole row.
--
-- 'note' is migrated to 'remark' rather than kept alongside it: the two meant the same thing, and
-- carrying both would leave the UI with two synonymous options nobody can choose between. Order
-- matters here — the old constraint has to go before the data can be rewritten.

alter table fmd_field_notes drop constraint fmd_field_notes_tag_check;

update fmd_field_notes set tag = 'remark' where tag = 'note';

-- todo / question / issue are actionable (they carry an open-vs-resolved status the reviewer works
-- through); remark / decision are informational records that can still be resolved but aren't
-- counted as outstanding work. That split is enforced in the app (REVIEW_POINT_CATEGORIES in
-- src/lib/reviewPointCategories.ts), not here — the DB only guards the allowed vocabulary.
alter table fmd_field_notes add constraint fmd_field_notes_tag_check
  check (tag in ('todo', 'remark', 'question', 'issue', 'decision'));

alter table fmd_field_notes alter column tag set default 'remark';

-- Which column of the row this point is about. Null = the point is about the whole row, which is
-- what the field-level view's composer posts; a value = it was raised against that specific cell.
-- Deliberately a plain text field name, not an FK: the Golden structure's field list is versioned
-- JSON, so there is no field table to reference, and a note must survive the field being renamed
-- or removed from a later Golden version.
alter table fmd_field_notes add column field text;

create index fmd_field_notes_cell_idx on fmd_field_notes (fmd_id, structure_id, row_key, field);

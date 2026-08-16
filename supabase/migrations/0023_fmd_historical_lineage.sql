-- Tracks which source file + plant an AI-converted FMD came from, independent of its (editable)
-- display name — a robust identity for "is this a re-upload of something we already have" rather
-- than parsing it back out of the name string.

alter table fmds add column hist_source_name text;
alter table fmds add column hist_plant text;

create index fmds_hist_source_idx on fmds (hist_source_name) where hist_source_name is not null;

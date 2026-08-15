-- Per-save change comments for FMD versions (Golden FMD Designer "why did this change" log),
-- kept as an append-only jsonb array: [{ comment, by, at }, ...].

alter table fmd_versions add column change_log jsonb not null default '[]'::jsonb;

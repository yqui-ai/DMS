-- 0001_init.sql created reconciliation and fallout_records but 0002_rls.sql never enabled RLS on
-- them (run_log, their closest sibling, got the "child reached through a parent" treatment — these
-- two were missed). Without RLS enabled, Supabase's default grants leave them readable/writable by
-- any authenticated user regardless of project/wave membership. Same pattern as run_log_all.

alter table reconciliation enable row level security;
create policy reconciliation_all on reconciliation for all
  using (run_id in (select id from runs where wave_id in (select current_wave_ids())))
  with check (run_id in (select id from runs where wave_id in (select current_wave_ids())));

alter table fallout_records enable row level security;
create policy fallout_records_all on fallout_records for all
  using (run_id in (select id from runs where wave_id in (select current_wave_ids())))
  with check (run_id in (select id from runs where wave_id in (select current_wave_ids())));

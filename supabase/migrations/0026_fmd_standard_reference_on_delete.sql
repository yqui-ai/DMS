-- based_on_standard_fmd_version_id (0024) was added without an ON DELETE clause, unlike its
-- sibling based_on_golden_version_id (0018) which correctly uses ON DELETE SET NULL. Without it,
-- deleting an fmd_versions row that some Custom FMD's reference still points to is blocked by the
-- default NO ACTION behavior instead of just clearing the (now-stale) reference — the same
-- graceful-degradation behavior the Golden reference already has. Bring it in line.

alter table fmds drop constraint fmds_based_on_standard_fmd_version_id_fkey;
alter table fmds add constraint fmds_based_on_standard_fmd_version_id_fkey
  foreign key (based_on_standard_fmd_version_id) references fmd_versions(id) on delete set null;

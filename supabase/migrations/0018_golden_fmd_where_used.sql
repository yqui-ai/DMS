-- Where-used tracking for the Golden FMD: a Standard FMD can be explicitly linked to the Golden
-- FMD version it was built from ("Apply Golden Template" in the FMD editor). Comparing this
-- against the Golden FMD's current latest version is how the Where-used tab flags outdated FMDs.

alter table fmds add column based_on_golden_version_id uuid references fmd_versions(id) on delete set null;

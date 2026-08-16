alter table fmds add column based_on_standard_fmd_version_id uuid references fmd_versions(id);

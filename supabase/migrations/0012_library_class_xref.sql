/* Field Mapping / Rule / Cross Reference library screens: classify each artefact as Global
   (program-wide, reusable) or Local (specific to the project it was created under) — same
   'Global'/'Local' domain already used for migration_objects.class. The "reference" shown in
   those screens (program code, or program-project code pair) is derived at query time by
   joining through subprojects -> projects -> programs, not stored — it's fully determined by
   which subproject the row already belongs to, no new FK needed. */

alter table fmds add column class text not null default 'Local' check (class in ('Global', 'Local'));

alter table rules add column class text not null default 'Local' check (class in ('Global', 'Local'));

alter table xref_tables add column class text not null default 'Local' check (class in ('Global', 'Local'));

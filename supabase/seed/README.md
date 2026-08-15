# Seeding from the prototype

**Done.** `scripts/build-seed.mjs` (repo root) implements the approach below — it reads the
prototype HTML plus a set of real SAP DMC export workbooks directly (never hand-copied), and
writes `seed.sql` next to this file. Regenerate with `npm run seed:build`.

Apply, in order: `0001_init.sql` through the latest migration, then `seed.sql`. `seed.sql` no
longer contains `dmc_structures`/`dmc_fields` (~180k rows combined) — the SQL editor rejects
queries that large even chunked/split into multiple files, so those two load separately via the
Supabase API instead: `npm run seed:load-structures` (needs `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` env vars — see that script's header comment). It's an upsert, safe to
re-run if it's interrupted partway. `app_users`/`memberships` inserts in `seed.sql` are guarded by
an `auth.users` email match, so it's safe to run before those four demo users
(jordan.alvarez@client.com, s.chen@client.com, m.okafor@client.com, p.nair@client.com) sign up —
their rows populate once matching auth accounts exist.

`migration_objects` (the real 442-object catalogue, not the 6 synthetic demo-scope ones below)
comes from `reference/dmc_cobj/DMC_COBJ.xlsx` + `DMC_COBJT.xlsx` (descriptions) +
`DMC_DMOL_REF_v2.xlsx` (category/approach/component/url). `object_dependencies` comes from
`reference/dmc_cobj/DMC_SIN_SCOBJSEQ.xlsx` (`TEMPL_COBJ` requires `PREDECESSOR`, `PREDEC_MANDATORY`
flags blocking vs. advisory), joined directly by IDENT — no guid resolution needed, unlike the
other DMC tables. `dmc_structures`/`dmc_fields` (the sender/receiver structure tree and field list
behind each real object) come from `reference/dmc_struct/DMC_STREE.xlsx` + `DMC_STREET.xlsx` +
`DMC_STRUCT.xlsx` + `DMC_FIELD_1.xlsx`/`DMC_FIELD_2.xlsx` (the field export was split across two
files upstream with an overlapping boundary, not a clean split — both `build-seed.mjs` and
`load-dmc-structures-fields.mjs` dedupe by `GUID` after combining them). The join chain:
`migration_objects.scontainer`/`rcontainer` (from `DMC_COBJ-SCONTAINER`/`RCONTAINER`) match
`DMC_STREE.CONTAINER`; `DMC_STREE.STRUCT` = `DMC_STRUCT.GUID` (1:1); `DMC_FIELD.DSTRUCTURE` =
`DMC_STRUCT.GUID`.

The prototype's demo scope objects (MARA, MARC, MBEW, MVKE, MARM, MLGN) are seeded as additional
synthetic `migration_objects` rows (`guid` null, no structures/fields) since the fixture data
references them by bare SAP table mnemonic rather than by real DMC ident — everything
subproject-scoped (`rules`, `runs`, `object_structures`, `subproject_objects`) hangs off those
synthetic rows.

Note: the table/column names below reflect the *original* Project > Release > Wave > Cycle schema
from `0001_init.sql`. `0008_program_hierarchy.sql` renamed these in place to
Program > Project > Subproject > Cycle (`projects`→`programs`, `releases`→`projects`,
`waves`→`subprojects`, `wave_id`→`subproject_id`, top-level `project_id`→`program_id`) — the
extraction logic in `build-seed.mjs` was updated to emit the new names, but the anchors below
still describe the source fixture's own (unrenamed) property paths, which is what you'd actually
grep for in the HTML.

The original extraction notes are kept below for reference:

1. **SAP migration-object catalogue** — `reference/dmc_data.js`
   - `DMC_OBJECTS` rows: `[guid, objectId, technicalName, description, category, approach, component, …]`
   - Load into `migration_objects`. This is real SAP content — keep it verbatim.
2. **Everything else** — the `state = { … }` class-field initialiser inside
   `reference/Data Migration Solution v2.dc.html`. Useful anchors:
   | Anchor | Target table |
   |---|---|
   | `config: { project…releases…waves…cycles` | projects, releases, waves, cycles |
   | `landscape: [` | connections |
   | `stagingDb: {` | staging_db |
   | `extractTables: [` | source_tables |
   | `criteriaDefs: [` | selection_criteria |
   | `objectStructures: {` | object_structures |
   | `objectApproach: {` | wave_objects.approach |
   | `rules: [` | rules |
   | `runs: [` | runs |
   | `users: [`, `roles: [`, `roleScreens`, `roleNavAccess` | app_users, roles, role_screens |
   | `workflows: [` (Program area list) | approval_matrix |
   | `dsObjects: [`, `dsGraphs: (` | etl_objects, etl_nodes, etl_edges |
   | `dsGlobals: [` | etl_globals |

3. Suggested approach: run a one-off Node script that `eval`s the state object (it is plain JS)
   and emits `seed.sql` — faster and less error-prone than retyping.
4. Wave 1A must seed with `scope_finalized = true`, otherwise the execution and governance
   navigation stays hidden (this was a real bug during the prototype build).

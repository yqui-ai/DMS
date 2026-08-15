# Seeding from the prototype

**Done.** `scripts/build-seed.mjs` (repo root) implements the approach below — it reads
`dmc_data.js` and the prototype HTML directly (never hand-copied), and writes `seed.sql` next to
this file. Regenerate with `npm run seed:build`. Apply `0001_init.sql`, `0002_rls.sql`, then
`seed.sql` against a real Supabase project. `app_users`/`memberships` inserts are guarded by an
`auth.users` email match, so the script is safe to run before those four demo users
(jordan.alvarez@client.com, s.chen@client.com, m.okafor@client.com, p.nair@client.com) sign up —
their rows populate once matching auth accounts exist. `DMC_STRUCTURES`/`DMC_FIELDS`/
`DMC_COBJ_LCYCLE`/`DMC_SIN_SCOBJSEQ` (raw SAP BAPI structure metadata, not modeled by this
schema) are intentionally not loaded; only `DMC_CATALOG` → `migration_objects` and
`DMC_DEPENDENCIES` → `object_dependencies` are used from `dmc_data.js`. The prototype's demo
scope objects (MARA, MARC, MBEW, MVKE, MARM, MLGN) are seeded as additional synthetic
`migration_objects` rows (`guid` null) since the fixture data references them by bare SAP table
mnemonic rather than by real DMC ident — everything wave-scoped (`rules`, `runs`,
`object_structures`, `wave_objects`) hangs off those synthetic rows.

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

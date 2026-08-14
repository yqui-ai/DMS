# Seeding from the prototype

The prototype's fixtures are the intended demo data. Extract them once into SQL/JSON:

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

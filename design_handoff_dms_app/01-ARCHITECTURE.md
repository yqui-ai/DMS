# Architecture

## Folder layout
```
src/
  app/
    router.tsx                 # route tree (see ROUTING.md)
    providers.tsx              # QueryClient, Supabase, Theme, Toast
    layout/
      AppShell.tsx             # sidebar + header + content slot
      Sidebar.tsx              # nav groups, role gating, collapse
      HeaderBar.tsx            # subproject switcher, env pill, search, notifications, avatar
      TabStrip.tsx             # per-screen tab strip (reused everywhere)
  features/
    programme/                 # projects, releases, waves, cycles, timeline, settings
    scope/                     # migration objects, scope wizard, ERD, FMD mapping
    fmd/                       # field mapping documents + spreadsheet viewer
    rules/                     # rules, value mapping (XREF), reference data
    staging/                   # staging area: groups, extraction jobs, staging tables
    pipelines/                 # ETL designer (see 03-PIPELINES-DESIGNER.md)
    runs/                      # runs register, run detail, job monitor
    quality/                   # DQ dimensions, pre/post-load checks, reconciliation, fallout
    cutover/                   # cutover plan
    governance/                # promotions, audit log, approvals matrix
    library/                   # catalogues: objects, FMDs, rules, golden library
    connections/               # system landscape + connections
  components/                  # shared primitives: Card, Tag, Table, Field, Dialog, Kpi, EmptyState
  lib/
    supabase.ts                # typed client
    queries/                   # one module per entity (react-query hooks)
    rbac.ts                    # role → screen access
    format.ts                  # number/date formatters (en-US, tabular nums)
  types/entities.ts            # from this bundle
  styles/tokens.css            # from this bundle
```

## Shell (restyled, structure preserved)
- **Sidebar** — 228px, collapsible to 60px. The prototype uses a near-black sidebar
  (`#16191f`); for the neutral restyle use `--surface` with a `--line` right border, muted
  labels, and the active item filled `--blue` / white (keep the active-fill affordance).
  Group headers: 10.5px, uppercase, `letter-spacing:.05em`, `--muted`.
- **Nav groups and keys** (exact):
  - MY WORK: `myWork`
  - PROJECT: `timeline`, `projectSettings`
  - DESIGN: `preparation` (label "Scope"), `rules` ("Rules & XREF")†, `referenceData`†
  - EXECUTION: `dashboard`, `migration` ("Data Migration")†, `quality`†, `cutover`†
  - GOVERNANCE†: `promotions`, `auditLog`, `jobMonitor`
  - LIBRARY: `catalogObjects`, `catalogFmds`, `catalogRules`, `goldenLibrary`
  - SYSTEMS: `connections`
  († = hidden until the active wave has `scope_finalized = true`)
- **Header** — subproject switcher (project → release → wave), breadcrumb
  `Wave 1 › Wave 1A`, environment pill (DEV / QSA / PRD, colour-coded, switching to
  QSA/PRD requires the password confirmation dialog), global search, notifications, avatar menu
  (profile, dark mode, notification prefs, sign out).
- **Content** — max-width none, padding 22–26px, page title 21px/700, optional description
  12.5px `--muted`, then a `TabStrip`.

## Routing
URL-per-screen (the prototype keeps this in component state — do not repeat that).
See `ROUTING.md`. Rules:
- Subproject context lives in the path: `/p/:projectId/w/:waveId/...`
- Tabs are path segments, not state: `/…/migration/pipelines`
- Deep links inside the designer carry the open object:
  `/…/migration/pipelines/:objectId` (job, work flow or data flow id)
- Environment and cycle are query params: `?env=QSA&cycle=c2`

## State management
- **Server state**: TanStack Query over Supabase. One query module per entity; optimistic
  updates for canvas edits (node move, link add) with rollback on error.
- **Editor state** (transient, not persisted): zoom, pan, selected node, open dock tab,
  drag-in-progress → Zustand store per designer instance.
- **Graph persistence**: nodes and edges are rows (`etl_nodes`, `etl_edges`), position saved
  debounced 400ms after drag end.
- **Forms**: react-hook-form + zod, validation messages inline under `Field`.

## Auth, roles and RLS
- Supabase Auth (email + optional SSO later).
- `app_users` mirrors auth users; `roles` and `role_screens` are tables, so the approval
  matrix stays editable in Program Settings (as in the prototype).
- `memberships (user_id, project_id, subproject_id, role_id)` drives both UI gating and RLS.
- Client-side gating must mirror `lib/rbac.ts`, seeded from this matrix:

| Role | Screens |
|---|---|
| Program Admin | all |
| Data Owner | myWork, dashboard, timeline, preparation, rules, referenceData, catalogObjects, catalogFmds, catalogRules, goldenLibrary |
| ETL Developer | myWork, dashboard, timeline, migration, quality, catalogObjects, jobMonitor |
| ETL Lead | myWork, dashboard, timeline, migration, quality, cutover, promotions, auditLog, jobMonitor, connections, catalogObjects, catalogFmds, catalogRules, goldenLibrary |
| Data Governance Lead | myWork, dashboard, timeline, preparation, rules, referenceData, quality, promotions, catalogObjects, catalogFmds, catalogRules, goldenLibrary |
| CAB | myWork, dashboard, timeline, promotions, auditLog, cutover |
| End User | read-only subset (myWork, dashboard, timeline, catalogues) |
| Guest | none until granted |

Denied navigation must not 404 — show the prototype's inline notice:
*"As \"<role>\", this role has no access to <screen>. Restricted by the approval workflow matrix."*

## Job execution (phase 1, simulated)
Implement `lib/execution/SimulatedEngine.ts` behind an interface:
```ts
interface ExecutionEngine {
  run(objectId: string, opts: RunOptions): AsyncIterable<RunEvent>;
}
type RunEvent =
  | { kind: 'node-start'; nodeId: string }
  | { kind: 'node-done'; nodeId: string; rows: number; elapsedMs: number; rejects?: number }
  | { kind: 'log'; stream: 'trace' | 'error'; line: string }
  | { kind: 'finished'; status: 'success' | 'rejects' | 'failed' };
```
The simulation algorithm is specified in `03-PIPELINES-DESIGNER.md` §Execute. Persist each run
to `runs` + `run_log` so the Runs register and Job Monitor read real rows even in phase 1.

## Build phases (foundation first)
1. **Foundation** — Vite+TS scaffold, Tailwind theme from this bundle, Supabase project, apply
   both migrations, seed script, Auth, AppShell + Sidebar + HeaderBar + TabStrip, routing skeleton
   with placeholder pages, `rbac.ts`, shared primitives (Card, Tag, Table, Field, Dialog, Kpi,
   EmptyState, TableViewer).
2. **Programme & scope** — subproject picker, Timeline, Program Settings, Scope wizard, ERD.
3. **Library & mapping** — migration objects catalogue, FMD viewer/editor, Rules & XREF, Reference data.
4. **Execution** — Staging Area, **Pipelines designer**, Runs, Job Monitor.
5. **Quality, cutover, governance** — DQ tabs, cutover, promotions, audit log, approvals matrix.
6. **Polish** — dark mode, empty/error/loading states, keyboard shortcuts, print/export.

Definition of done per screen: matches the prototype visually at 1440px, all tabs reachable by
URL, RLS-safe queries, loading skeletons, empty states with the prototype's copy, no console errors.

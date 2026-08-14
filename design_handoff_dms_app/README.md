# Handoff: SAP Data Migration Solution (DMS) — full app rebuild

## Overview
DMS is a web application that runs an SAP S/4HANA data-migration programme end to end:
programme/wave/cycle planning, scope definition against the SAP migration-object catalogue,
field-mapping documents (FMD), rules and value mapping (XREF), a staging area that ingests
legacy source tables, an **SAP Data Services–style ETL pipeline designer** (job → work flow →
data flow → transforms), run execution and monitoring, data-quality gates, cutover and
governance (approvals, promotions, audit log).

## About the design files
Everything in `reference/` is a **design reference created in HTML**, not production code.
`Data Migration Solution v2.dc.html` is a single-file React prototype (rendered by
`support.js`, a small template runtime) that demonstrates the intended look, information
architecture and behaviour. `dmc_data.js` holds the real SAP migration-object catalogue used
as fixture data.

**The task is to recreate these designs in a real codebase** — see the decided stack below —
using idiomatic patterns for that stack. Do not port the prototype's template runtime, its
`renderVals()` pattern, or its single-file structure.

## Fidelity
**High fidelity.** Colours, type scale, spacing, radii, table density, tag styles, empty states
and copy in the prototype are final and should be reproduced. Two deliberate deviations were
requested for the rebuild:
1. **App shell** — keep the structure (left sidebar, subproject switcher, environment pill,
   tab strips) but restyle to a cleaner, neutral shell (see `01-ARCHITECTURE.md` §Shell).
2. **Node canvas** — rebuild on **React Flow (xyflow)** instead of the prototype's hand-rolled
   SVG + absolutely positioned divs. Visual result should match the prototype's node cards.

## Decided stack & constraints
| Decision | Choice |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS (tokens in `design/tailwind.theme.ts`) |
| Backend | Supabase (Postgres) accessed directly from the client |
| Auth | Supabase Auth + **RLS per project/subproject**, roles held in tables |
| Node canvas | React Flow (xyflow) |
| Job execution | **Simulated in the client** for phase 1 (no ETL engine); interface stubbed so a real engine can replace it |
| Build order | **Foundation first** — shell, routing, schema, auth, then screens |
| Scope | Whole app, screen by screen |
| Repo | `yqui-ai/DMS` (branch `main`) |

## Fast start for Claude Code
```
read design_handoff_dms_app/README.md and start phase 1
```
`starter/README.md` has the exact `npm create vite` + dependency commands, and the files under
`starter/src` are drop-in (nav structure, RBAC matrix, React Flow node card, simulated engine,
graph validation) so phase 1 begins with working code rather than boilerplate.

## Read these in order
1. `01-ARCHITECTURE.md` — folder layout, shell, routing, state, auth/RLS, build phases
2. `02-SCREENS.md` — every screen, its layout, components, states and per-screen checklist
3. `03-PIPELINES-DESIGNER.md` — the ETL designer in full detail (the heaviest feature)
4. `04-DATA-MODEL.md` — entities, relationships, seed data
5. `supabase/migrations/*.sql` — schema + RLS to apply as-is
6. `design/tokens.css`, `design/tailwind.theme.ts` — exact design tokens
7. `types/entities.ts` — TypeScript types matching the schema
8. `ROUTING.md` — URL per screen

## Files in this bundle
```
README.md
01-ARCHITECTURE.md
02-SCREENS.md
03-PIPELINES-DESIGNER.md
04-DATA-MODEL.md
ROUTING.md
design/tokens.css
design/tailwind.theme.ts
types/entities.ts
supabase/migrations/0001_init.sql
supabase/migrations/0002_rls.sql
supabase/seed/README.md
starter/                                       <- runnable scaffold: tailwind config, supabase client,
                                                  rbac matrix, nav definition, React Flow node card,
                                                  simulated execution engine, graph checker
reference/Data Migration Solution v2.dc.html   <- the design prototype (open in a browser)
reference/dmc_data.js                          <- SAP migration-object catalogue fixtures
reference/support.js                           <- prototype runtime (reference only, do not port)
reference/DATA_MODEL.md                        <- notes written while building the prototype
```

## Viewing the prototype
Serve the `reference/` folder over http (`python3 -m http.server`) and open
`Data Migration Solution v2.dc.html`. It needs `support.js` and `dmc_data.js` as siblings.
Navigate: pick **Wave 1A – Material Master Core** → sidebar **Data Migration** → **Pipelines**.

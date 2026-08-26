---
name: deferred-scope
description: What has been deliberately removed from the DMS navigation and is waiting to be built, with the exact screens, routes and tabs each section had. Load this before re-adding a nav section, before deleting a "dead" screen component, and when picking up the next area of work. UPDATE THIS FILE whenever something is deferred or brought back.
---

# Deferred scope

Sections removed from the sidebar because they were placeholders, not because the work is unwanted.
**The screen components, routes and queries all still exist** — only the nav entries are gone, so
nothing here needs rebuilding from scratch when its turn comes.

**Do not delete the components listed below as unused code.** They are the starting point for each
section, and their absence from the nav is the only reason nothing imports them from a menu.

The agreed order is: finish **Design → Scope** first, then take these one at a time.

## EXECUTION — removed

| Nav item | Route | Component |
|---|---|---|
| Data Migration | `migration` | `TabbedSection` + `MIGRATION_TABS` |
| Data Quality | `quality` | `TabbedSection` + `QUALITY_TABS` |
| Cutover | `cutover` | `CutoverPage` |

**Data Migration tabs** (`MIGRATION_TABS` in `src/app/nav.ts`): Overview (`MigrationOverview`),
Staging Area (`StagingArea`), Profiling (`ProfilingPage`), Pipeline (`PipelineStages`), Runs
(`RunsRegister`, with the `:runId` child route rendering `RunDetailModal`).

**Data Quality tabs** (`QUALITY_TABS` in `src/app/router.tsx`): Overview (`QualityOverview`),
Quality Dimensions (`QualityDimensions`), Post-Transform Profiling / Pre-Load Checks / Post-Load
Checks (all `DqChecksPhase` with a different `phase` prop), Reconciliation (`ReconciliationPage`),
Fallout (`FalloutPage`).

## GOVERNANCE — removed

| Nav item | Route | Component |
|---|---|---|
| Promotions | `promotions` | `PromotionsPage` — DEV → QSA → PRD transports with approvals |
| Job Monitor | `job-monitor` | `JobMonitorPage` — live, queued and failed jobs across runs and extractions |

## Still in the nav, but thin

- **Library → Rule** is a read-only list with **no detail view at all** — a rule row is a dead end.
  `rules.version` is written once as `v1.0.0` at insert and never bumped; there is no
  `rule_versions` table. Rule versioning was explicitly deferred ("Rules later") — do not start it
  unprompted.
- **Library → Cross Reference** has a designer and viewer for the **Golden XREF only**. Standard XREF
  rows are inert and correctly styled as such via `rowClickable`.

## Bringing a section back

1. Re-add its `NAV_GROUPS` entry in `src/app/nav.ts` — the `key` must match the `ScreenKey` its
   `ScreenGate` uses, or the screen renders for nobody.
2. Its routes in `src/app/router.tsx` were never removed; check them rather than re-adding.
3. Delete its row from this file.

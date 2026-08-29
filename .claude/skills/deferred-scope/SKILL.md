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

## Design > Scope — audited 2026-08-27

The section's purpose: set the in-scope objects, assign a consultant and an ETL developer to each,
and establish load sequence and dependencies.

**Done:** in-scope selection (checkbox → `subproject_objects.in_scope`), filters, KPIs, CSV
round-trip, and a Finalize gate that locks scope and unlocks downstream sections.

**Done (0034):** two assignment roles. `consultant` and `etl_developer` on `subproject_objects`,
both chosen from actual program members rather than typed free-hand. Publishing an FMD is gated on
the consultant.

**Still open, highest value first:**

1. **Sequencing ignores dependencies.** `object_dependencies` is populated and drawn as a diagram in
   the object dialog, but `ScopeSequence` never reads it — nothing warns when an object is ordered
   before something it requires, which is the most valuable check that screen could do. Auto-
   sequencing from the graph is the natural follow-on.
2. **Reordering is one nudge at a time.** Up/down arrows, two writes per click. Unusable past ~20
   objects; wants drag-to-reorder.
3. **Dependencies are read-only.** No insert/update/delete exists anywhere, so they are whatever DMC
   supplied. There is no way to record a project-specific prerequisite.

**Not what its name suggests:** `Scope > Criteria` is row-level EXTRACTION filters (table / field /
condition / value). It has nothing to do with ownership — a comment and a tooltip both claimed
assignment happened there, and both were wrong.

## Bringing a section back

1. Re-add its `NAV_GROUPS` entry in `src/app/nav.ts` — the `key` must match the `ScreenKey` its
   `ScreenGate` uses, or the screen renders for nobody.
2. Its routes in `src/app/router.tsx` were never removed; check them rather than re-adding.
3. Delete its row from this file.

## Change Log — added 2026-08-29

`/changes` (`features/launchpad/ChangeLogPage.tsx`), reached from a button in Home > Migration
Project beside Archive.

Backed by `change_log` (migration **0046**), written by a generic `dms_log_change()` AFTER trigger
attached to sixteen tables. **Nothing writes it from the client**: there is a SELECT policy and
deliberately no INSERT or UPDATE policy, because history that can be edited is not history. Adding a
table to the log means adding its name to the array in 0046, not writing logging code.

Two rules that shaped it:

- **Updates that only touched `changed_at` / `changed_by` are not events.** The trigger diffs the
  row and returns without logging when nothing meaningful moved, so a save that changed one cell
  logs one entry rather than one per column.
- **The AI summary is an enrichment, never the record.** Every entry carries a deterministic
  sentence written by the trigger; `Summarise with AI` rewrites the wording of what is on screen
  (max 60 entries) and keeps the recorded sentence visible underneath. The page is fully usable
  when the model is unreachable, and nothing generated is ever written back to the log.

**Never read the actor with `current_setting('request.jwt.claim.*')`.** 0046 did, and that GUC was
deprecated in PostgREST v10 — it returns NULL on current Supabase, so every entry logged as
'system' and the one column an audit trail exists for was constant. Migration **0047** resolves it
through `auth.jwt() ->> 'email'`, guarded (it raises outside a request context), then `app_users`,
then the raw `auth.uid()`.

It is a new `change-summary` task on the existing `convert-historical-fmd` edge function rather than
a second function — that file's own header explains why there is one deployment and one secret.
**It needs `supabase functions deploy convert-historical-fmd` before the AI button works**; the
list itself only needs the migration.

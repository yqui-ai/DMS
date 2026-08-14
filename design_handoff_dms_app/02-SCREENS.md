# Screens

Every screen sits inside `AppShell`. Page header = title 21px/700 + optional description
12.5px `--muted`, then a `TabStrip` (13.5px/600 items, active `--blue` with a 2px bottom border,
inactive `--muted`, 15px lucide icon before the label).

Shared primitives used everywhere: `Card`, `Tag`, `Table` (sticky header, frozen action column,
footer pager), `Kpi`/`StatStrip`, `Field`, `Dialog` (sm 440 / md 640 / lg 960 / win 94vw),
`EmptyState`, `TableViewer` (data grid with filters, profiling side tab), `Toast`.

---

## 0. Subproject picker (`/`)
Purpose: choose which wave (subproject) to work in.
Layout: max-width 760px centred column. Kicker (programme name, uppercase 12px/700 `--muted`),
title "Select a subproject to open" 21px, description, then per-release groups: release header
row (`package` icon + name + "Configure project" ghost link) followed by a 2-column grid of wave
tiles. Tile: `layers` icon square (36px, `bg #e8f0f9`, icon `--blue`), wave name 14px/700,
sub-line `<code> · <n> cycles` 12px `--muted`, right arrow; hover lifts (`shadow cardHover`).
Empty release: muted line "No subprojects yet — add one in project configuration."
Checklist: releases render in config order · wave click sets context and routes to Dashboard ·
"Program configuration" opens Program Settings.

## 1. My Work (`/my-work`)
Role-aware inbox. Cards: "My open items", "Awaiting my approval", "Blockers assigned to me",
each a table of item / context / due / state with a state tag and a row action that deep-links.
Checklist: counts in card headers as neutral tags · rows navigate to the owning screen.

## 2. Timeline (`/timeline`)
Programme plan: releases → waves → cycles as horizontal bars with month gridlines; today marker;
data-freeze markers; calendar dialog for a date; legend. Bars are `--blue` at varying tints,
freeze marker red dashed. Checklist: bar click selects the wave · hovering shows dates ·
switching wave updates the shell context.

## 3. Program Settings (`/p/:p/settings`)
Tabs: **Configure · Users · Roles · Approvals · Promotions**.
- Configure: programme, releases, waves, cycles CRUD with inline edit mode (Edit / Save / Cancel
  pattern with a snapshot for rollback), date fields `dd.mm.yyyy`, `31.12.9999` as open end.
- Users: table (name, email, role select, status tag, last login) + Add user.
- Roles: 8 standard roles with description and a screen-permission matrix
  (checkbox grid, groups: General / Scoping / Selection Criteria / Migration / Quality / Governance).
- Approvals: per area (Program, Scope, Rules, Migration, Quality, Cutover) list of actions with an
  "Approval required" toggle and an approver-role select.
- Promotions: transport path config DEV → QSA → PRD.
Checklist: editing is explicit (no autosave) · role changes reflect immediately in the sidebar.

## 4. Scope (`/scope`)
Tabs: **Overview · Migration Object · ERD Diagram* · FMD Mapping*** (*after finalize).
- Overview: KPIs (objects in scope, prerequisites open, FMDs approved, rules active) + panels.
- Migration Object: searchable table of the SAP catalogue (`reference/dmc_data.js`) with columns
  object id, technical name, description, category (Master/Transactional), approach
  (Direct Transfer / Staging Table / …), component (application area, colour-coded tag), in-scope
  checkbox, owner. Actions: Import object list (template download + upload), Select objects
  (standard list), Finalize scope (with the "unresolved prerequisites" warning dialog), Reopen scope.
- Wizard (`/scope/wizard/:step`): 1 select objects → 2 dependency diagram → 3 load sequence
  (drag to order, prerequisite validation) → 4 finalize. Progress uses the `pflow` step dots.
- ERD Diagram: draggable entity boxes with relationship lines, component filter, full-screen dialog.
- FMD Mapping: object ↔ FMD version assignment table.
Checklist: finalize flips `waves.scope_finalized` and unlocks the gated nav · prerequisite objects
missing from scope must be waivable with a reason.

## 5. Rules & XREF (`/rules`)
Tabs: **Overview · Rules · Value Mapping**.
- Rules: register table (rule id mono, name, object, type Validation/Transformation/Enrichment,
  severity tag Critical/High/Medium/Low, status governance tag Draft/In Review/Approved/Rejected,
  owner, version). Row opens a detail dialog with the expression and history.
- Value Mapping: XREF table list (name, purpose, rows, version) → row grid editor with legacy
  value, S/4 value, valid from, status; filters dialog; pop-out viewer.
Checklist: governance tags use the `tag-gov` outline style · versions immutable once Approved.

## 6. Reference Data (`/reference-data`)
Tabs: **Overview · Check Tables**. Check tables list (T-code, table, description, rows, last sync)
with a data viewer per table. Checklist: viewer supports search + column filters.

## 7. Dashboard (`/dashboard`)
Role-specific composition. Common: health card (score 0-100 in a coloured ring, "Program health:
At Risk", open blocker count, four stat cells: Schedule, Execution, Open blockers, Cutover
readiness), "Scope summary" stat strip (scope count, FMD approved, rules active), then two
role-specific panels ("My open items", "Blockers") and a role-specific decision table
(e.g. ETL Lead → "Runs needing an ETL decision", ETL Developer → "Objects on your build queue").
Checklist: every panel row deep-links · DEV env shows the note "Execution summary appears once
this SubProject is running in QSA or Prod — DEV is design-only."

## 8. Data Migration (`/migration`)
Tabs: **Overview · Staging Area · Profiling · Pipelines · Runs**.

### 8.1 Overview
KPIs: Tables in staging (`n/total`), Objects in pipeline, Failed runs, Runs recorded.
Panels: "Staging by connection" (per source system, `n/total` ingested tag, link "Open staging"),
"Object pipeline state" (per object, current stage + status tag).

### 8.2 Staging Area
Copy: "Every source table is ingested into the staging database first. Group tables per connection
and assign a group to an extraction job to run it." Search box filters table names.
Per connection section: icon tile + system name + tier tag + count + **New Group** + **Add Table**.
Inside: one card per group (folder icon, name, count, Delete Group) containing a table with columns
**In Scope · Table · Staging Table · Rows Ingested · Expected · Δ · Load · DQ · Ingested On ·
Duration · Snapshot · By · Status**; plus a dashed "Ungrouped" card with a reduced column set
(In Scope · Table · Staging Table · Rows Ingested · Ingested On · Status).
- Staging Table column shows the generated name `<SID>_<TABLE>_STG` (e.g. `ECP_MARA_STG`),
  mono 11.5px, muted; `—` until the table is extracted.
- Rows are draggable between groups (HTML5 drag-and-drop in the prototype; use dnd-kit).
- Δ colours: |Δ| ≤ 1% muted, ≤ 3% `#8a5a00`, else `#a81409`.
- **Extraction Jobs** section: New Job dialog (name, connection, schedule, groups multi-select);
  table job / connection / groups / schedule / last run / status + **Run Now** and delete.
  Run Now marks the job Running then Success and flips its tables to Extracted with a timestamp.
Checklist: SID mapping ECP/WMS/SFT/S4Q · job run updates the tables' status and Ingested On ·
group delete removes the group from any job.

### 8.3 Profiling
Legacy assessment per table: completeness, distinct values, min/max, null %, pattern outliers;
column drill-in panel. Checklist: reuse `TableViewer`'s profiling tab.

### 8.4 Pipelines — see `03-PIPELINES-DESIGNER.md`

### 8.5 Runs
Filters: object, status. Table: Run ID (mono) · Object · Iteration · Cycle/Env · Target · FMD ·
Rules · XREF · Snapshot · Source · Loaded · Variance · Status · Detail.
Detail dialog: immutable snapshot list (every version pinned at run time) + View log + Re-run.
Checklist: variance colouring as in Staging · runs are append-only.

## 9. Data Quality (`/quality`)
Tabs: **Overview · Quality Dimensions · Post-Transform Profiling · Pre-Load Checks ·
Post-Load Checks · Reconciliation · Fallout**.
- Dimensions: dimension, description, threshold, actual, result tag.
- Pre/Post-Load Checks: check id, object, description, expected, actual, result.
- Reconciliation: source vs target counts per object with variance and sign-off.
- Fallout: rejected records with reason codes, grouped by rule; export.

## 10. Cutover (`/cutover`)
Cutover plan table (task, owner, planned start/end, dependencies, status), go/no-go checklist,
freeze indicators, dress-rehearsal comparison.

## 11. Governance
- **Promotions**: artefact, from → to environment, requester, approvers (avatar chips), state,
  request/approve actions.
- **Audit Log**: timestamp, actor, action, entity, before → after; filters; export. Append-only.
- **Job Monitor**: live/queued/failed jobs with progress, elapsed, throughput; cancel/retry.

## 12. Library
- **Migration Objects**: programme-wide catalogue (same source as Scope) with where-used.
- **Field Mapping Documents**: version list per object; open in a spreadsheet-style viewer with
  sheet tabs (source / target / mapping), compare two versions, where-used, approve/reject.
- **Rules**: catalogue view of all rules across waves.
- **Golden Library**: approved reusable artefacts (FMDs, rules, XREF sets) promoted for reuse.

## 13. Connections (`/systems/connections`)
Landscape table: SID, description, type (SAP ECC / Oracle 19c / SFTP / S/4HANA), host, client,
role (Source/Target), environments, status tag (Connected / Error / Not Configured).
Add/Edit connection dialog. Also shows the staging database card (engine, host, schema, retention,
last ingestion, owner). Checklist: connection status drives the Staging Area icons.

# Data Migration Solution — Backend Data Model & API Contract (Handoff Draft)

This documents the entity model implied by the UI, for engineering to implement a real backend against. The current app is a front-end prototype with in-memory state only.

## Program hierarchy (terminology)

**Program** — the overall migration programme (e.g. "S/4HANA Migration – NA Rollout"). Was previously called Project.
**Project** — a delivery increment under a Program (e.g. "Wave 1 – Finance & MM Foundation"). Was previously called Release.
**SubProject** — the unit of work that opens the workspace (e.g. "Wave 1A – Material Master Core"). Was previously called Wave. Carries scope, criteria, FMD rows and cycles.
**Cycle** — a mock load / dress rehearsal / production pass inside a SubProject, each with its own freeze and load windows.

## Core entities

**Program** — id, code, name, description, start, end, projects[], connections[], landscape[]
**Project** — id, programId, code, name, description, start, end, subProjects[]
**SubProject** — id, projectId, code, name, freeze, cycles[], scope[], criteria[], legacyRows[], mappingRows[]
**Cycle** — id, subProjectId, name, seq, migStart, migEnd, freezeStart, freezeEnd
**SystemLandscape** — sid, description, type, host, client, role (Source|Staging|Target), envs[], status. Runs are stamped with the exact target SID + client.
**StagingDatabase** — engine, host, schema, retention, owner, lastLanding. Every source table is landed here before any object-level work.
**StagedTable** — name, sourceSystem, tier, rowsLanded, expectedRows, variancePct, loadType (Full|Delta), dqScore, landedOn, duration, snapshotId, executedBy, status, logRef. Staged tables are what selection criteria are written against.
**MigrationObject** — id, subProjectId, name, sourceTable, targetStructure (LTMOM), owner, scopeStatus, recordCount, **approach** (M_ADMC|M_ADPG|M_LSMW|M_IDOC|M_DRCT|M_MNL)
**ApproachTemplate** — code, label, stages[]. The object's stage sequence is derived from its approach, not fixed. Extraction is NOT a stage — it happens once into staging, upstream of every object.
**SelectionCriterion** — id, objectId, stagedTable, mode (Simple|Complex), field, condition, value/expression, scope
**FieldMappingDocument (FMD)** — id, objectId, rows[]: {source, target, dataType, transformRule, mandatory, defaultValue, dqRuleId, businessArea, comments}, status, version
**FieldDecision** — id, fmdId, field, businessArea, question, ownerId, impact (Blocks load|Default needed|Needs review), status. Drives the FMD business view.
**Rule** — id, name, objectId, type, severity, status, class, owners[], version, usedIn[]
**XREFSet / LegendSet** — id, name, description, values[], audit[]
**UnmappedValue** — id, mappingSetId, objectId, field, sourceValue, occurrences, proposedTarget, ownerId, status (Open|Proposed|Resolved). The functional backlog queue.
**ExecutionRun (snapshot)** — **runId**, objectId, iteration, mode (Full|Delta), cycle, env, targetSid, targetClient, approach, **fmdVersion, rulesVersion, xrefVersion, stagingSnapshotId**, startedAt, duration, triggeredBy, sourceCount, targetCount, rejectedCount, status. Immutable; this pairing is what makes rollback, audit and cross-environment comparison possible.
**StagingSnapshot** — id, subProjectId, takenAt, tables[] {name, rowCount, checksum}
**DQCheckResult** — id, objectId, runId, dimension, threshold, actualValue, pass
**FalloutRecord** — id, objectId, ruleId, recordKey, reason, ownerId, status
**ReconciliationEntry** — id, objectId, runId, sourceCount, targetCount, rejectedCount, variancePct, balanced
**CutoverTask (runbook)** — id, subProjectId, phase (Freeze|Extract|Transform|Load|Verify|Go-Live), task, ownerId, plannedStart, plannedEnd, duration, dependsOn, criticalPath (bool), status
**GoNoGoGate** — subProjectId, criteria[] {key, label, detail, pass}, decision (GO|CONDITIONAL|NO-GO), decidedBy, decidedAt, waivers[]
**ApprovalRequest** — id, area, action, requestedBy, requiredApproverRole, status, decidedBy, decidedAt
**User** — id, name, email, roles[] (Program Admin|Data Owner|Data Governance Lead|ETL Developer|ETL Lead|CAB), preferences
**PromotionRequest** — id, artifactType, objectId, fromEnv, toEnv, status, approvals[], dependencies[]

## Suggested API surface (REST)

- `GET/POST /programs/:id/projects`, `/subprojects`, `/objects`
- `GET/POST /subprojects/:id/staging/tables`, `POST /staging/land` (extract all in-scope source tables), `GET /staging/snapshots/:id`
- `GET /objects/:id/pipeline` (returns approach + derived stage sequence + per-stage state)
- `GET/POST /objects/:id/fmd`, `/fmd/decisions`, `/rules`, `/criteria`, `/lineage`
- `GET/POST /runs` — creating a run captures the full snapshot server-side; `GET /runs/:id`, `POST /runs/:id/rerun`
- `GET /objects/:id/runs` (iteration history: full vs delta, per cycle, per environment)
- `GET/POST /xref-sets`, `GET /xref-sets/:id/audit`, `GET/PATCH /unmapped-values`
- `GET/PATCH /subprojects/:id/cutover/runbook`, `GET /cutover/gate`, `POST /cutover/decision`
- `GET/POST /approvals`, `POST /approvals/:id/decide`
- `GET /users/me/work?role=` — the role-shaped My Work queue is computed server-side per role
- Table viewer: `GET /tables/:name/rows?search=&filter=&sort=&page=&pageSize=` (server-side; the client's SQL filter mode must be re-validated server-side as SELECT-only, parameterized, no DDL/DML)

## Enforcement notes for engineering

- The **stage sequence must be derived from the object's approach**. Do not hardcode Extract→Transform→Validate→Load. Extraction is a program-level staging operation, not an object stage.
- **Run snapshots are immutable.** Never update an ExecutionRun in place; a re-run creates a new runId with a new iteration number.
- RBAC must be enforced server-side per the approval workflow matrix. The UI's "Preview as role" and My Work "Acting as" controls are UX simulations only, not a security boundary.
- SQL filter feature: whitelist `SELECT` only, block multi-statement input, reject DDL/DML keywords, run against a read-replica or row-level-secured view.
- Go/No-Go gate criteria must be evaluated server-side from live data (failed runs, reconciliation variance, unmapped values, critical-path runbook tasks, pending PRD promotions) — never stored as a manual flag.

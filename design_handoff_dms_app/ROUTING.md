# Routing map

Base context: `/p/:projectId/w/:waveId` (project = programme, wave = subproject).
Query params: `?env=DEV|QSA|PRD` and `?cycle=:cycleId`.

| URL | Screen | Notes |
|---|---|---|
| `/` | Subproject picker | projects → releases → waves, "Program configuration" action |
| `/me` | My profile / preferences | dark mode, notifications |
| `/p/:p/w/:w/my-work` | My Work | role-aware task inbox |
| `/p/:p/w/:w/timeline` | Timeline | releases → waves → cycles, calendar dialog |
| `/p/:p/settings` | Program Settings | tabs: configure, users, roles, approvals, promotions |
| `/p/:p/w/:w/scope` | Scope → Overview | |
| `/p/:p/w/:w/scope/objects` | Scope → Migration Object | catalogue picker, import, wizard entry |
| `/p/:p/w/:w/scope/erd` | Scope → ERD Diagram | only when scope finalized |
| `/p/:p/w/:w/scope/fmd-map` | Scope → FMD Mapping | only when scope finalized |
| `/p/:p/w/:w/scope/wizard/:step` | Scope wizard | steps: select → dependencies → sequence → finalize |
| `/p/:p/w/:w/rules` | Rules & XREF → Overview | |
| `/p/:p/w/:w/rules/rules` | Rules | rule register, severity, status |
| `/p/:p/w/:w/rules/value-mapping` | Value Mapping (XREF) | table list + row editor |
| `/p/:p/w/:w/reference-data` | Reference Data → Overview | |
| `/p/:p/w/:w/reference-data/check-tables` | Check Tables | |
| `/p/:p/w/:w/dashboard` | Dashboard | role-specific KPIs + panels + blockers |
| `/p/:p/w/:w/migration` | Data Migration → Overview | KPIs, staging by connection, object state |
| `/p/:p/w/:w/migration/staging` | Staging Area | per-connection groups, extraction jobs |
| `/p/:p/w/:w/migration/profiling` | Profiling | legacy data assessment |
| `/p/:p/w/:w/migration/pipelines` | **Pipelines designer** | opens last-used job |
| `/p/:p/w/:w/migration/pipelines/:objectId` | Pipelines designer, object open | job / work flow / data flow |
| `/p/:p/w/:w/migration/runs` | Runs register | filters: object, status |
| `/p/:p/w/:w/migration/runs/:runId` | Run detail dialog | snapshot of versions + counts |
| `/p/:p/w/:w/quality` | Data Quality → Overview | |
| `/p/:p/w/:w/quality/dimensions` | Quality Dimensions | scorecard vs thresholds |
| `/p/:p/w/:w/quality/profile` | Post-Transform Profiling | |
| `/p/:p/w/:w/quality/pre-load` | Pre-Load Checks | |
| `/p/:p/w/:w/quality/post-load` | Post-Load Checks | |
| `/p/:p/w/:w/quality/reconciliation` | Reconciliation | source vs target counts |
| `/p/:p/w/:w/quality/fallout` | Fallout | rejected records |
| `/p/:p/w/:w/cutover` | Cutover | plan, tasks, go/no-go |
| `/p/:p/w/:w/promotions` | Promotions | DEV→QSA→PRD transports with approvals |
| `/p/:p/w/:w/audit-log` | Audit Log | immutable events |
| `/p/:p/w/:w/job-monitor` | Job Monitor | live/queued/failed jobs |
| `/library/objects` | Migration Objects catalogue | programme-wide |
| `/library/fmds` | Field Mapping Documents | versions, compare, where-used |
| `/library/rules` | Rules catalogue | |
| `/library/golden` | Golden Library | approved reusable artefacts |
| `/systems/connections` | Connections | landscape (SID, host, client, role, status) |

Modals are routes only where they are deep-linkable: run detail, FMD popout, table data viewer
(`?viewer=ECP_MARA_STG`). All other dialogs stay local state.

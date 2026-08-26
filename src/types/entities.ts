/** DMS domain types — mirror supabase/migrations/0001_init.sql */

export type UUID = string;
export type Env = 'DEV' | 'QSA' | 'PRD';
export type GovState = 'Draft' | 'In Review' | 'Approved' | 'Rejected';

/* identity */
export type RoleId =
  | 'program_admin' | 'data_owner' | 'data_governance_lead' | 'etl_lead'
  | 'etl_developer' | 'cab' | 'end_user' | 'guest';

export type ScreenKey =
  | 'myWork' | 'programSettings' | 'programAdmin' | 'preparation' | 'rules' | 'referenceData'
  | 'dashboard' | 'migration' | 'quality' | 'cutover' | 'promotions'
  | 'jobMonitor' | 'catalogObjects' | 'catalogFmds' | 'catalogRules' | 'catalogXref' | 'connections';

export interface AppUser { id: UUID; name: string; email: string; status: 'Active' | 'Invited' | 'Disabled'; lastLogin?: string }
export interface Role { id: RoleId; name: string; description?: string; isStandard: boolean }
export interface RoleScreen { roleId: RoleId; screenKey: ScreenKey; canView: boolean; canEdit: boolean }
export interface Membership { id: UUID; userId: UUID; programId: UUID; subprojectId?: UUID | null; roleId: RoleId }

/* programme: Program > Project > Subproject > Cycle */
export interface Program { id: UUID; code: string; name: string; description?: string; startDate?: string; endDate?: string }
export interface Project { id: UUID; programId: UUID; code: string; name: string; description?: string; seq: number; startDate?: string; endDate?: string }
export interface Subproject { id: UUID; projectId: UUID; code: string; name: string; description?: string; startDate?: string; endDate?: string; freezeDate?: string; scopeFinalized: boolean; seq: number }
export interface Cycle { id: UUID; subprojectId: UUID; name: string; seq: number; description?: string; migStart?: string; migEnd?: string; dataFreeze?: string }

/* catalogue */
export type ObjectCategory = 'Master data' | 'Transactional data' | 'Not classified';
export type ObjectApproachSap = 'Direct Transfer - ERP' | 'Direct Transfer - AFS' | 'Direct Transfer - EWM' | 'Staging Table' | 'Not classified';
export type ObjectClass = 'Global' | 'Local';
export interface MigrationObject {
  id: UUID; guid?: string; objectId: string; technicalName?: string; description?: string;
  category?: ObjectCategory; approach?: ObjectApproachSap; component?: string;
  class: ObjectClass; programId: UUID;
  /** SAP DMC_COBJ sender/receiver container guids — join key for a future structure/field drill-down. */
  scontainer?: string; rcontainer?: string;
  url?: string; customFieldSupport?: string; analyzeSelection?: string; invalid?: boolean;
}

/** Object deep-dive: sender/receiver structure tree (DMC_STREE + DMC_STRUCT) and field list (DMC_FIELD). */
export type DmcStructureSide = 'sender' | 'receiver';
export interface DmcStructure {
  id: UUID; migrationObjectId: UUID; side: DmcStructureSide; guid: string; structGuid: string;
  ident: string; description?: string; seq?: number; level?: number; parentGuid?: string;
  ddicName?: string; tabClass?: string; technical?: boolean;
}
export interface DmcField {
  id: UUID; structureId: UUID; fieldName: string; seq?: number; keyFlag: boolean;
  dataType?: string; length?: number; outputLength?: number; decimals?: number;
  domName?: string; rollName?: string; checkTable?: string; description?: string;
}

export interface ObjectStructure {
  id: UUID; migrationObjectId: UUID; name: string; tableName?: string; seq: number;
  fields: number; mapped: number; mandatory: boolean; owner?: string;
  status: 'Not Started' | GovState;
}
export type SubprojectApproach = 'M_ADMC' | 'M_ADPG' | 'M_LSMW' | 'M_IDOC' | 'M_DRCT' | 'M_MNL';
export interface SubprojectObject { id: UUID; subprojectId: UUID; migrationObjectId: UUID; inScope: boolean; approach?: SubprojectApproach; loadSeq?: number; owner?: string; waiverReason?: string }

/* landscape & staging */
export interface Connection {
  id: UUID; programId: UUID; sid: string; description: string;
  type: 'SAP ECC' | 'Oracle 19c' | 'SFTP' | 'S/4HANA' | string;
  host?: string; client?: string; role: 'Source' | 'Target' | 'Staging';
  envs?: string; status: 'Connected' | 'Error' | 'Not Configured';
}
export interface StagingDb { subprojectId: UUID; engine?: string; host?: string; schemaName?: string; retention?: string; owner?: string; lastIngestion?: string }
export type ExtractStatus = 'Not Extracted' | 'Extracting' | 'Extracted' | 'Failed';
export interface SourceTable {
  id: UUID; subprojectId: UUID; connectionId: UUID; name: string; tier: 'source' | 'target';
  inScope: boolean; records?: number; expected?: number; status: ExtractStatus;
  extractedOn?: string; executedBy?: string; durationS?: number; snapshot?: string;
  dqScore?: number; loadType?: 'Full' | 'Delta';
  /** generated: <SID>_<TABLE without extension, upper>_STG (null until extracted) */
  stagingTable?: string | null;
}
export interface TableGroup { id: UUID; subprojectId: UUID; connectionId: UUID; name: string; tableIds: UUID[] }
export interface ExtractionJob {
  id: UUID; subprojectId: UUID; connectionId: UUID; name: string; schedule?: string;
  status: 'Idle' | 'Running' | 'Success' | 'Failed'; lastRun?: string; groupIds: UUID[];
}
export interface SelectionCriterion {
  id: UUID; subprojectId: UUID; connectionId?: UUID; tableName: string;
  mode: 'Simple' | 'Complex'; field?: string; condition?: string; value?: string;
  scope: 'Table' | 'Cross-table';
}

/* mapping & rules */
/** No 'Historical': an uploaded legacy file is converted straight into Custom FMDs and the
 * intermediate record is never persisted, so the type had no way to exist. Lineage back to the
 * source file lives on the Custom FMD itself (histSourceName / histPlant). */
export type FmdType = 'Standard' | 'Golden' | 'Custom';
export interface Fmd {
  id: UUID; subprojectId?: UUID; migrationObjectId?: UUID; name: string; class: ObjectClass; type: FmdType; displayId?: string;
  aiGenerated?: boolean;
  /** Which source file + plant an AI-converted FMD came from — the identity re-upload matching
   * keys on, independent of the (editable) display name. */
  histSourceName?: string; histPlant?: string;
}
export interface FmdVersion {
  id: UUID; fmdId: UUID; version: string; state: GovState;
  sheets: {
    source?: Record<string, string>[]; target?: Record<string, string>[]; mapping?: Record<string, string>[];
    goldenStructure?: GoldenFmdStructure;
    /** A Standard/Custom FMD generated from the Golden FMD ("Generate FMD" on a migration object)
     * snapshots the Golden structure's columns (with each field's originating section color, so
     * the generated grid's headers stay color-coded like the Golden FMD) and one data table per
     * selected sender structure, shown as tabs — a plain excel-style grid, not the old
     * source/target/mapping sheet split. */
    generatedColumns?: GeneratedColumn[]; generatedTables?: GeneratedTable[];
    /** Legacy single-review key — read for versions reviewed before multi-review support, never
     * written now. Use readMappingReviews() rather than either key directly. */
    mappingReview?: MappingReview;
    /** Every Mapping Review run against this version, oldest first — a version can be reviewed
     * repeatedly (after fixes, or by a different reviewer) and each run is kept. */
    mappingReviews?: MappingReview[];
    /** Uncommitted edits in this draft — see FmdPendingChange. Absent on published versions. */
    pendingChanges?: FmdPendingChange[];
  };
  /** What changed to produce this version — Golden FMDs create a new version row per save
   * instead of overwriting the latest one, so this is a real per-version note, not a running log. */
  comment?: string;
  createdBy?: string; createdAt?: string; approvedBy?: string; approvedAt?: string; changedBy?: string; changedAt?: string;
  /** Unset while the version is an editable working draft; set once published, after which its
   * content is frozen (DB trigger, migration 0029). This — not `state` — is what determines
   * editability. */
  publishedBy?: string; publishedAt?: string;
}

export interface GeneratedColumn { field: string; sectionName: string; color: string; description?: string }
export interface GeneratedTable { structureId: string; structureIdent: string; structureDescription?: string; rows: Record<string, string>[] }

export interface MappingReviewFinding {
  structureId: string; structureIdent: string; rowIndex: number;
  /** The single column the AI pinned the violation on — used to highlight the exact offending
   * cell in the viewer. Absent for a batch-level failure finding (nothing to point at). */
  field?: string;
  srcField?: string; tgtField?: string; severity: 'error' | 'warning'; issue: string;
}
/** One uncommitted cell edit sitting in a draft. Edits COLLECT here rather than each producing a
 * version, and the owner chooses which to release when publishing — so a session of hundreds of
 * changes stays one draft and can be published in whatever slices make sense. */
export interface FmdPendingChange {
  id: UUID; structureId: string; structureIdent?: string;
  rowIndex: number; rowLabel: string; field: string;
  /** Value in the last PUBLISHED version — preserved across repeated edits to the same cell, so
   * the change always reads as "what everyone else currently sees" → "what it will become". */
  from: string; to: string;
  by: string; at: string;
}

export interface MappingReview {
  /** Present from the multi-review change onward; absent on reviews saved before it, which are
   * read through the legacy single-object `mappingReview` key. */
  id?: string;
  reviewedBy: string; reviewedAt: string; findings: MappingReviewFinding[];
}

/** A note/comment on one specific field mapping (structure + row identity, not a version — see
 * fmd_field_notes migration for why) — the field-level detail view's Review points panel. */
export interface FmdFieldNote {
  id: UUID; fmdId: UUID; structureId: string; rowKey: string;
  /** One of REVIEW_POINT_CATEGORIES (src/lib/reviewPointCategories.ts) — typed as string rather
   * than the union so a row written by a newer app version still deserialises instead of throwing;
   * the category helpers fall back to 'remark' for anything unrecognised. */
  tag: string;
  /** Which column of the row this is about — undefined means the point is about the whole row. */
  field?: string;
  /** Set on a reply; undefined on a top-level review point. A thread shares the parent's category
   * and resolution, so a reply's own `tag`/`resolved` are written but never read. */
  parentId?: UUID;
  body: string; resolved: boolean;
  createdBy: string; createdAt: string;
}

/** Plain parsed content of an uploaded legacy FMD file — see src/lib/parseHistoricalFile.ts. */
export interface HistoricalSheet { name: string; headers: string[]; rows: string[][] }
/** Workbook-level metadata ExcelJS exposes (not available for .csv) — captured so the AI
 * converter's initial-version comment can cite the real source file/author/dates instead of just
 * "Generated from Golden FMD vX". */
export interface HistoricalFileMeta { fileName: string; author?: string; lastModifiedBy?: string; created?: string; modified?: string }
export interface HistoricalRaw { sheets: HistoricalSheet[]; fileMeta?: HistoricalFileMeta }

/** A Golden FMD is a template *structure*, not data — the designer edits the set of fields that
 * make up the FMD, grouped into user-orderable, user-named, color-coded sections, and what each
 * field means or which values it allows — not actual source -> target row instances. */
export interface GoldenFmdFieldDef { id: string; field: string; description: string }
export interface GoldenFmdSection { id: string; name: string; color: string; fields: GoldenFmdFieldDef[] }
export interface GoldenFmdStructure { sections: GoldenFmdSection[] }
export interface Rule {
  id: UUID; subprojectId: UUID; code: string; name: string; migrationObjectId?: UUID;
  type: 'Validation' | 'Transformation' | 'Enrichment';
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  status: GovState; expression?: string; owner?: string; version?: string; class: ObjectClass;
  origin: 'Standard' | 'Custom'; displayId?: string;
}
export type XrefType = 'Standard' | 'Golden';
export interface XrefTable { id: UUID; subprojectId?: UUID; name: string; purpose?: string; class: ObjectClass; type: XrefType; displayId?: string }
/** A version snapshot of the (singleton) Golden XREF's field structure — same versioning model as
 * FmdVersion: every save is a new row, never overwritten, so past structures stay inspectable. */
export interface XrefVersion {
  id: UUID; xrefTableId: UUID; version: string; state: GovState; structure: GoldenFmdStructure;
  comment?: string; createdBy?: string; createdAt?: string;
}
/** Library-list row shape shared by the FMD/Rule/XREF catalogue screens — `reference` and
 * `latestVersion` are derived at query time (see src/lib/libraryReference.ts), not stored. */
export interface LibraryListing { class: ObjectClass; reference: string }
export interface XrefRow { id: UUID; xrefTableId: UUID; legacyValue?: string; s4Value?: string; validFrom?: string; status: 'Active' | 'Retired' }

/* ─────────────── ETL designer ─────────────── */
export type EtlObjectType = 'job' | 'workflow' | 'dataflow';
export interface EtlObject { id: UUID; subprojectId: UUID; type: EtlObjectType; name: string; parentId?: UUID | null; meta?: string }

export type EtlNodeType =
  | 'workflow' | 'dataflow' | 'script' | 'conditional' | 'whileloop' | 'trycatch'
  | 'source' | 'file' | 'query' | 'case' | 'merge' | 'validation' | 'tablecomp'
  | 'keygen' | 'mapop' | 'lookup' | 'sql' | 'cleanse' | 'match' | 'pivot' | 'target' | 'template';

export interface SchemaColumn { col: string; type: string; map?: string }
export interface ValidationRule { col: string; condition: string; action: 'Send to Fail' | 'Send to Pass' | 'Send to Both'; subst?: string }

/** Per-type payload stored in etl_nodes.data */
export type EtlNodeData = Partial<{
  ref: UUID;                       // child etl_object for workflow/dataflow nodes
  // source / target / template
  datastore: string; table: string; rows: string; where: string; joinRank: string;
  cache: string; arrayFetch: string; mode: string; deleteBefore: 'Yes' | 'No';
  bulkLoad: 'Yes' | 'No'; rowsPerCommit: string;
  errorHandling: 'Use overflow file' | 'Write to error table' | 'Stop job'; overflow: string;
  // file
  format: string; path: string; delimiter: 'Comma' | 'Semicolon' | 'Tab' | 'Pipe'; skipRows: string;
  // query
  join: string; groupBy: string; orderBy: string; distinct: 'Yes' | 'No';
  schemaIn: SchemaColumn[]; schemaOut: SchemaColumn[];
  // lookup
  lookupTable: string; condition: string; returnCol: string;
  multi: 'MAX' | 'MIN' | 'FIRST' | 'LAST'; defaultVal: string;
  // validation
  rules: ValidationRule[];
  // mapop
  normal: string; insert: string; update: string; delete: string;
  // tablecomp / keygen
  keys: string; compareCols: string; detectDeletes: 'Yes' | 'No'; method: string;
  column: string; increment: string;
  // control flow
  code: string; ifExpr: string; whileExpr: string;
  catchAction: 'Log and continue' | 'Re-raise' | 'Skip work flow';
  // misc transforms
  sqlText: string; note: string; dictionary: string; fields: string;
  criteria: string; policy: string; axis: string; header: string;
}>;

export interface EtlNode {
  id: UUID; objectId: UUID; type: EtlNodeType; name: string;
  x: number; y: number; w: number; h: number;
  refObjectId?: UUID | null; data: EtlNodeData;
}
export type EdgeCondition = '' | 'Pass' | 'Fail' | 'Then' | 'Else';
export interface EtlEdge { id: UUID; objectId: UUID; fromNode: UUID; toNode: UUID; condition: EdgeCondition }
export interface EtlGlobal { id: UUID; subprojectId: UUID; name: string; type: string; value?: string }

export interface RunOptions {
  jobServer: string; sysConfig: string; dop: number; monitorRate: number;
  recovery: boolean; stats: boolean; useStats: boolean;
  traceRow: boolean; traceTransform: boolean; traceSession: boolean; traceSql: boolean;
  globals: Record<string, string>;
}

/* execution */
export type RunStatus = 'Running' | 'Completed' | 'Completed with rejects' | 'Failed';
export interface Run {
  id: UUID; code: string; subprojectId: UUID; cycleId?: UUID; etlObjectId?: UUID;
  migrationObjectId?: UUID; iteration: number; mode?: 'Full' | 'Delta'; env?: Env;
  target?: string; approach?: string;
  fmdVersion?: string; rulesVersion?: string; xrefVersion?: string; stagingSnapshot?: string;
  startedAt?: string; durationS?: number; runBy?: string;
  srcCount: number; tgtCount: number; rejCount: number; status: RunStatus;
}
export interface RunLogEntry {
  id: number; runId: UUID; seq: number; stream: 'monitor' | 'trace' | 'error';
  objectName?: string; objectType?: string; state?: string;
  rowCount?: number; elapsedMs?: number; line?: string;
}

/* quality, cutover, governance */
export interface DqDimension { id: UUID; subprojectId: UUID; dimension: string; description?: string; threshold?: number; actual?: number }
export interface DqCheck { id: UUID; subprojectId: UUID; phase: 'pre-load' | 'post-load' | 'post-transform'; code: string; migrationObjectId?: UUID; description?: string; expected?: string; actual?: string; result?: 'Pass' | 'Warning' | 'Fail' }
export interface Reconciliation { id: UUID; runId: UUID; migrationObjectId?: UUID; srcCount: number; tgtCount: number; variance: number; signedOffBy?: string; signedOffAt?: string }
export interface FalloutRecord { id: number; runId: UUID; ruleCode?: string; keyValue?: string; reason?: string; payload?: unknown }
export interface CutoverTask { id: UUID; subprojectId: UUID; seq?: number; name: string; owner?: string; plannedStart?: string; plannedEnd?: string; dependsOn?: UUID; status: 'Not Started' | 'In Progress' | 'Done' | 'Blocked' }
export interface ApprovalMatrixEntry { id: UUID; programId: UUID; area: string; action: string; approvalRequired: boolean; approverRoleId?: RoleId }
export interface Promotion { id: UUID; subprojectId: UUID; artefactType: 'fmd' | 'rules' | 'xref' | 'etl_object'; artefactId?: UUID; artefactName?: string; fromEnv?: Env; toEnv?: Env; requestedBy?: string; requestedAt?: string; status: 'Pending' | 'Approved' | 'Rejected' | 'Promoted' }
export interface AuditEntry { id: number; programId?: UUID; subprojectId?: UUID; at: string; actor?: string; action: string; entity?: string; entityId?: string; before?: unknown; after?: unknown }

/* reference data */
export interface CheckTable { id: UUID; subprojectId: UUID; tableName: string; domain?: string; field?: string; usedBy?: string; description?: string; columns: string[] }
export interface CheckTableRow { id: UUID; checkTableId: UUID; seq: number; values: string[] }

/* artifact-aligned additions: unmapped values, AI settings, timeline admin */
export interface UnmappedValue { id: UUID; subprojectId: UUID; setName: string; migrationObjectId?: UUID; field?: string; value: string; occurrences: number; owner?: string; status: 'Open' | 'Proposed' | 'Resolved'; suggestion?: string }
export interface AiProviderKey { id: UUID; programId: UUID; provider: string; label?: string; endpoint?: string; keyMasked?: string; budget?: number; active: boolean; addedAt: string }
export interface TimelineCategory { id: UUID; programId: UUID; name: string; seq: number }
export interface TimelineEntry { id: UUID; categoryId: UUID; rowLabel: string; name: string; kind: 'point' | 'range'; icon?: string; startDate?: string; endDate?: string }

/* UI helper: node type presentation (see 03-PIPELINES-DESIGNER.md) */
export const NODE_META: Record<EtlNodeType, { icon: string; color: string; label: string }> = {
  workflow: { icon: 'git-branch', color: '#7c3aed', label: 'Work Flow' },
  dataflow: { icon: 'shuffle', color: '#1e6bb8', label: 'Data Flow' },
  script: { icon: 'terminal', color: '#334155', label: 'Script' },
  conditional: { icon: 'git-fork', color: '#b45309', label: 'Conditional' },
  whileloop: { icon: 'repeat', color: '#0f766e', label: 'While Loop' },
  trycatch: { icon: 'shield-alert', color: '#a81409', label: 'Try / Catch' },
  source: { icon: 'database', color: '#1e6bb8', label: 'Source Table' },
  file: { icon: 'file-text', color: '#1e6bb8', label: 'File Format' },
  query: { icon: 'filter', color: '#0f766e', label: 'Query' },
  case: { icon: 'split', color: '#b45309', label: 'Case' },
  merge: { icon: 'merge', color: '#0f766e', label: 'Merge' },
  validation: { icon: 'shield-check', color: '#15803d', label: 'Validation' },
  tablecomp: { icon: 'git-compare', color: '#7c3aed', label: 'Table Comparison' },
  keygen: { icon: 'key', color: '#7c3aed', label: 'Key Generation' },
  mapop: { icon: 'arrow-right-left', color: '#6b7280', label: 'Map Operation' },
  lookup: { icon: 'search', color: '#7c3aed', label: 'Lookup Ext' },
  sql: { icon: 'code', color: '#334155', label: 'SQL Transform' },
  cleanse: { icon: 'wand-2', color: '#d97706', label: 'Data Cleanse' },
  match: { icon: 'check-check', color: '#d97706', label: 'Match' },
  pivot: { icon: 'table-2', color: '#0f766e', label: 'Pivot' },
  target: { icon: 'upload', color: '#a81409', label: 'Target Table' },
  template: { icon: 'file-plus', color: '#a81409', label: 'Template Table' },
};

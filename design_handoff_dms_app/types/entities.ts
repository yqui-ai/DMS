/** DMS domain types — mirror supabase/migrations/0001_init.sql */

export type UUID = string;
export type Env = 'DEV' | 'QSA' | 'PRD';
export type GovState = 'Draft' | 'In Review' | 'Approved' | 'Rejected';

/* identity */
export type RoleId =
  | 'program_admin' | 'data_owner' | 'data_governance_lead' | 'etl_lead'
  | 'etl_developer' | 'cab' | 'end_user' | 'guest';

export type ScreenKey =
  | 'myWork' | 'timeline' | 'projectSettings' | 'preparation' | 'rules' | 'referenceData'
  | 'dashboard' | 'migration' | 'quality' | 'cutover' | 'promotions' | 'auditLog'
  | 'jobMonitor' | 'catalogObjects' | 'catalogFmds' | 'catalogRules' | 'goldenLibrary' | 'connections';

export interface AppUser { id: UUID; name: string; email: string; status: 'Active' | 'Invited' | 'Disabled'; lastLogin?: string }
export interface Role { id: RoleId; name: string; description?: string; isStandard: boolean }
export interface RoleScreen { roleId: RoleId; screenKey: ScreenKey; canView: boolean; canEdit: boolean }
export interface Membership { id: UUID; userId: UUID; projectId: UUID; waveId?: UUID | null; roleId: RoleId }

/* programme */
export interface Project { id: UUID; code: string; name: string; description?: string; startDate?: string; endDate?: string }
export interface Release { id: UUID; projectId: UUID; code: string; name: string; description?: string; seq: number; startDate?: string; endDate?: string }
export interface Wave { id: UUID; releaseId: UUID; code: string; name: string; description?: string; freezeDate?: string; scopeFinalized: boolean; seq: number }
export interface Cycle { id: UUID; waveId: UUID; name: string; seq: number; description?: string; migStart?: string; migEnd?: string; dataFreeze?: string }

/* catalogue */
export type ObjectCategory = 'Master data' | 'Transactional data' | 'Not classified';
export type ObjectApproachSap = 'Direct Transfer - ERP' | 'Direct Transfer - AFS' | 'Staging Table' | 'Not classified';
export interface MigrationObject {
  id: UUID; guid?: string; objectId: string; technicalName?: string; description?: string;
  category?: ObjectCategory; approach?: ObjectApproachSap; component?: string;
}
export interface ObjectStructure {
  id: UUID; migrationObjectId: UUID; name: string; tableName?: string; seq: number;
  fields: number; mapped: number; mandatory: boolean; owner?: string;
  status: 'Not Started' | GovState;
}
export type WaveApproach = 'M_ADMC' | 'M_ADPG' | 'M_LSMW' | 'M_MNL';
export interface WaveObject { id: UUID; waveId: UUID; migrationObjectId: UUID; inScope: boolean; approach?: WaveApproach; loadSeq?: number; owner?: string; waiverReason?: string }

/* landscape & staging */
export interface Connection {
  id: UUID; projectId: UUID; sid: string; description: string;
  type: 'SAP ECC' | 'Oracle 19c' | 'SFTP' | 'S/4HANA' | string;
  host?: string; client?: string; role: 'Source' | 'Target' | 'Staging';
  envs?: string; status: 'Connected' | 'Error' | 'Not Configured';
}
export interface StagingDb { waveId: UUID; engine?: string; host?: string; schemaName?: string; retention?: string; owner?: string; lastIngestion?: string }
export type ExtractStatus = 'Not Extracted' | 'Extracting' | 'Extracted' | 'Failed';
export interface SourceTable {
  id: UUID; waveId: UUID; connectionId: UUID; name: string; tier: 'source' | 'target';
  inScope: boolean; records?: number; expected?: number; status: ExtractStatus;
  extractedOn?: string; executedBy?: string; durationS?: number; snapshot?: string;
  dqScore?: number; loadType?: 'Full' | 'Delta';
  /** generated: <SID>_<TABLE without extension, upper>_STG (null until extracted) */
  stagingTable?: string | null;
}
export interface TableGroup { id: UUID; waveId: UUID; connectionId: UUID; name: string; tableIds: UUID[] }
export interface ExtractionJob {
  id: UUID; waveId: UUID; connectionId: UUID; name: string; schedule?: string;
  status: 'Idle' | 'Running' | 'Success' | 'Failed'; lastRun?: string; groupIds: UUID[];
}
export interface SelectionCriterion {
  id: UUID; waveId: UUID; connectionId?: UUID; tableName: string;
  mode: 'Simple' | 'Complex'; field?: string; condition?: string; value?: string;
  scope: 'Table' | 'Cross-table';
}

/* mapping & rules */
export interface Fmd { id: UUID; waveId: UUID; migrationObjectId?: UUID; name: string }
export interface FmdVersion {
  id: UUID; fmdId: UUID; version: string; state: GovState;
  sheets: { source?: Record<string, string>[]; target?: Record<string, string>[]; mapping?: Record<string, string>[] };
  createdBy?: string; createdAt?: string; approvedBy?: string; approvedAt?: string;
}
export interface Rule {
  id: UUID; waveId: UUID; code: string; name: string; migrationObjectId?: UUID;
  type: 'Validation' | 'Transformation' | 'Enrichment';
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  status: GovState; expression?: string; owner?: string; version?: string;
}
export interface XrefTable { id: UUID; waveId: UUID; name: string; purpose?: string; version?: string }
export interface XrefRow { id: UUID; xrefTableId: UUID; legacyValue?: string; s4Value?: string; validFrom?: string; status: 'Active' | 'Retired' }

/* ─────────────── ETL designer ─────────────── */
export type EtlObjectType = 'job' | 'workflow' | 'dataflow';
export interface EtlObject { id: UUID; waveId: UUID; type: EtlObjectType; name: string; parentId?: UUID | null; meta?: string }

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
export interface EtlGlobal { id: UUID; waveId: UUID; name: string; type: string; value?: string }

export interface RunOptions {
  jobServer: string; sysConfig: string; dop: number; monitorRate: number;
  recovery: boolean; stats: boolean; useStats: boolean;
  traceRow: boolean; traceTransform: boolean; traceSession: boolean; traceSql: boolean;
  globals: Record<string, string>;
}

/* execution */
export type RunStatus = 'Running' | 'Completed' | 'Completed with rejects' | 'Failed';
export interface Run {
  id: UUID; code: string; waveId: UUID; cycleId?: UUID; etlObjectId?: UUID;
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
export interface DqDimension { id: UUID; waveId: UUID; dimension: string; description?: string; threshold?: number; actual?: number }
export interface DqCheck { id: UUID; waveId: UUID; phase: 'pre-load' | 'post-load' | 'post-transform'; code: string; migrationObjectId?: UUID; description?: string; expected?: string; actual?: string; result?: 'Pass' | 'Warning' | 'Fail' }
export interface Reconciliation { id: UUID; runId: UUID; migrationObjectId?: UUID; srcCount: number; tgtCount: number; variance: number; signedOffBy?: string; signedOffAt?: string }
export interface FalloutRecord { id: number; runId: UUID; ruleCode?: string; keyValue?: string; reason?: string; payload?: unknown }
export interface CutoverTask { id: UUID; waveId: UUID; seq?: number; name: string; owner?: string; plannedStart?: string; plannedEnd?: string; dependsOn?: UUID; status: 'Not Started' | 'In Progress' | 'Done' | 'Blocked' }
export interface ApprovalMatrixEntry { id: UUID; projectId: UUID; area: string; action: string; approvalRequired: boolean; approverRoleId?: RoleId }
export interface Promotion { id: UUID; waveId: UUID; artefactType: 'fmd' | 'rules' | 'xref' | 'etl_object'; artefactId?: UUID; artefactName?: string; fromEnv?: Env; toEnv?: Env; requestedBy?: string; requestedAt?: string; status: 'Pending' | 'Approved' | 'Rejected' | 'Promoted' }
export interface AuditEntry { id: number; projectId?: UUID; waveId?: UUID; at: string; actor?: string; action: string; entity?: string; entityId?: string; before?: unknown; after?: unknown }

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

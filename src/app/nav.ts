import type { ScreenKey } from '../types/entities';

export interface NavItem { key: ScreenKey; label: string; icon: string; to: string }
export interface NavGroup { title: string; items: NavItem[] }

/** Exact nav structure from the prototype. `to` is relative to /p/:projectId/w/:waveId */
export const NAV_GROUPS: NavGroup[] = [
  { title: 'MY WORK', items: [{ key: 'myWork', label: 'My Work', icon: 'inbox', to: 'my-work' }] },
  { title: 'PROJECT', items: [
    { key: 'timeline', label: 'Timeline', icon: 'calendar-range', to: 'timeline' },
    { key: 'projectSettings', label: 'Program Settings', icon: 'settings', to: '../../settings' },
  ]},
  { title: 'DESIGN', items: [
    { key: 'preparation', label: 'Scope', icon: 'layers', to: 'scope' },
    { key: 'rules', label: 'Rules & XREF', icon: 'shield-check', to: 'rules' },
    { key: 'referenceData', label: 'Reference Data', icon: 'book-open', to: 'reference-data' },
  ]},
  { title: 'EXECUTION', items: [
    { key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', to: 'dashboard' },
    { key: 'migration', label: 'Data Migration', icon: 'shuffle', to: 'migration' },
    { key: 'quality', label: 'Data Quality', icon: 'shield-check', to: 'quality' },
    { key: 'cutover', label: 'Cutover', icon: 'flag', to: 'cutover' },
  ]},
  { title: 'GOVERNANCE', items: [
    { key: 'promotions', label: 'Promotions', icon: 'arrow-up-right', to: 'promotions' },
    { key: 'auditLog', label: 'Audit Log', icon: 'history', to: 'audit-log' },
    { key: 'jobMonitor', label: 'Job Monitor', icon: 'activity', to: 'job-monitor' },
  ]},
  { title: 'LIBRARY', items: [
    { key: 'catalogObjects', label: 'Migration Objects', icon: 'database', to: '/library/objects' },
    { key: 'catalogFmds', label: 'Field Mapping Documents', icon: 'files', to: '/library/fmds' },
    { key: 'catalogRules', label: 'Rules', icon: 'list-checks', to: '/library/rules' },
    { key: 'goldenLibrary', label: 'Golden Library', icon: 'gem', to: '/library/golden' },
  ]},
  { title: 'SYSTEMS', items: [{ key: 'connections', label: 'Connections', icon: 'plug', to: '/systems/connections' }] },
];

export const MIGRATION_TABS = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard', to: '' },
  { key: 'staging', label: 'Staging Area', icon: 'database', to: 'staging' },
  { key: 'profiling', label: 'Profiling', icon: 'search', to: 'profiling' },
  { key: 'pipeline', label: 'Pipelines', icon: 'shuffle', to: 'pipelines' },
  { key: 'runs', label: 'Runs', icon: 'history', to: 'runs' },
];

import type { ScreenKey } from '../types/entities';

export interface NavItem { key: ScreenKey; label: string; icon: string; to: string }
export interface NavGroup { title: string; items: NavItem[] }

/** Nav structure — realigned to match the current prototype (artifact-sourced; Timeline lives on
 * the Dashboard, Audit Log isn't modeled). `to` is relative to /pg/:programId/sp/:subprojectId */
export const NAV_GROUPS: NavGroup[] = [
  { title: 'MY WORK', items: [{ key: 'myWork', label: 'My Work', icon: 'inbox', to: 'my-work' }] },
  { title: 'PROJECT', items: [
    { key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', to: 'dashboard' },
    { key: 'programSettings', label: 'Program Settings', icon: 'settings', to: '../../settings' },
  ]},
  { title: 'DESIGN', items: [
    { key: 'preparation', label: 'Scope', icon: 'layers', to: 'scope' },
    { key: 'rules', label: 'Rules & XREF', icon: 'shield-check', to: 'rules' },
    { key: 'referenceData', label: 'Reference Data', icon: 'book-open', to: 'reference-data' },
  ]},
  { title: 'EXECUTION', items: [
    { key: 'migration', label: 'Data Migration', icon: 'shuffle', to: 'migration' },
    { key: 'quality', label: 'Data Quality', icon: 'shield-check', to: 'quality' },
    { key: 'cutover', label: 'Cutover', icon: 'flag', to: 'cutover' },
  ]},
  { title: 'GOVERNANCE', items: [
    { key: 'promotions', label: 'Promotions', icon: 'arrow-up-right', to: 'promotions' },
    { key: 'jobMonitor', label: 'Job Monitor', icon: 'activity', to: 'job-monitor' },
  ]},
  { title: 'LIBRARY', items: [
    { key: 'catalogObjects', label: 'Migration Object', icon: 'database', to: '/library/objects' },
    { key: 'catalogFmds', label: 'Field Mapping', icon: 'files', to: '/library/fmds' },
    { key: 'catalogRules', label: 'Rule', icon: 'list-checks', to: '/library/rules' },
    { key: 'catalogGolden', label: 'Golden Library', icon: 'star', to: '/library/golden' },
  ]},
  { title: 'SYSTEMS', items: [{ key: 'connections', label: 'Connections', icon: 'plug', to: '/systems/connections' }] },
];

export const MIGRATION_TABS = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard', to: '' },
  { key: 'staging', label: 'Staging Area', icon: 'database', to: 'staging' },
  { key: 'profiling', label: 'Profiling', icon: 'search', to: 'profiling' },
  { key: 'pipeline', label: 'Pipeline', icon: 'shuffle', to: 'pipeline' },
  { key: 'runs', label: 'Runs', icon: 'history', to: 'runs' },
];

import type { ScreenKey } from '../types/entities';

export interface NavItem {
  key: ScreenKey; label: string; icon: string; to: string;
  /** Fallback used when there's no full /pg/:programId/sp/:subprojectId in the URL (e.g. the
   * subproject picker, or a program open with no subproject chosen yet) — a function since some
   * fallbacks (Library) need no params at all while others (Program Admin) still need :programId.
   * Returning undefined hides the item entirely when neither the nested path nor the fallback can
   * be resolved. The sidebar always prefers the nested path when a project is fully open, so
   * these items never kick the user out of their current project context. */
  standalone?: (programId?: string) => string | undefined;
}
export interface NavGroup { title: string; items: NavItem[] }

/** Nav structure — realigned to match the current prototype (artifact-sourced; Timeline lives on
 * the Dashboard, Audit Log isn't modeled). `to` is relative to /pg/:programId/sp/:subprojectId */
export const NAV_GROUPS: NavGroup[] = [
  { title: 'MY WORK', items: [{ key: 'myWork', label: 'My Work', icon: 'inbox', to: 'my-work' }] },
  { title: 'PROJECT', items: [
    { key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', to: 'dashboard' },
    { key: 'programSettings', label: 'Program Settings', icon: 'settings', to: '../../settings' },
    { key: 'programAdmin', label: 'Program Admin', icon: 'shield-check', to: 'admin', standalone: (programId) => programId ? `/pg/${programId}/admin` : undefined },
  ]},
  { title: 'DESIGN', items: [
    { key: 'preparation', label: 'Scope', icon: 'layers', to: 'scope' },
    { key: 'rules', label: 'Rules & XREF', icon: 'scale', to: 'rules' },
    { key: 'referenceData', label: 'Reference Data', icon: 'book-open', to: 'reference-data' },
  ]},
  // EXECUTION and GOVERNANCE are out of the nav while Design > Scope is finished first. Their
  // screens, routes and queries all still exist and are NOT dead code — see the deferred-scope
  // skill for what each section held and how to bring it back.
  { title: 'LIBRARY', items: [
    { key: 'catalogObjects', label: 'Migration Object', icon: 'database', to: 'library/objects', standalone: () => '/library/objects' },
    { key: 'catalogFmds', label: 'Field Mapping', icon: 'files', to: 'library/fmds', standalone: () => '/library/fmds' },
    { key: 'catalogRules', label: 'Rule', icon: 'list-checks', to: 'library/rules', standalone: () => '/library/rules' },
    { key: 'catalogXref', label: 'Cross Reference (XREF)', icon: 'arrow-left-right', to: 'library/xref', standalone: () => '/library/xref' },
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

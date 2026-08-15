import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { TabbedSection } from './layout/TabbedSection';
import { ScreenGate } from './layout/ScreenGate';
import { Placeholder } from '../components/Placeholder';
import { MIGRATION_TABS } from './nav';
import type { TabStripItem } from './layout/TabStrip';

const SCOPE_TABS: TabStripItem[] = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard', to: '' },
  { key: 'objects', label: 'Migration Object', icon: 'database', to: 'objects' },
  { key: 'erd', label: 'ERD Diagram', icon: 'git-fork', to: 'erd' },
  { key: 'fmd-map', label: 'FMD Mapping', icon: 'files', to: 'fmd-map' },
];

const RULES_TABS: TabStripItem[] = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard', to: '' },
  { key: 'rules', label: 'Rules', icon: 'list-checks', to: 'rules' },
  { key: 'value-mapping', label: 'Value Mapping (XREF)', icon: 'shuffle', to: 'value-mapping' },
];

const REFERENCE_DATA_TABS: TabStripItem[] = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard', to: '' },
  { key: 'check-tables', label: 'Check Tables', icon: 'table-2', to: 'check-tables' },
];

const QUALITY_TABS: TabStripItem[] = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard', to: '' },
  { key: 'dimensions', label: 'Quality Dimensions', icon: 'shield-check', to: 'dimensions' },
  { key: 'profile', label: 'Post-Transform Profiling', icon: 'search', to: 'profile' },
  { key: 'pre-load', label: 'Pre-Load Checks', icon: 'list-checks', to: 'pre-load' },
  { key: 'post-load', label: 'Post-Load Checks', icon: 'list-checks', to: 'post-load' },
  { key: 'reconciliation', label: 'Reconciliation', icon: 'git-compare', to: 'reconciliation' },
  { key: 'fallout', label: 'Fallout', icon: 'alert-triangle', to: 'fallout' },
];

const gated = (screen: Parameters<typeof ScreenGate>[0]['screen'], title: string, description?: string) => (
  <ScreenGate screen={screen}><Placeholder title={title} description={description} /></ScreenGate>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Placeholder title="Subproject picker" description="Projects → releases → waves." /> },
      { path: 'me', element: <Placeholder title="My profile" description="Dark mode, notification preferences." /> },
      {
        path: 'p/:projectId',
        children: [
          { path: 'settings', element: gated('projectSettings', 'Program Settings', 'Configure, users, roles, approvals, promotions.') },
          {
            path: 'w/:waveId',
            children: [
              { path: 'my-work', element: gated('myWork', 'My Work', 'Role-aware task inbox.') },
              { path: 'timeline', element: gated('timeline', 'Timeline', 'Releases → waves → cycles.') },
              { path: 'dashboard', element: gated('dashboard', 'Dashboard', 'Role-specific KPIs, panels and blockers.') },
              {
                path: 'scope',
                element: <TabbedSection screen="preparation" title="Scope" tabs={SCOPE_TABS} segment="scope" />,
                children: [
                  { index: true, element: <Placeholder title="Scope overview" /> },
                  { path: 'objects', element: <Placeholder title="Migration Object" description="Catalogue picker, import, wizard entry." /> },
                  { path: 'erd', element: <Placeholder title="ERD Diagram" /> },
                  { path: 'fmd-map', element: <Placeholder title="FMD Mapping" /> },
                ],
              },
              { path: 'scope/wizard/:step', element: gated('preparation', 'Scope wizard', 'select → dependencies → sequence → finalize') },
              {
                path: 'rules',
                element: <TabbedSection screen="rules" title="Rules & XREF" tabs={RULES_TABS} segment="rules" />,
                children: [
                  { index: true, element: <Placeholder title="Rules & XREF overview" /> },
                  { path: 'rules', element: <Placeholder title="Rules" description="Rule register, severity, status." /> },
                  { path: 'value-mapping', element: <Placeholder title="Value Mapping (XREF)" description="Table list + row editor." /> },
                ],
              },
              {
                path: 'reference-data',
                element: <TabbedSection screen="referenceData" title="Reference Data" tabs={REFERENCE_DATA_TABS} segment="reference-data" />,
                children: [
                  { index: true, element: <Placeholder title="Reference Data overview" /> },
                  { path: 'check-tables', element: <Placeholder title="Check Tables" /> },
                ],
              },
              {
                path: 'migration',
                element: <TabbedSection screen="migration" title="Data Migration" tabs={MIGRATION_TABS as TabStripItem[]} segment="migration" />,
                children: [
                  { index: true, element: <Placeholder title="Data Migration overview" description="KPIs, staging by connection, object state." /> },
                  { path: 'staging', element: <Placeholder title="Staging Area" description="Per-connection groups, extraction jobs." /> },
                  { path: 'profiling', element: <Placeholder title="Profiling" description="Legacy data assessment." /> },
                  { path: 'pipelines', element: <Placeholder title="Pipelines designer" description="Opens last-used job." /> },
                  { path: 'pipelines/:objectId', element: <Placeholder title="Pipelines designer" description="Job / work flow / data flow." /> },
                  { path: 'runs', element: <Placeholder title="Runs register" description="Filters: object, status." /> },
                  { path: 'runs/:runId', element: <Placeholder title="Run detail" description="Snapshot of versions + counts." /> },
                ],
              },
              {
                path: 'quality',
                element: <TabbedSection screen="quality" title="Data Quality" tabs={QUALITY_TABS} segment="quality" />,
                children: [
                  { index: true, element: <Placeholder title="Data Quality overview" /> },
                  { path: 'dimensions', element: <Placeholder title="Quality Dimensions" description="Scorecard vs thresholds." /> },
                  { path: 'profile', element: <Placeholder title="Post-Transform Profiling" /> },
                  { path: 'pre-load', element: <Placeholder title="Pre-Load Checks" /> },
                  { path: 'post-load', element: <Placeholder title="Post-Load Checks" /> },
                  { path: 'reconciliation', element: <Placeholder title="Reconciliation" description="Source vs target counts." /> },
                  { path: 'fallout', element: <Placeholder title="Fallout" description="Rejected records." /> },
                ],
              },
              { path: 'cutover', element: gated('cutover', 'Cutover', 'Plan, tasks, go/no-go.') },
              { path: 'promotions', element: gated('promotions', 'Promotions', 'DEV → QSA → PRD transports with approvals.') },
              { path: 'audit-log', element: gated('auditLog', 'Audit Log', 'Immutable events.') },
              { path: 'job-monitor', element: gated('jobMonitor', 'Job Monitor', 'Live/queued/failed jobs.') },
            ],
          },
        ],
      },
      { path: 'library/objects', element: gated('catalogObjects', 'Migration Objects', 'Programme-wide catalogue.') },
      { path: 'library/fmds', element: gated('catalogFmds', 'Field Mapping Documents', 'Versions, compare, where-used.') },
      { path: 'library/rules', element: gated('catalogRules', 'Rules catalogue') },
      { path: 'library/golden', element: gated('goldenLibrary', 'Golden Library', 'Approved reusable artefacts.') },
      { path: 'systems/connections', element: gated('connections', 'Connections', 'Landscape (SID, host, client, role, status).') },
      { path: '*', element: <Placeholder title="Page not found" description="Nothing lives at this address." /> },
    ],
  },
]);

import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { TabbedSection } from './layout/TabbedSection';
import { ScreenGate } from './layout/ScreenGate';
import { Placeholder } from '../components/Placeholder';
import { MIGRATION_TABS } from './nav';
import type { TabStripItem } from './layout/TabStrip';
import { SubprojectPicker } from '../features/programme/SubprojectPicker';
import { ProgramSettingsPage } from '../features/programme/ProgramSettingsPage';
import { ProgramAdminPage } from '../features/programme/ProgramAdminPage';
import { MigrationObjectCatalogue } from '../features/scope/MigrationObjectCatalogue';
import { ScopeOverview } from '../features/scope/ScopeOverview';
import { ScopeCriteria } from '../features/scope/ScopeCriteria';
import { ScopeSequence } from '../features/scope/ScopeSequence';
import { FmdMapping } from '../features/scope/FmdMapping';
import { RulesOverview } from '../features/rules/RulesOverview';
import { RulesRegister } from '../features/rules/RulesRegister';
import { ValueMapping } from '../features/rules/ValueMapping';
import { UnmappedValues } from '../features/rules/UnmappedValues';
import { ConnectionsPage } from '../features/connections/ConnectionsPage';
import { CutoverPage } from '../features/cutover/CutoverPage';
import { RunsRegister } from '../features/runs/RunsRegister';
import { RunDetailModal } from '../features/runs/RunDetailModal';
import { StagingArea } from '../features/staging/StagingArea';
import { MigrationOverview } from '../features/staging/MigrationOverview';
import { ProfilingPage } from '../features/staging/ProfilingPage';
import { PipelineStages } from '../features/staging/PipelineStages';
import { PromotionsPage } from '../features/governance/PromotionsPage';
import { JobMonitorPage } from '../features/governance/JobMonitorPage';
import { LibraryObjects } from '../features/library/LibraryObjects';
import { LibraryRules } from '../features/library/LibraryRules';
import { LibraryFmds } from '../features/library/LibraryFmds';
import { LibraryXref } from '../features/library/LibraryXref';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { MyProfilePage } from '../features/profile/MyProfilePage';
import { MyWorkPage } from '../features/mywork/MyWorkPage';
import { QualityOverview } from '../features/quality/QualityOverview';
import { QualityDimensions } from '../features/quality/QualityDimensions';
import { DqChecksPhase } from '../features/quality/DqChecksPhase';
import { ReconciliationPage } from '../features/quality/ReconciliationPage';
import { FalloutPage } from '../features/quality/FalloutPage';
import { ReferenceDataOverview } from '../features/referenceData/ReferenceDataOverview';
import { CheckTablesPage } from '../features/referenceData/CheckTablesPage';

const SCOPE_TABS: TabStripItem[] = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard', to: '' },
  { key: 'objects', label: 'Migration Object', icon: 'database', to: 'objects' },
  { key: 'criteria', label: 'Criteria', icon: 'filter', to: 'criteria' },
  { key: 'fmd', label: 'FMD', icon: 'files', to: 'fmd' },
  { key: 'sequence', label: 'Sequence', icon: 'list-ordered', to: 'sequence' },
];

const RULES_TABS: TabStripItem[] = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard', to: '' },
  { key: 'rules', label: 'Rules', icon: 'list-checks', to: 'rules' },
  { key: 'value-mapping', label: 'Value Mapping (XREF)', icon: 'shuffle', to: 'value-mapping' },
  { key: 'unmapped', label: 'Unmapped Values', icon: 'circle-help', to: 'unmapped' },
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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <SubprojectPicker /> },
      { path: 'me', element: <MyProfilePage /> },
      {
        path: 'pg/:programId',
        children: [
          { path: 'settings', element: <ScreenGate screen="programSettings"><ProgramSettingsPage /></ScreenGate> },
          { path: 'admin', element: <ScreenGate screen="programAdmin"><ProgramAdminPage /></ScreenGate> },
          {
            path: 'sp/:subprojectId',
            children: [
              { path: 'my-work', element: <ScreenGate screen="myWork"><MyWorkPage /></ScreenGate> },
              { path: 'dashboard', element: <ScreenGate screen="dashboard"><DashboardPage /></ScreenGate> },
              {
                path: 'scope',
                element: <TabbedSection screen="preparation" title="Scope" tabs={SCOPE_TABS} segment="scope" />,
                children: [
                  { index: true, element: <ScopeOverview /> },
                  { path: 'objects', element: <MigrationObjectCatalogue /> },
                  { path: 'criteria', element: <ScopeCriteria /> },
                  { path: 'fmd', element: <FmdMapping /> },
                  { path: 'sequence', element: <ScopeSequence /> },
                ],
              },
              {
                path: 'rules',
                element: <TabbedSection screen="rules" title="Rules & XREF" tabs={RULES_TABS} segment="rules" />,
                children: [
                  { index: true, element: <RulesOverview /> },
                  { path: 'rules', element: <RulesRegister /> },
                  { path: 'value-mapping', element: <ValueMapping /> },
                  { path: 'unmapped', element: <UnmappedValues /> },
                ],
              },
              {
                path: 'reference-data',
                element: <TabbedSection screen="referenceData" title="Reference Data" tabs={REFERENCE_DATA_TABS} segment="reference-data" />,
                children: [
                  { index: true, element: <ReferenceDataOverview /> },
                  { path: 'check-tables', element: <CheckTablesPage /> },
                ],
              },
              {
                path: 'migration',
                element: <TabbedSection screen="migration" title="Data Migration" tabs={MIGRATION_TABS as TabStripItem[]} segment="migration" />,
                children: [
                  { index: true, element: <MigrationOverview /> },
                  { path: 'staging', element: <StagingArea /> },
                  { path: 'profiling', element: <ProfilingPage /> },
                  { path: 'pipeline', element: <PipelineStages /> },
                  {
                    path: 'runs', element: <RunsRegister />,
                    children: [{ path: ':runId', element: <RunDetailModal /> }],
                  },
                ],
              },
              {
                path: 'quality',
                element: <TabbedSection screen="quality" title="Data Quality" tabs={QUALITY_TABS} segment="quality" />,
                children: [
                  { index: true, element: <QualityOverview /> },
                  { path: 'dimensions', element: <QualityDimensions /> },
                  { path: 'profile', element: <DqChecksPhase phase="post-transform" emptyLabel="No post-transform profiling yet" /> },
                  { path: 'pre-load', element: <DqChecksPhase phase="pre-load" emptyLabel="No pre-load checks yet" /> },
                  { path: 'post-load', element: <DqChecksPhase phase="post-load" emptyLabel="No post-load checks yet" /> },
                  { path: 'reconciliation', element: <ReconciliationPage /> },
                  { path: 'fallout', element: <FalloutPage /> },
                ],
              },
              { path: 'cutover', element: <ScreenGate screen="cutover"><CutoverPage /></ScreenGate> },
              { path: 'promotions', element: <ScreenGate screen="promotions"><PromotionsPage /></ScreenGate> },
              { path: 'job-monitor', element: <ScreenGate screen="jobMonitor"><JobMonitorPage /></ScreenGate> },
              {
                path: 'library',
                // Same Library screens as the standalone /library/* routes — program-wide
                // content (global and local alike), just reachable without leaving the
                // current project's URL/breadcrumb/nav context.
                children: [
                  { path: 'objects', element: <ScreenGate screen="catalogObjects"><LibraryObjects /></ScreenGate> },
                  { path: 'fmds', element: <ScreenGate screen="catalogFmds"><LibraryFmds /></ScreenGate> },
                  { path: 'rules', element: <ScreenGate screen="catalogRules"><LibraryRules /></ScreenGate> },
                  { path: 'xref', element: <ScreenGate screen="catalogXref"><LibraryXref /></ScreenGate> },
                ],
              },
              // Same page as the standalone /pg/:programId/admin route — program-wide
              // administration, reachable without leaving the current project's context.
              { path: 'admin', element: <ScreenGate screen="programAdmin"><ProgramAdminPage /></ScreenGate> },
            ],
          },
        ],
      },
      { path: 'library/objects', element: <ScreenGate screen="catalogObjects"><LibraryObjects /></ScreenGate> },
      { path: 'library/fmds', element: <ScreenGate screen="catalogFmds"><LibraryFmds /></ScreenGate> },
      { path: 'library/rules', element: <ScreenGate screen="catalogRules"><LibraryRules /></ScreenGate> },
      { path: 'library/xref', element: <ScreenGate screen="catalogXref"><LibraryXref /></ScreenGate> },
      { path: 'systems/connections', element: <ScreenGate screen="connections"><ConnectionsPage /></ScreenGate> },
      { path: '*', element: <Placeholder title="Page not found" description="Nothing lives at this address." /> },
    ],
  },
]);

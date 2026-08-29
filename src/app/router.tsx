import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppShell, LaunchpadShell } from './layout/AppShell';
import { LaunchpadPage } from '../features/launchpad/LaunchpadPage';
import { AdministrationPage } from '../features/launchpad/AdministrationPage';
import { MigrationStatusPage } from '../features/launchpad/MigrationStatusPage';
import { ArchiveApprovalsPage } from '../features/launchpad/ArchiveApprovalsPage';
import { ChangeLogPage } from '../features/launchpad/ChangeLogPage';
import { ArchivePage } from '../features/launchpad/ArchivePage';
import { TabbedSection } from './layout/TabbedSection';
import { ScreenGate } from './layout/ScreenGate';
import { Placeholder } from '../components/Placeholder';
import { MIGRATION_TABS } from './nav';
import type { TabStripItem } from './layout/TabStrip';
import { HierarchyPage } from '../features/programme/HierarchyPage';
import { ProgramSettingsPage } from '../features/programme/ProgramSettingsPage';
import { ProgramAdminPage } from '../features/programme/ProgramAdminPage';
import { ScopeErd } from '../features/scope/ScopeErd';
import { ScopeRegister } from '../features/scope/ScopeRegister';
import { ScopeWizard } from '../features/scope/ScopeWizard';
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
import { LibraryHome } from '../features/library/LibraryHome';
import { LibraryObjects } from '../features/library/LibraryObjects';
import { LibraryRules } from '../features/library/LibraryRules';
import { LibraryFmds } from '../features/library/LibraryFmds';
import { LibraryXref } from '../features/library/LibraryXref';
import { FmdRoute, ObjectRoute, XrefRoute } from '../features/library/LibraryDeepViews';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { SearchPage } from '../features/search/SearchPage';
import { MyProfilePage } from '../features/profile/MyProfilePage';
import { MyWorkPage } from '../features/mywork/MyWorkPage';
import { QualityOverview } from '../features/quality/QualityOverview';
import { QualityDimensions } from '../features/quality/QualityDimensions';
import { DqChecksPhase } from '../features/quality/DqChecksPhase';
import { ReconciliationPage } from '../features/quality/ReconciliationPage';
import { FalloutPage } from '../features/quality/FalloutPage';
import { ReferenceDataOverview } from '../features/referenceData/ReferenceDataOverview';
import { CheckTablesPage } from '../features/referenceData/CheckTablesPage';

/** Design > Scope's tabs. Starred appear only after the scope is finalized.
 *
 * Overview and Migration Object were removed — they were the old design and are being rebuilt from
 * scratch. Note this is Design > Scope's object list, NOT Library > Migration Object
 * (`LibraryObjects`), which is a different, program-wide screen and stays exactly as it is. */
// Scope Register is NOT gated on `scopeFinalized`. The other two tabs describe a scope that has
// been agreed, but "which objects are we migrating, and who owns each" is a question people ask
// from the first day of scoping — and it is where the consultant and ETL developer get assigned,
// which has to be possible before finalizing rather than after.
const SCOPE_TABS: TabStripItem[] = [
  { key: 'register', label: 'Scope Register', icon: 'list-checks', to: 'register' },
  { key: 'erd', label: 'ERD Diagram', icon: 'workflow', to: 'erd', requires: 'scopeFinalized' },
  // FMD Mapping was merged INTO Scope Register. The two tabs listed the same objects with two
  // different subsets of their columns, so "who owns this and does it have a mapping" meant
  // switching tabs and re-finding the row. One list, one row per object.
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

/** The Library's four screens plus their deep views, defined once and mounted twice — at
 * `/library/*` and again under `pg/:programId/sp/:subprojectId/library/*`. Both mounts must stay
 * identical, which is exactly what a shared array guarantees and a copy-pasted list doesn't.
 *
 * Each deep view is a child route rather than dialog state on the list, so it has an address:
 * Back closes it and returns to the list, and a single FMD can be linked to. Rule has no detail
 * view (see the `library-section-design` skill) so it has no child. */
const LIBRARY_ROUTES: RouteObject[] = [
  // Bare /library is the Library's front door — four tiles, one per catalogue. It used to
  // redirect straight to Migration Object, which meant 'Library' as a place did not exist.
  { index: true, element: <LibraryHome /> },
  {
    path: 'objects',
    element: <ScreenGate screen="catalogObjects"><LibraryObjects /></ScreenGate>,
    children: [{ path: ':objectId', element: <ObjectRoute /> }],
  },
  {
    path: 'fmds',
    element: <ScreenGate screen="catalogFmds"><LibraryFmds /></ScreenGate>,
    children: [{ path: ':fmdId', element: <FmdRoute /> }],
  },
  { path: 'rules', element: <ScreenGate screen="catalogRules"><LibraryRules /></ScreenGate> },
  {
    path: 'xref',
    element: <ScreenGate screen="catalogXref"><LibraryXref /></ScreenGate>,
    children: [{ path: ':xrefId', element: <XrefRoute /> }],
  },
];

export const router = createBrowserRouter([
  // Above the program level: the launchpad and the three areas it opens onto. A pathless layout
  // route, so these share the launchpad chrome (header only) without nesting under a path segment.
  {
    element: <LaunchpadShell />,
    children: [
      { path: '/', element: <LaunchpadPage /> },
      { path: '/admin', element: <AdministrationPage /> },
      { path: '/projects', element: <HierarchyPage /> },
      { path: '/status', element: <MigrationStatusPage /> },
      // Not a tile: approvals are a queue you are sent to, not an area you choose to work in.
      // Reached from the app switcher and from the banner on Migration Project.
      { path: '/approvals', element: <ArchiveApprovalsPage /> },
      { path: '/archive', element: <ArchivePage /> },
      { path: '/changes', element: <ChangeLogPage /> },
      // The Library and Connections OUTSIDE a subproject live here, not in AppShell. The sidebar
      // navigates within a subproject; with none open it could only show the two groups that have
      // standalone fallbacks, so it rendered as a half-empty rail of unrelated links. Their nested
      // mounts under sp/:subprojectId keep the sidebar, which is correct — you are inside a
      // subproject there.
      { path: '/library', children: LIBRARY_ROUTES },
      { path: '/systems/connections', element: <ScreenGate screen="connections"><ConnectionsPage /></ScreenGate> },
      { path: '/me', element: <MyProfilePage /> },
    ],
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      // Program-wide like the Library routes: results span every subproject the user can reach,
      // so the page is not nested under one.
      { path: 'search', element: <SearchPage /> },
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
                element: (
                  <TabbedSection
                    screen="preparation" title="Scope" segment="scope" tabs={SCOPE_TABS}
                    description="Choose what this subproject migrates, map it to SAP standard objects, then work through dependencies and load order."
                  />
                ),
                children: [
                  // The section lands on the ANSWER — what is in scope — not on the tool that
                  // produces it. An empty register carries the button that starts the builder, so
                  // a fresh subproject still has one obvious next action.
                  { index: true, element: <Navigate to="register" replace /> },
                  { path: 'register', element: <ScopeRegister /> },
                  { path: 'erd', element: <ScopeErd /> },
                ],
              },
              // The builder is a SIBLING of the tabbed section, not a child of it.
              //
              // Nested, it rendered the page header and the tab strip above its own six-step strip:
              // two navigation systems stacked, the tab strip showing nothing selected because the
              // builder is not one of its tabs. That is what made Scope read as messy — not the
              // number of steps, but two competing answers to "where am I".
              //
              // As a focused flow it owns the whole area, shows one navigation, and has an explicit
              // way out back to the register.
              { path: 'scope/build', element: <Navigate to="objects" replace /> },
              { path: 'scope/build/:step', element: <ScreenGate screen="preparation"><ScopeWizard /></ScreenGate> },
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
                children: LIBRARY_ROUTES,
              },
              // The same pages as their standalone routes, mounted again under the open project so
              // reaching them does not throw you out of it. Program Admin already worked this way;
              // Settings walked up the URL (`../../settings`) and Connections was absolute
              // (`/systems/connections`), and both dropped the subproject on the way.
              //
              // They are still PROGRAM-scoped screens — a program's settings, a program's
              // connections. What is preserved here is the URL context: the sidebar, breadcrumb and
              // subproject switcher all keep working, and Back returns to where you were.
              { path: 'admin', element: <ScreenGate screen="programAdmin"><ProgramAdminPage /></ScreenGate> },
              { path: 'settings', element: <ScreenGate screen="programSettings"><ProgramSettingsPage /></ScreenGate> },
              { path: 'connections', element: <ScreenGate screen="connections"><ConnectionsPage /></ScreenGate> },
            ],
          },
        ],
      },
      { path: '*', element: <Placeholder title="Page not found" description="Nothing lives at this address." /> },
    ],
  },
]);

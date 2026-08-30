import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppShell, LaunchpadShell } from './layout/AppShell';
// Static: the shell's own furniture, not screens. These render on every route, so deferring them
// would only add a waterfall.
import { TabbedSection } from './layout/TabbedSection';
import { ScreenGate } from './layout/ScreenGate';
import { Placeholder } from '../components/Placeholder';
import { MIGRATION_TABS } from './nav';
import type { TabStripItem } from './layout/TabStrip';

/** `React.lazy` wants a module whose default export is the component; every screen here is a named
 * export. Rather than adding a default export to sixty files (and two ways to import each of them),
 * this adapts the named one at the boundary.
 *
 * Why lazy at all: every screen was statically imported, so the whole app — ReactFlow, all four
 * Library catalogues, every wizard and dialog — arrived in a single 1.9 MB chunk before the login
 * form could render. Splitting per route means opening the app downloads the shell and the screen
 * you asked for, and nothing else. The rest arrives when navigated to, which is also when the
 * browser can cache it usefully. */
function lazyNamed<K extends string, M extends Record<K, ComponentType<any>>>(
  load: () => Promise<M>,
  name: K,
): LazyExoticComponent<M[K]> {
  // Props are preserved through M[K] rather than widened to `unknown` — several routes pass props
  // at the element (DqChecksPhase's `phase`/`emptyLabel`), and a helper that erased them would
  // turn a compile-time contract into a runtime surprise.
  return lazy(async () => {
    try {
      const mod = await load();
      clearReloadGuard();
      return { default: mod[name] };
    } catch (err) {
      if (isStaleChunk(err) && takeReloadGuard()) {
        window.location.reload();
        // Never resolves. The page is being replaced, and resolving to anything here would flash
        // a screen for the instant before it goes.
        return new Promise<{ default: M[K] }>(() => {});
      }
      throw err;
    }
  });
}

/* ── Surviving a deploy with the tab already open ────────────────────────────────────────────
   Every route above is a separate chunk, named by content hash. A deploy replaces all of them, so
   a tab opened before it is holding an index.html whose chunks no longer exist on the server: the
   app keeps working until you navigate somewhere you have not been yet, and that route then dies on
   a 404 with "Failed to fetch dynamically imported module". It is not a stale cache the user can
   reason about — the app was working a second ago — and it lands them on a raw router error page.

   Reloading picks up the current index.html and the navigation completes. Done once and guarded, so
   a chunk that is genuinely broken (rather than merely superseded) fails visibly instead of putting
   the tab in a reload loop; the guard clears on the next successful load, so the NEXT deploy gets
   its own single retry. */
const RELOAD_KEY = 'dms:chunk-reload';

/** sessionStorage throws outright in some privacy modes, so every access is guarded. Losing the
 * flag degrades to "no auto-reload", never to a loop. */
const session = (fn: (s: Storage) => void) => {
  try { fn(window.sessionStorage); } catch { /* storage unavailable — skip the guard entirely */ }
};

const clearReloadGuard = () => session((s) => s.removeItem(RELOAD_KEY));

/** True if a reload has not already been tried. Claims the attempt in the same step, so two routes
 * failing at once cannot both reload. */
const takeReloadGuard = (): boolean => {
  let allowed = false;
  session((s) => {
    if (s.getItem(RELOAD_KEY)) return;
    s.setItem(RELOAD_KEY, '1');
    allowed = true;
  });
  return allowed;
};

/** A missing chunk, as opposed to an exception thrown by the module's own top-level code — that one
 * would survive a reload, and retrying it would just cost the user their page state. Browsers word
 * it differently enough that this matches on the shared fragments. */
const isStaleChunk = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg);
};
const LaunchpadPage = lazyNamed(() => import('../features/launchpad/LaunchpadPage'), 'LaunchpadPage');
const AdministrationPage = lazyNamed(() => import('../features/launchpad/AdministrationPage'), 'AdministrationPage');
const MigrationStatusPage = lazyNamed(() => import('../features/launchpad/MigrationStatusPage'), 'MigrationStatusPage');
const ArchiveApprovalsPage = lazyNamed(() => import('../features/launchpad/ArchiveApprovalsPage'), 'ArchiveApprovalsPage');
const ChangeLogPage = lazyNamed(() => import('../features/launchpad/ChangeLogPage'), 'ChangeLogPage');
const ArchivePage = lazyNamed(() => import('../features/launchpad/ArchivePage'), 'ArchivePage');
const HierarchyPage = lazyNamed(() => import('../features/programme/HierarchyPage'), 'HierarchyPage');
const ProgramAdminPage = lazyNamed(() => import('../features/programme/ProgramAdminPage'), 'ProgramAdminPage');
const PlantsPage = lazyNamed(() => import('../features/programme/PlantsPage'), 'PlantsPage');
const ScopeErd = lazyNamed(() => import('../features/scope/ScopeErd'), 'ScopeErd');
const ScopeRegister = lazyNamed(() => import('../features/scope/ScopeRegister'), 'ScopeRegister');
const ScopeWizard = lazyNamed(() => import('../features/scope/ScopeWizard'), 'ScopeWizard');
const RulesOverview = lazyNamed(() => import('../features/rules/RulesOverview'), 'RulesOverview');
const RulesRegister = lazyNamed(() => import('../features/rules/RulesRegister'), 'RulesRegister');
const ValueMapping = lazyNamed(() => import('../features/rules/ValueMapping'), 'ValueMapping');
const UnmappedValues = lazyNamed(() => import('../features/rules/UnmappedValues'), 'UnmappedValues');
const ConnectionsPage = lazyNamed(() => import('../features/connections/ConnectionsPage'), 'ConnectionsPage');
const CutoverPage = lazyNamed(() => import('../features/cutover/CutoverPage'), 'CutoverPage');
const RunsRegister = lazyNamed(() => import('../features/runs/RunsRegister'), 'RunsRegister');
const RunDetailModal = lazyNamed(() => import('../features/runs/RunDetailModal'), 'RunDetailModal');
const StagingArea = lazyNamed(() => import('../features/staging/StagingArea'), 'StagingArea');
const MigrationOverview = lazyNamed(() => import('../features/staging/MigrationOverview'), 'MigrationOverview');
const ProfilingPage = lazyNamed(() => import('../features/staging/ProfilingPage'), 'ProfilingPage');
const PipelineStages = lazyNamed(() => import('../features/staging/PipelineStages'), 'PipelineStages');
const PromotionsPage = lazyNamed(() => import('../features/governance/PromotionsPage'), 'PromotionsPage');
const JobMonitorPage = lazyNamed(() => import('../features/governance/JobMonitorPage'), 'JobMonitorPage');
const LibraryHome = lazyNamed(() => import('../features/library/LibraryHome'), 'LibraryHome');
const LibraryObjects = lazyNamed(() => import('../features/library/LibraryObjects'), 'LibraryObjects');
const LibraryRules = lazyNamed(() => import('../features/library/LibraryRules'), 'LibraryRules');
const LibraryFmds = lazyNamed(() => import('../features/library/LibraryFmds'), 'LibraryFmds');
const LibraryXref = lazyNamed(() => import('../features/library/LibraryXref'), 'LibraryXref');
const FmdRoute = lazyNamed(() => import('../features/library/LibraryDeepViews'), 'FmdRoute');
const ObjectRoute = lazyNamed(() => import('../features/library/LibraryDeepViews'), 'ObjectRoute');
const XrefRoute = lazyNamed(() => import('../features/library/LibraryDeepViews'), 'XrefRoute');
const DashboardPage = lazyNamed(() => import('../features/dashboard/DashboardPage'), 'DashboardPage');
const SearchPage = lazyNamed(() => import('../features/search/SearchPage'), 'SearchPage');
const MyProfilePage = lazyNamed(() => import('../features/profile/MyProfilePage'), 'MyProfilePage');
const MyWorkPage = lazyNamed(() => import('../features/mywork/MyWorkPage'), 'MyWorkPage');
const QualityOverview = lazyNamed(() => import('../features/quality/QualityOverview'), 'QualityOverview');
const QualityDimensions = lazyNamed(() => import('../features/quality/QualityDimensions'), 'QualityDimensions');
const DqChecksPhase = lazyNamed(() => import('../features/quality/DqChecksPhase'), 'DqChecksPhase');
const ReconciliationPage = lazyNamed(() => import('../features/quality/ReconciliationPage'), 'ReconciliationPage');
const FalloutPage = lazyNamed(() => import('../features/quality/FalloutPage'), 'FalloutPage');
const ReferenceDataOverview = lazyNamed(() => import('../features/referenceData/ReferenceDataOverview'), 'ReferenceDataOverview');
const CheckTablesPage = lazyNamed(() => import('../features/referenceData/CheckTablesPage'), 'CheckTablesPage');

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
      // Programme master data, so it sits beside the hierarchy rather than inside a subproject —
      // two waves covering plant 1010 have to be talking about the same 1010.
      { path: '/plants', element: <PlantsPage /> },
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
              /* MODELER — authoring the reusable definitions, as opposed to Design, which picks
                 which of them a subproject uses. Routed and gated now, screens to follow; see the
                 deferred-scope skill for how a section moves from placeholder to built. */
              { path: 'modeler/objects', element: <ScreenGate screen="modelObjects"><Placeholder title="Object Modeler" description="Design the migration objects and their structures before a scope is built from them." /></ScreenGate> },
              { path: 'modeler/workflow', element: <ScreenGate screen="modelWorkflow"><Placeholder title="Workflow" description="The steps a migration object moves through, and who signs off each one." /></ScreenGate> },
              { path: 'modeler/rules', element: <ScreenGate screen="modelRules"><Placeholder title="Rule Modeler" description="Author validation, transformation and enrichment rules for reuse across subprojects." /></ScreenGate> },
              { path: 'modeler/xref', element: <ScreenGate screen="modelXref"><Placeholder title="XREF Modeler" description="Define cross-reference tables and their value mappings." /></ScreenGate> },
              { path: 'modeler/fmd', element: <ScreenGate screen="modelFmd"><Placeholder title="FMD Modeler" description="Shape the Field Mapping template the generated documents are built from." /></ScreenGate> },
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
              { path: 'connections', element: <ScreenGate screen="connections"><ConnectionsPage /></ScreenGate> },
            ],
          },
        ],
      },
      { path: '*', element: <Placeholder title="Page not found" description="Nothing lives at this address." /> },
    ],
  },
]);

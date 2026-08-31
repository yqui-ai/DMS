import { useNavigate, useParams } from 'react-router-dom';
import { useLibraryFmds } from '../../lib/queries/fmds';
import { useMigrationObjects } from '../../lib/queries/scope';
import { useLibraryXrefTables } from '../../lib/queries/rules';
import { useLibraryPath } from '../../lib/libraryNav';
import { markFmdSeen } from '../../lib/fmdSeen';
import { FmdVersionHistoryDialog } from './FmdVersionHistoryDialog';
import { LibraryObjectDialog } from './LibraryObjectDialog';
import { GoldenXrefViewerDialog } from './GoldenXrefViewerDialog';
import { useEffect } from 'react';

/** The Library's three deep views, each mounted at its own URL and rendered through the list
 * screen's `<Outlet />`.
 *
 * They used to be dialogs held in list-screen state, which meant they had no address: Back left
 * the whole screen instead of closing the view, and a link to one FMD was impossible. Worse, the
 * FMD viewer was mounted in three separate places (both catalogues and the object dialog), so
 * three copies of its state could disagree. One route, one mount.
 *
 * Each wrapper re-runs the list's own query to resolve its id. That's a cache read, not a second
 * request — the list screen above it has already populated the same key. On a cold deep link the
 * row is briefly undefined and the dialog stays closed until it resolves, the same way
 * `RunDetailModal` behaves. */

export function FmdRoute() {
  const { fmdId } = useParams();
  const navigate = useNavigate();
  const to = useLibraryPath();
  const { data: fmds = [] } = useLibraryFmds();
  const fmd = fmds.find((f) => f.id === fmdId) ?? null;

  // Opening an FMD is what dismisses its "New" badge. This lives here rather than on the row click
  // so it fires however the viewer was reached — row, deep link, or a toast's "View FMD" action.
  useEffect(() => {
    if (fmd) markFmdSeen(fmd.id, fmd.latestVersionId);
    // Keyed on the ids, not the row: the object identity changes on every list refetch and
    // would re-mark on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmd?.id, fmd?.latestVersionId]);

  return <FmdVersionHistoryDialog fmd={fmd} onClose={() => navigate(to('fmds'))} />;
}

export function ObjectRoute() {
  const { objectId } = useParams();
  const navigate = useNavigate();
  const to = useLibraryPath();
  const { data: objects = [] } = useMigrationObjects();
  const object = objects.find((o) => o.id === objectId) ?? null;

  return (
    <LibraryObjectDialog
      object={object}
      onClose={() => navigate(to('objects'))}
      // A related object in the dependency diagram is its own address, so it becomes a real
      // navigation — Back walks the chain you followed rather than dropping you out of it.
      onSelectObject={(id) => navigate(to('objects', id))}
      onBack={() => navigate(-1)}
    />
  );
}

export function XrefRoute() {
  const { xrefId } = useParams();
  const navigate = useNavigate();
  const to = useLibraryPath();
  const { data: tables = [] } = useLibraryXrefTables();
  const xref = tables.find((t) => t.id === xrefId) ?? null;

  return <GoldenXrefViewerDialog xref={xref} onClose={() => navigate(to('xref'))} />;
}

/* ── The same two views as PAGES ──────────────────────────────────────────────────────────────
 *
 * Mounted outside their catalogue rather than through its `<Outlet />`, so nothing renders behind
 * them. That is the entire difference: same component, same tabs, same state — only the frame
 * changes, because a "full screen mode" built as a second copy of the viewer would be a second copy
 * to keep in step.
 *
 * These are what the New tab button opens. In a tab of its own a modal makes no sense: it would
 * float over a catalogue nobody navigated to, above a close button that reveals a screen they never
 * asked for. The document IS the page here, under the app's header, with a link back to its
 * catalogue instead of a dismiss.
 *
 * `onClose` still goes to the catalogue — the unsaved-changes guard funnels through it, so it has to
 * lead somewhere sensible even though no close button is rendered.
 */

export function FmdPageRoute() {
  const { fmdId } = useParams();
  const navigate = useNavigate();
  const to = useLibraryPath();
  const { data: fmds = [] } = useLibraryFmds();
  const fmd = fmds.find((f) => f.id === fmdId) ?? null;

  useEffect(() => {
    if (fmd) markFmdSeen(fmd.id, fmd.latestVersionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmd?.id, fmd?.latestVersionId]);

  return <FmdVersionHistoryDialog fmd={fmd} asPage onClose={() => navigate(to('fmds'))} />;
}

export function XrefPageRoute() {
  const { xrefId } = useParams();
  const navigate = useNavigate();
  const to = useLibraryPath();
  const { data: tables = [] } = useLibraryXrefTables();
  const xref = tables.find((t) => t.id === xrefId) ?? null;

  return <GoldenXrefViewerDialog xref={xref} asPage onClose={() => navigate(to('xref'))} />;
}

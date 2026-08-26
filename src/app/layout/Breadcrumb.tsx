import { Fragment } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { NAV_GROUPS } from '../nav';

/** URL segment -> nav label, built from NAV_GROUPS so a renamed nav item renames its crumb too.
 * Keyed on the FIRST path segment after the subproject (`scope`, `rules`, `library`), which is what
 * identifies the section; deeper segments are sub-tabs and get humanised instead. */
const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.to.replace(/^\.\.\/\.\.\//, '').split('/')[0], i.label]),
);
/** Library's four screens are `library/<x>` — the section crumb is "Library", the leaf is the item. */
const LIBRARY_LABELS: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.find((g) => g.title === 'LIBRARY')?.items.map((i) => [i.to.split('/')[1], i.label]) ?? [],
);

/** "value-mapping" -> "Value Mapping". Used for sub-tabs, which have no central registry — reading
 * the URL is accurate by construction and can't fall out of sync with a hand-kept list. */
const humanise = (seg: string) =>
  seg.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

interface Crumb { label: string; to?: string }

/** Where you are, and the way back up. The app previously had neither: the header showed a
 * subproject *switcher* but no trail, and with the sidebar collapsed to icons the only clue to your
 * location was which icon was highlighted. Segments link wherever a real route exists and render as
 * plain text where one doesn't — no invented destinations.
 *
 * Sits directly above the page title (see `AppShell`). It carries its own bottom margin rather than
 * being wrapped in a spacing div, because it renders nothing at all on the subproject picker and a
 * wrapper would leave a gap where no trail exists. */
export function Breadcrumb() {
  const { programId, subprojectId } = useParams();
  const { pathname } = useLocation();

  const crumbs: Crumb[] = [];
  const segments = pathname.split('/').filter(Boolean);

  if (programId && subprojectId) {
    // /pg/:programId/sp/:subprojectId/<section>[/<subtab>...]
    const rest = segments.slice(4);
    // Project and subproject are NOT repeated here: the switcher in the header already names them,
    // and it is the control that changes them. Two copies of the same context, one of them not
    // clickable, is the widest thing on the trail saying the least.

    if (rest[0] === 'library') {
      crumbs.push({ label: 'Library' });
      if (rest[1]) crumbs.push({ label: LIBRARY_LABELS[rest[1]] ?? humanise(rest[1]) });
    } else if (rest[0]) {
      const sectionPath = `/pg/${programId}/sp/${subprojectId}/${rest[0]}`;
      crumbs.push({
        label: SECTION_LABELS[rest[0]] ?? humanise(rest[0]),
        // Only linkable when it isn't already the page you're on.
        to: rest.length > 1 ? sectionPath : undefined,
      });
      for (let i = 1; i < rest.length; i += 1) {
        crumbs.push({ label: humanise(rest[i]) });
      }
    }
  } else if (segments[0] === 'library') {
    crumbs.push({ label: 'Library' });
    if (segments[1]) crumbs.push({ label: LIBRARY_LABELS[segments[1]] ?? humanise(segments[1]) });
  } else if (segments[0] === 'pg') {
    // Program-level screen (settings/admin) with no subproject open.
    crumbs.push({ label: segments[2] ? humanise(segments[2]) : 'Program' });
  } else if (segments.length > 0) {
    crumbs.push({ label: humanise(segments[segments.length - 1]) });
  }

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 min-w-0 text-sm2 mb-2">
      <Link to="/" className="text-muted hover:text-blue shrink-0" title="All subprojects">Home</Link>
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <Fragment key={`${c.label}-${i}`}>
            <ChevronRight size={13} className="text-muted shrink-0" />
            {/* The last crumb is no longer the strongest thing on screen — the page title below it
                is, and usually says the same word. Bolding it here as well made the pair read as two
                competing headings. */}
            {c.to && !isLast ? (
              <Link to={c.to} className="text-muted hover:text-blue truncate">{c.label}</Link>
            ) : (
              <span className={clsx('truncate', isLast ? 'text-text' : 'text-muted')}>{c.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

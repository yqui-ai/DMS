import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { PageHeader } from '../../components/PageHeader';
import { UsersTab } from './UsersTab';
import { RolesTab } from './RolesTab';

/* The last three arrived from Program Settings, which is gone: its Configure tab was a second
   editor for the same program → project → subproject → cycle tree that Migration Project already
   owns, and two places to edit one hierarchy is one place too many. These three were never
   duplicated anywhere, so they moved here rather than being deleted with the screen around them. */
/* Users and roles only. Everything else that lived here was programme configuration rather than
   people-and-permissions, and it now sits in Home > Administration, which already spans every
   programme you administer instead of making you open one at a time.

   The Timelines tab went to a dialog on the Dashboard — the screen that shows the timeline is the
   sensible place to edit it, and it was the only reason to come here for something that is not a
   person. Internal (the data dictionary) is out of the nav entirely; see the deferred-scope
   skill. */
const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles and Auth' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** Program-wide administration. Program admin only (see the programAdmin ScreenKey). Reachable
 * nested under the current project (/pg/:programId/sp/:subprojectId/admin) so it never drops the
 * project context, or standalone (/pg/:programId/admin) when browsing without one open — same
 * pattern as the Library screens. */
export function ProgramAdminPage() {
  const { programId } = useParams();
  /* `?tab=` opens a specific tab, so another screen can link AT a setting rather than at this page
     plus a sentence telling you which tab to go and find. The Dashboard's "Configure timeline"
     uses it. Falls back to Users when the parameter is missing or names a tab that does not exist,
     rather than showing an empty body for a typo in a URL. */
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const [tab, setTabState] = useState<TabKey>(
    TABS.some((t) => t.key === requested) ? (requested as TabKey) : 'users',
  );
  // Written back to the URL so the open tab survives a reload and can be linked to or shared.
  const setTab = (next: TabKey) => {
    setTabState(next);
    setParams(next === 'users' ? {} : { tab: next }, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Program Admin" description="Users and their roles in this program." />
      <div className="flex items-center gap-1 border-b border-line mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-3.5 py-2.5 text-sm2 font-semibold border-b-2 -mb-px',
              tab === t.key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersTab programId={programId!} />}
      {tab === 'roles' && <RolesTab />}
    </div>
  );
}

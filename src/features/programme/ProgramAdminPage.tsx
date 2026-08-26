import { useState } from 'react';
import { useParams } from 'react-router-dom';
import clsx from 'clsx';
import { PageHeader } from '../../components/PageHeader';
import { UsersTab } from './UsersTab';
import { RolesTab } from './RolesTab';
import { ApprovalsTab } from './ApprovalsTab';
import { AiSettingsTab } from './AiSettingsTab';

const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles and Auth' },
  { key: 'ai', label: 'AI Usage & Billing' },
  { key: 'approvals', label: 'Workflow Approvals' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** Program-wide administration — Users, Roles and Auth, AI Usage, Workflow Approvals. Program
 * admin only (see the programAdmin ScreenKey). Reachable nested under the current project
 * (/pg/:programId/sp/:subprojectId/admin) so it never drops the project context, or standalone
 * (/pg/:programId/admin) when browsing without one open — same pattern as the Library screens. */
export function ProgramAdminPage() {
  const { programId } = useParams();
  const [tab, setTab] = useState<TabKey>('users');

  return (
    <div>
      <PageHeader title="Program Admin" description="Users, roles, AI usage, and approval workflows for this program." />
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
      {tab === 'ai' && <AiSettingsTab programId={programId!} />}
      {tab === 'approvals' && <ApprovalsTab programId={programId!} />}
    </div>
  );
}

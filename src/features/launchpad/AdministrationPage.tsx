import { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../../components/PageHeader';
import { Toolbar } from '../../components/Toolbar';
import { Select } from '../../components/Select';
import { Tag } from '../../components/Tag';
import { EmptyState } from '../../components/EmptyState';
import { ListEmptyState } from '../../components/ListEmptyState';
import { RolesTab } from '../programme/RolesTab';
import { ArchiveApproversTab } from '../programme/ArchiveApproversTab';
import { ApprovalsTab } from '../programme/ApprovalsTab';
import { AiSettingsTab } from '../programme/AiSettingsTab';
import { useHierarchy } from '../../lib/queries/hierarchy';
import { adminProgramIds, useAdminUsers, useMyMemberships, type AdminUser } from '../../lib/queries/launchpad';
import { ROLE_SCREENS } from '../../lib/rbac';

/* The last three arrived from Program Admin. They are programme CONFIGURATION rather than
   people-and-permissions, and this screen already spans every programme you administer — so they
   are reachable here without opening one programme at a time, which was the only way before.

   Users and Roles read across ALL your programmes at once. The three below describe ONE, so they
   carry a programme selector. Conflating the two would mean either a selector that does nothing on
   the first two tabs, or three tabs quietly showing only your first programme. */
const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles & Permissions' },
  { key: 'archiveApprovers', label: 'Archive Approvers' },
  { key: 'workflowApprovals', label: 'Workflow Approvals' },
  { key: 'ai', label: 'AI Usage & Billing' },
] as const;
type TabKey = typeof TABS[number]['key'];

/** Tabs that describe one programme rather than all of them. */
const PROGRAM_SCOPED = new Set<TabKey>(['archiveApprovers', 'workflowApprovals', 'ai']);

const GROUPINGS = [
  { value: 'none', label: 'No grouping' },
  { value: 'program', label: 'Group by program' },
  { value: 'project', label: 'Group by project' },
  { value: 'role', label: 'Group by role' },
] as const;
type Grouping = typeof GROUPINGS[number]['value'];

const STATUS_VARIANT = { Active: 'success', Invited: 'warn', Disabled: 'neutral' } as const;

/** Administration, above the program level.
 *
 * The per-program admin screen still exists and still works; what it could never show is the thing
 * that actually matters about a person — that they are a functional consultant on one wave and an
 * ETL developer on another. Seen one program at a time, that person looks like two different users
 * with one role each.
 *
 * Scoped, not global: it lists the programs you hold a program-wide `program_admin` membership on.
 * There is no role above program admin in this schema and this screen does not invent one. */
export function AdministrationPage() {
  const [tab, setTab] = useState<TabKey>('users');
  const [programId, setProgramId] = useState<string>('');
  const { data: memberships = [], isLoading: loadingMemberships } = useMyMemberships();
  const programIds = useMemo(() => adminProgramIds(memberships), [memberships]);

  /* Named, not just id'd — a selector of uuids is a selector nobody can use. The hierarchy is
     already cached by every other screen, so this costs nothing. */
  const { data: allPrograms = [] } = useHierarchy();
  const programOptions = useMemo(
    () => allPrograms.filter((p) => programIds.includes(p.id)).map((p) => ({ id: p.id, code: p.code, name: p.name })),
    [allPrograms, programIds],
  );
  // Falls back to the first programme you administer rather than making the tab empty until you
  // pick one — with a single programme, which is the common case, there is nothing to pick.
  const activeProgramId = programOptions.some((p) => p.id === programId)
    ? programId
    : programOptions[0]?.id ?? '';

  if (loadingMemberships) {
    return <div className="py-24 text-center text-muted text-sm2">Loading…</div>;
  }

  if (programIds.length === 0) {
    return (
      <div>
        <PageHeader title="Administration" />
        <EmptyState
          icon={<ShieldAlert size={26} />}
          title="You don't administer any program"
          description="Administration is granted per program, as a program-wide Program Admin membership. A subproject-scoped admin role doesn't reach this screen."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Administration"
        description={`Users, roles and settings across the ${programIds.length} program${programIds.length === 1 ? '' : 's'} you administer.`}
      />
      <div className="flex items-center gap-1 border-b border-line mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'text-sm2 font-semibold px-3.5 py-2 border-b-2 -mb-px transition-colors',
              tab === t.key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {PROGRAM_SCOPED.has(tab) && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xs text-muted">Program</span>
          <Select value={activeProgramId} onChange={(e) => setProgramId(e.target.value)} className="w-[320px]">
            {programOptions.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        </div>
      )}

      {tab === 'users' && <UsersPane programIds={programIds} />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'archiveApprovers' && activeProgramId && <ArchiveApproversTab programId={activeProgramId} />}
      {tab === 'workflowApprovals' && activeProgramId && <ApprovalsTab programId={activeProgramId} />}
      {tab === 'ai' && activeProgramId && <AiSettingsTab programId={activeProgramId} />}
    </div>
  );
}

function UsersPane({ programIds }: { programIds: string[] }) {
  const { data: users = [], isLoading } = useAdminUsers(programIds);
  const [query, setQuery] = useState('');
  const [grouping, setGrouping] = useState<Grouping>('none');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (
      u.name.toLowerCase().includes(q)
      || u.email.toLowerCase().includes(q)
      || u.memberships.some((m) => (
        (m.programCode ?? '').toLowerCase().includes(q)
        || (m.projectCode ?? '').toLowerCase().includes(q)
        || (m.subprojectName ?? '').toLowerCase().includes(q)
        || m.roleId.toLowerCase().includes(q)
      ))
    ));
  }, [users, query]);

  /** Grouping keys off a MEMBERSHIP, not a user, so someone who is a consultant on one wave and a
   * developer on another appears under both roles — which is the whole point of the view. Each
   * appearance shows only the memberships that put them in that group, so a row never claims a
   * person holds a role in a place they don't. */
  const groups = useMemo(() => {
    if (grouping === 'none') {
      return [{ key: '', label: '', users: filtered }];
    }
    const keyOf = (m: AdminUser['memberships'][number]) => {
      if (grouping === 'program') return m.programCode ?? m.programId;
      if (grouping === 'project') return m.projectCode ?? '(program-wide)';
      return m.roleId;
    };
    const buckets = new Map<string, AdminUser[]>();
    for (const u of filtered) {
      const byKey = new Map<string, AdminUser['memberships']>();
      for (const m of u.memberships) {
        const k = keyOf(m);
        byKey.set(k, [...(byKey.get(k) ?? []), m]);
      }
      for (const [k, ms] of byKey) {
        buckets.set(k, [...(buckets.get(k) ?? []), { ...u, memberships: ms }]);
      }
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, us]) => ({ key, label: grouping === 'role' ? roleLabel(key) : key, users: us }));
  }, [filtered, grouping]);

  if (isLoading) return <p className="text-sm2 text-muted py-12 text-center">Loading users…</p>;

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        spacing="none"
        search={{ value: query, onChange: setQuery, placeholder: 'Search name, email, program, role…' }}
        onClearFilters={query ? () => setQuery('') : undefined}
        count={filtered.length} noun="users"
      >
        <Select size="sm" quiet={grouping === 'none'} value={grouping} onChange={(e) => setGrouping(e.target.value as Grouping)} aria-label="Grouping">
          {GROUPINGS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </Select>
      </Toolbar>

      {filtered.length === 0 ? (
        <ListEmptyState
          noun="users" filtered={!!query}
          description="Nobody has a membership on the programs you administer."
          onClearFilters={() => setQuery('')}
        />
      ) : (
        groups.map((g) => (
          <section key={g.key || 'all'}>
            {g.label && (
              <div className="flex items-baseline gap-2 px-1 py-1.5">
                <span className="text-2xs font-bold uppercase tracking-[.04em] text-muted">{g.label}</span>
                <span className="text-2xs text-muted">{g.users.length}</span>
              </div>
            )}
            <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] bg-surface divide-y divide-line-soft overflow-hidden">
              {g.users.map((u) => <UserRow key={`${g.key}-${u.userId}`} user={u} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-2.5">
      <span className="w-7 h-7 rounded-full bg-blue-light text-blue-deep text-2xs font-bold grid place-items-center shrink-0 mt-0.5">
        {user.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 w-[220px] shrink-0">
        <div className="text-sm2 font-semibold text-text truncate">{user.name}</div>
        <div className="text-2xs text-muted truncate">{user.email}</div>
      </div>
      <Tag variant={STATUS_VARIANT[user.status]} size="sm" className="shrink-0 mt-0.5">{user.status}</Tag>
      {/* Every assignment, not a single "role" column. One row per person, N roles inside it. */}
      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
        {user.memberships.map((m) => (
          <span
            key={m.membershipId}
            className="inline-flex items-center gap-1.5 text-2xs rounded bg-surface-2 px-2 py-1"
            title={m.subprojectId ? undefined : 'Program-wide — applies to every subproject'}
          >
            <span className="font-mono font-bold text-blue-deep">{m.programCode ?? '—'}</span>
            <span className="text-muted">
              {m.subprojectName ? `${m.projectCode ? `${m.projectCode} · ` : ''}${m.subprojectName}` : 'program-wide'}
            </span>
            <span className="text-text font-semibold">{roleLabel(m.roleId)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 'data_governance_lead' → 'Data Governance Lead'. Keyed off the rbac matrix so an unknown role
 * still renders readably rather than disappearing. */
const roleLabel = (roleId: string): string =>
  (roleId in ROLE_SCREENS ? roleId : roleId)
    .split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

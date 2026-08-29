import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Layers, ShieldCheck, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth';
import { EmptyState } from '../../components/EmptyState';
import { adminProgramIds, holdsRoleAnywhere, useMyMemberships } from '../../lib/queries/launchpad';

/** The three things this application is, before any of them is chosen.
 *
 * Administering people, doing migration work, and watching migration happen are different jobs done
 * by different people, and the app used to open straight into the third level of the second one —
 * a subproject picker — as though everyone were here to do the work. A launchpad says what the
 * choices are.
 *
 * A tile you cannot use is not shown. Rendering a disabled Administration tile to every consultant
 * advertises a door that will never open for them; the count under each tile is the honest version
 * of the same information. */
export function LaunchpadPage() {
  const { user } = useAuth();
  const { data: memberships = [], isLoading } = useMyMemberships();

  const tiles = useMemo(() => {
    const adminPrograms = adminProgramIds(memberships);
    const programs = new Set(memberships.map((m) => m.programId));
    const subprojects = new Set(memberships.filter((m) => m.subprojectId).map((m) => m.subprojectId));

    return [
      {
        key: 'admin',
        to: '/admin',
        icon: ShieldCheck,
        title: 'Administration',
        subtitle: 'Users, roles and permissions',
        detail: adminPrograms.length === 1
          ? '1 program you administer'
          : `${adminPrograms.length} programs you administer`,
        visible: adminPrograms.length > 0,
      },
      {
        key: 'projects',
        to: '/projects',
        icon: Layers,
        title: 'Migration Project',
        subtitle: 'Programs, projects and the migration work',
        detail: subprojects.size > 0
          ? `${programs.size} program${programs.size === 1 ? '' : 's'} · ${subprojects.size} subproject${subprojects.size === 1 ? '' : 's'}`
          : `${programs.size} program${programs.size === 1 ? '' : 's'}`,
        visible: memberships.length > 0,
      },
      {
        key: 'status',
        to: '/status',
        icon: Activity,
        title: 'Migration Status',
        subtitle: 'Portfolio progress and outstanding risk',
        detail: 'Across every program you can see',
        // CAB and program admins. Read-only oversight, deliberately separate from the working
        // screens — see the launchpad-design skill for why there is no `executive` role.
        visible: holdsRoleAnywhere(memberships, ['program_admin', 'cab']),
      },
    ].filter((t) => t.visible);
  }, [memberships]);

  if (isLoading) {
    return <div className="py-24 text-center text-muted text-sm2">Loading…</div>;
  }

  if (memberships.length === 0) {
    return (
      <div className="max-w-[760px] mx-auto py-16">
        <EmptyState
          icon={<Layers size={26} />}
          title="No programs yet"
          description="You don't have a membership on any program. Ask a Program Admin to add you."
        />
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto py-10">
      <h1 className="text-xl font-bold text-text">
        {greeting()}{user?.email ? `, ${user.email.split('@')[0]}` : ''}
      </h1>
      <p className="text-sm2 text-muted mt-1 mb-8">Data Migration Solution — pick where you're working today.</p>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))' }}>
        {tiles.map(({ key, visible: _visible, ...tile }) => <Tile key={key} {...tile} />)}
      </div>
    </div>
  );
}

function Tile({ to, icon: Icon, title, subtitle, detail }: {
  to: string; icon: LucideIcon; title: string; subtitle: string; detail: string;
}) {
  return (
    <Link
      to={to}
      className={clsx(
        'group flex flex-col gap-2 rounded-lg bg-surface p-4 min-h-[168px]',
        'shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-cardHover transition-shadow',
      )}
    >
      <span className="w-9 h-9 rounded bg-blue-light text-blue-deep grid place-items-center shrink-0">
        <Icon size={18} />
      </span>
      <span className="text-md font-bold text-text mt-1">{title}</span>
      <span className="text-sm2 text-muted leading-snug">{subtitle}</span>
      <span className="text-2xs text-muted mt-auto pt-2 border-t border-line-soft">{detail}</span>
    </Link>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

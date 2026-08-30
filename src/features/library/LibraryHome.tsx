import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowLeftRight, Database, Files, ListChecks, type LucideIcon } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { canView } from '../../lib/rbac';
import { useCurrentRole } from '../../lib/queries/memberships';
import { useDefaultProgram } from '../../lib/queries/programme';
import { useAllFmds, useLibraryFmds } from '../../lib/queries/fmds';
import { useMigrationObjects } from '../../lib/queries/scope';
import type { ScreenKey } from '../../types/entities';

interface Catalogue {
  to: string;
  screen: ScreenKey;
  icon: LucideIcon;
  title: string;
  description: string;
  count?: number;
}

/** The Library's front door.
 *
 * The four catalogues were only ever reachable as four separate sidebar entries, which said nothing
 * about what they are or how they relate — and a bare `/library` redirected to Migration Object, so
 * "Library" as a place did not exist. Four tiles give it one, and each says what lives in it and how
 * much, which is the question people actually arrive with.
 *
 * A catalogue the role cannot view is not shown, matching the sidebar. */
export function LibraryHome() {
  const { programId, subprojectId } = useParams();
  const { data: defaultProgram } = useDefaultProgram();
  const { data: role = 'guest' } = useCurrentRole(programId ?? defaultProgram?.id, subprojectId);

  const { data: objects = [] } = useMigrationObjects();
  const { data: fmds = [] } = useLibraryFmds();
  const { data: allFmds = [] } = useAllFmds();

  const catalogues = ([
    {
      to: 'objects', screen: 'catalogObjects', icon: Database,
      title: 'Migration Object',
      description: 'The SAP catalogue every scope is chosen from.',
      count: objects.length,
    },
    {
      to: 'fmds', screen: 'catalogFmds', icon: Files,
      title: 'Field Mapping',
      description: 'Golden, Standard and Custom FMDs, with their versions and reviews.',
      count: fmds.length || allFmds.length,
    },
    {
      to: 'rules', screen: 'catalogRules', icon: ListChecks,
      title: 'Rule',
      description: 'Transformation rules, program-wide and local.',
    },
    {
      to: 'xref', screen: 'catalogXref', icon: ArrowLeftRight,
      title: 'Cross Reference (XREF)',
      description: 'Value mapping tables between source and target.',
    },
  ] satisfies Catalogue[]).filter((c) => canView(role, c.screen));

  return (
    // `mx-auto w-full` to match Migration Project, Archive and the Change Log — the measure was
    // already right, but without centring it hugged the left edge with half a wide monitor empty
    // beside it, which is what made this one screen look unfinished next to its siblings.
    <div className="max-w-[1120px] mx-auto w-full">
      <PageHeader
        title="Library"
        description="Program-wide catalogues — everything that exists across every subproject you can see."
      />
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(258px, 1fr))' }}>
        {catalogues.map((c) => <CatalogueTile key={c.to} {...c} />)}
      </div>
    </div>
  );
}

function CatalogueTile({ to, icon: Icon, title, description, count }: Catalogue) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-2 rounded-lg bg-surface p-4 min-h-[164px] shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-cardHover transition-shadow"
    >
      <span className="w-9 h-9 rounded bg-blue-light text-blue-deep grid place-items-center shrink-0">
        <Icon size={18} />
      </span>
      <span className="text-md font-bold text-text mt-1">{title}</span>
      <span className="text-sm2 text-muted leading-snug">{description}</span>
      <span className="flex items-center gap-1.5 mt-auto pt-2 border-t border-line-soft text-2xs">
        {/* Only shown where it is cheap to know. A tile that says "—" teaches people the number is
            unreliable; one that says nothing just doesn't make the claim. */}
        <span className="text-muted tabular-nums">
          {count !== undefined ? `${count.toLocaleString()} record${count === 1 ? '' : 's'}` : 'Open catalogue'}
        </span>
        <ArrowRight size={12} className="ml-auto text-blue group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  );
}

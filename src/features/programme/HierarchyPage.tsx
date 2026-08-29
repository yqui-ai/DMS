import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArrowRight, History, CheckCircle2, Clock, Library as LibraryIcon, Package, Pencil, Plus, ShieldCheck, Undo2 } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { Menu, type MenuAction } from '../../components/Menu';
import { ToolbarSearch } from '../../components/ToolbarSearch';
import { EmptyState } from '../../components/EmptyState';
import { ArchiveDialog, type ArchiveTarget } from '../../components/ArchiveDialog';
import { APPROVER_ROLES, useArchiveMutations, useArchiveRequests } from '../../lib/queries/archive';
import { useToast } from '../../components/Toast';
import { fmtDate } from '../../lib/format';
import {
  statusName, useAllRefStatus, useHierarchy, type ArchiveState, type ProgramNode,
} from '../../lib/queries/hierarchy';
import { adminProgramIds, useMyMemberships } from '../../lib/queries/launchpad';
import { HierarchyDialog, type HierarchyTarget } from './HierarchyDialog';
import { LEVEL_ICON, statusVariant } from './hierarchyLevels';
import type { HierarchyLevel, RefStatus } from '../../types/entities';

// Both carry the derived archive state from useHierarchy, not just their own columns.
type SubprojectNode = ProgramNode['projects'][number]['subprojects'][number];
type ProjectNode = ProgramNode['projects'][number];

/** Program → Project → Subproject.
 *
 * Three levels, three treatments, because they are three different kinds of thing: a program is a
 * container with an owner, a project is a grouping, and a subproject is the only one you can go and
 * work inside. Each carries its own icon so the tier reads before the words do, and its status as a
 * coloured tag — a status is a state, which is what colour is for in this app.
 *
 * Centred and held to a readable measure. Full-bleed on a wide monitor left content hugging the
 * left edge with half the screen empty, which is most of why this looked unfinished. */
export function HierarchyPage() {
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const { data: programs = [], isLoading } = useHierarchy(showArchived);
  const { data: statuses = [] } = useAllRefStatus();
  const { data: memberships = [] } = useMyMemberships();

  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<HierarchyTarget | null>(null);
  const [archiving, setArchiving] = useState<ArchiveTarget | null>(null);
  const toast = useToast();
  const { cancel } = useArchiveMutations();

  /** Withdrawing an open request leaves no trace on the record — the request itself is marked
   * Cancelled and stays in the history, which is where that fact belongs. */
  const withdraw = async (requestId: string) => {
    try {
      await cancel.mutateAsync(requestId);
      toast.success('Archive request withdrawn.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not withdraw the request.');
    }
  };

  const adminOf = useMemo(() => new Set(adminProgramIds(memberships)), [memberships]);

  /** Requests waiting on a role this person holds. An approver who is never told is an approval
   * that never happens, and the archive sits Pending forever. */
  const { data: pendingRequests = [] } = useArchiveRequests('Pending');
  const waitingOnMe = useMemo(() => pendingRequests.filter((r) => {
    const myRoles = memberships
      .filter((m) => m.programId === r.programId && APPROVER_ROLES.includes(m.roleId))
      .map((m) => m.roleId);
    return myRoles.some((role) => !r.approvals.some((a) => a.roleId === role && a.decision));
  }).length, [pendingRequests, memberships]);

  const canApprove = useMemo(
    () => memberships.some((m) => APPROVER_ROLES.includes(m.roleId)),
    [memberships],
  );

  /** A match keeps its ancestors — a subproject found by search is useless if the program it sits
   * in has been filtered out above it. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return programs;
    const hit = (...values: (string | undefined)[]) => values.some((v) => v?.toLowerCase().includes(q));
    return programs
      .map((pg) => {
        if (hit(pg.code, pg.name, pg.guid, pg.owner)) return pg;
        const projects = pg.projects
          .map((pj) => (hit(pj.code, pj.name, pj.guid)
            ? pj
            : { ...pj, subprojects: pj.subprojects.filter((sp) => hit(sp.code, sp.name, sp.guid)) }))
          .filter((pj) => hit(pj.code, pj.name, pj.guid) || pj.subprojects.length > 0);
        return { ...pg, projects };
      })
      .filter((pg) => hit(pg.code, pg.name, pg.guid, pg.owner) || pg.projects.length > 0);
  }, [programs, query]);

  const totals = useMemo(() => ({
    projects: programs.reduce((n, pg) => n + pg.projects.length, 0),
    subprojects: programs.reduce((n, pg) => n + pg.projects.reduce((m, pj) => m + pj.subprojects.length, 0), 0),
  }), [programs]);

  return (
    <div className="max-w-[1120px] mx-auto w-full">
      <PageHeader
        title="Migration Project"
        description="Every program, project and subproject you can reach. Open a subproject to start working in it."
        actions={
          <>
            {/* Everything program-wide hangs off this screen rather than the area switcher, which
                is now just the three launchpad areas. These are things you do WITH the hierarchy,
                so they belong beside it. */}
            <Button variant="secondary" onClick={() => navigate('/library')}>
              <LibraryIcon size={14} /> Library
            </Button>
            <Button variant="secondary" onClick={() => navigate('/archive')}>
              <Archive size={14} /> Archive
            </Button>
            {/* Reads the whole system, so it belongs with the other programme-wide entry points
                rather than inside any one subproject. */}
            <Button variant="secondary" onClick={() => navigate('/changes')}>
              <History size={14} /> Change Log
            </Button>
            {/* Only for people who can actually decide one, and it carries the count — a button
                that silently hides the fact that three approvals are waiting is a button nobody
                presses. This replaces the separate banner: one place, not two. */}
            {canApprove && (
              <Button variant="secondary" onClick={() => navigate('/approvals')}>
                <ShieldCheck size={14} /> Approvals
                {waitingOnMe > 0 && (
                  <span className="ml-1 rounded-pill bg-amber-bg text-amber-ink text-2xs font-bold px-1.5 tabular-nums">
                    {waitingOnMe}
                  </span>
                )}
              </Button>
            )}
            {/* Anyone signed in may start a program and becomes its Program Admin by doing so —
                there is no role above a program on which to gate it. */}
            <Button variant="primary" onClick={() => setDialog({ level: 'PRGM' })}>
              <Plus size={14} /> New program
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-3 mb-5">
        <ToolbarSearch value={query} onChange={setQuery} placeholder="Search any level by ID, name or GUID…" />
        {query && <button onClick={() => setQuery('')} className="text-2xs text-blue font-semibold">Clear</button>}
        {/* Archived records leave the working list by default. The toggle is here rather than
            only on the Archive screen because the question 'what happened to X' is usually asked
            where X used to be. */}
        <label className="flex items-center gap-1.5 text-2xs text-muted cursor-pointer select-none shrink-0">
          <input
            type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}
            className="w-3.5 h-3.5 accent-[var(--blue)]"
          />
          Show archived
        </label>
        <span className="text-2xs text-muted">
          {filtered.length} program{filtered.length === 1 ? '' : 's'}
          {!query && <> · {totals.projects} project{totals.projects === 1 ? '' : 's'} · {totals.subprojects} subproject{totals.subprojects === 1 ? '' : 's'}</>}
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm2 text-muted py-16 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package size={26} />}
          title={query ? 'Nothing matches that search' : 'No programs yet'}
          description={query
            ? 'No program, project or subproject matches. Clear the search to see everything.'
            : 'Create a program to begin. You become its Program Admin, and can then add projects and subprojects under it.'}
          action={!query ? <Button variant="primary" onClick={() => setDialog({ level: 'PRGM' })}><Plus size={14} /> New program</Button> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {filtered.map((pg) => (
            <ProgramSection
              key={pg.id}
              program={pg}
              canEdit={adminOf.has(pg.id)}
              statuses={statuses}
              onDialog={setDialog}
              onArchive={setArchiving}
              onCancelRequest={withdraw}
              onOpen={(subprojectId) => navigate(`/pg/${pg.id}/sp/${subprojectId}/dashboard`)}
            />
          ))}
        </div>
      )}

      <HierarchyDialog target={dialog} onClose={() => setDialog(null)} />

      <ArchiveDialog target={archiving} onClose={() => setArchiving(null)} />
    </div>
  );
}

/** Edit, plus either 'archive' or 'cancel the open request' — never both, and never a second
 * request the database would reject. */
function nodeActions(opts: {
  label: string;
  archiveState: ArchiveState;
  archiveRequestId?: string;
  onEdit: () => void;
  onArchive: () => void;
  onCancelRequest: (requestId: string) => void;
  /** What this node can contain — 'project' on a program, 'subproject' on a project. */
  childLabel?: string;
  onAdd?: () => void;
}): MenuAction[] {
  // Adding lives in the menu with everything else rather than as its own `+` button. One control
  // per row, not two, and a menu can say "Add project" where a bare icon could only say "add".
  const add: MenuAction[] = opts.onAdd && opts.childLabel
    ? [{
      key: 'add',
      label: `Add ${opts.childLabel}`,
      icon: <Plus size={14} />,
      // Nothing may be added under a record on its way out of the working set.
      disabled: opts.archiveState !== 'none',
      onSelect: opts.onAdd,
    }]
    : [];

  const edit = { key: 'edit', label: `Edit ${opts.label}`, icon: <Pencil size={14} />, onSelect: opts.onEdit };

  if (opts.archiveState === 'pending' && opts.archiveRequestId) {
    return [
      ...add,
      { ...edit, disabled: true },
      {
        key: 'withdraw', label: 'Withdraw request', icon: <Undo2 size={14} />,
        onSelect: () => opts.onCancelRequest(opts.archiveRequestId!),
      },
    ];
  }
  return [
    ...add,
    edit,
    { key: 'archive', label: `Archive ${opts.label}`, icon: <Archive size={14} />, danger: true, onSelect: opts.onArchive },
  ];
}

/* ────────────────────────────────────────────────────────────────────────────── program */

function ProgramSection({ program: pg, canEdit, statuses, onDialog, onArchive, onCancelRequest, onOpen }: {
  program: ProgramNode;
  canEdit: boolean;
  statuses: RefStatus[];
  onDialog: (t: HierarchyTarget) => void;
  onArchive: (t: ArchiveTarget) => void;
  onCancelRequest: (requestId: string) => void;
  onOpen: (subprojectId: string) => void;
}) {
  const Icon = LEVEL_ICON.PRGM;
  const subprojectCount = pg.projects.reduce((n, pj) => n + pj.subprojects.length, 0);

  return (
    <section className="rounded-lg bg-surface shadow-card overflow-hidden">
      {/* Tinted band. Without a surface change the section never reads — white on white made the
          program header look like the first row of its own contents. */}
      <header className="bg-surface-2 px-5 py-4 border-b border-line">
        <div className="flex items-center gap-3.5">
          <span className="w-9 h-9 rounded bg-blue text-white grid place-items-center shrink-0">
            <Icon size={17} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-text">{pg.name}</h2>
              <StatusTag level="PRGM" code={pg.status} statuses={statuses} archiveState={pg.archiveState} />
            </div>
            {/* Identifier and size only. The lead and the date range are planning attributes: you
                set them once in the dialog and never scan a list for them, and four of them per
                row buried the two things you do scan for — the name and how big it is. */}
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-2xs text-muted">
              <span className="font-mono font-semibold">{pg.code}</span>
              <Dot />
              <span className="tabular-nums">{pg.projects.length} project{pg.projects.length === 1 ? '' : 's'}</span>
              <Dot />
              <span className="tabular-nums">{subprojectCount} subproject{subprojectCount === 1 ? '' : 's'}</span>
            </div>
          </div>

          {canEdit && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Menu
                label={`Manage ${pg.name}`}
                actions={nodeActions({
                  label: 'program', archiveState: pg.archiveState, archiveRequestId: pg.archiveRequestId,
                  childLabel: 'project',
                  onAdd: () => onDialog({ level: 'PRJT', parentId: pg.id, parentLabel: `${pg.code} · ${pg.name}` }),
                  onEdit: () => onDialog({ level: 'PRGM', record: pg }),
                  onCancelRequest,
                  onArchive: () => onArchive({ entityType: 'program', entityId: pg.id, entityLabel: pg.name, programId: pg.id, cascadeNote: 'projects, subprojects, cycles, scope, FMDs, rules and runs' }),
                })}
              />
            </div>
          )}
        </div>
      </header>

      {pg.projects.length === 0 ? (
        <p className="px-5 py-6 text-sm2 text-muted">
          No projects yet.{' '}
          {canEdit && (
            <button onClick={() => onDialog({ level: 'PRJT', parentId: pg.id, parentLabel: pg.name })} className="text-blue font-semibold hover:underline">
              Add the first one
            </button>
          )}
        </p>
      ) : (
        <div className="px-5 py-4 flex flex-col divide-y divide-line-soft">
          {pg.projects.map((pj) => (
            <ProjectGroup
              key={pj.id}
              project={pj}
              canEdit={canEdit}
              statuses={statuses}
              onDialog={onDialog}
              onArchive={onArchive}
              onCancelRequest={onCancelRequest}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────── project */

/** A grouping, not a card — projects organise subprojects, they are not something you open. */
function ProjectGroup({ project: pj, canEdit, statuses, onDialog, onArchive, onCancelRequest, onOpen }: {
  project: ProjectNode;
  canEdit: boolean;
  statuses: RefStatus[];
  onDialog: (t: HierarchyTarget) => void;
  onArchive: (t: ArchiveTarget) => void;
  onCancelRequest: (requestId: string) => void;
  onOpen: (subprojectId: string) => void;
}) {
  const Icon = LEVEL_ICON.PRJT;

  return (
    <div className="py-4 first:pt-1 last:pb-1">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="w-7 h-7 rounded bg-blue-light text-blue-deep grid place-items-center shrink-0">
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-md font-bold text-text">{pj.name}</h3>
            <StatusTag level="PRJT" code={pj.status} statuses={statuses} archiveState={pj.archiveState} />
          </div>
          <IdLine code={pj.code} />
        </div>

        {canEdit && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Menu
              label={`Manage ${pj.name}`}
              actions={nodeActions({
                label: 'project', archiveState: pj.archiveState, archiveRequestId: pj.archiveRequestId,
                childLabel: 'subproject',
                onAdd: () => onDialog({ level: 'SPRJ', parentId: pj.id, parentLabel: `${pj.code} · ${pj.name}` }),
                onEdit: () => onDialog({ level: 'PRJT', record: pj }),
                onCancelRequest,
                onArchive: () => onArchive({ entityType: 'project', entityId: pj.id, entityLabel: pj.name, programId: pj.programId, cascadeNote: 'its subprojects, their cycles, and all their scope and mapping work' }),
              })}
            />
          </div>
        )}
      </div>

      <div className="pl-[38px]">
        {pj.subprojects.length === 0 ? (
          // One quiet line. The dashed rectangle this replaces took as much room as a tile to say
          // there wasn't one, and two empty projects filled the screen with it.
          <p className="text-2xs text-muted">
            No subprojects yet.{' '}
            {canEdit && (
              <button onClick={() => onDialog({ level: 'SPRJ', parentId: pj.id, parentLabel: pj.name })} className="text-blue font-semibold hover:underline">
                Add one
              </button>
            )}
          </p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(296px, 1fr))' }}>
            {pj.subprojects.map((sp) => (
              <SubprojectTile
                key={sp.id}
                subproject={sp}
                programId={pj.programId}
                canEdit={canEdit}
                statuses={statuses}
                onOpen={() => onOpen(sp.id)}
                onDialog={onDialog}
                onArchive={onArchive}
              onCancelRequest={onCancelRequest}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── subproject */

/** The only level you can work inside, so the only one rendered as a destination. The whole tile is
 * the click target; the overflow menu stops propagation so administering never navigates. */
function SubprojectTile({ subproject: sp, programId, canEdit, statuses, onOpen, onDialog, onArchive, onCancelRequest }: {
  subproject: SubprojectNode;
  /** The program the subproject sits in — an archive request is scoped by program. */
  programId: string;
  canEdit: boolean;
  statuses: RefStatus[];
  onOpen: () => void;
  onDialog: (t: HierarchyTarget) => void;
  onArchive: (t: ArchiveTarget) => void;
  onCancelRequest: (requestId: string) => void;
}) {
  const Icon = LEVEL_ICON.SPRJ;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={clsx(
        'group text-left rounded-lg bg-surface flex flex-col cursor-pointer overflow-hidden',
        'shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-cardHover transition-shadow',
        'focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--blue)]',
      )}
    >
      <div className="p-3.5 flex flex-col gap-2.5 flex-1">
        <div className="flex items-start gap-2.5">
          <span className="w-7 h-7 rounded bg-surface-2 text-muted grid place-items-center shrink-0 group-hover:bg-blue-light group-hover:text-blue-deep transition-colors">
            <Icon size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm2 font-bold text-text leading-snug">{sp.name}</span>
              <StatusTag level="SPRJ" code={sp.status} statuses={statuses} archiveState={sp.archiveState} />
            </div>
            <IdLine code={sp.code} />
          </div>
          {canEdit && (
            <div className="-mt-1 -mr-1.5 shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <Menu
                label={`Manage ${sp.name}`}
                actions={[
                  ...nodeActions({
                    label: 'subproject', archiveState: sp.archiveState, archiveRequestId: sp.archiveRequestId,
                    childLabel: 'cycle',
                    onAdd: () => onDialog({ level: 'CYCL', parentId: sp.id, parentLabel: `${sp.code} · ${sp.name}` }),
                    onEdit: () => onDialog({ level: 'SPRJ', record: sp }),
                    onCancelRequest,
                    onArchive: () => onArchive({ entityType: 'subproject', entityId: sp.id, entityLabel: sp.name, programId, cascadeNote: 'its cycles, scope, FMDs, rules and runs' }),
                  }),
                ]}
              />
            </div>
          )}
        </div>

        <dl className="flex flex-col gap-1.5 text-2xs">
          {/* The one date that is operational rather than planning — people chase this. */}
          <Stat label="FMD freeze" value={sp.freezeDate ? fmtDate(sp.freezeDate) : 'Not set'} dim={!sp.freezeDate} />
          <div className="flex items-baseline gap-2">
            <dt className="text-muted w-[72px] shrink-0">Cycles</dt>
            <dd className="flex flex-wrap gap-1 min-w-0">
              {sp.cycles.length === 0
                ? <span className="text-muted">None yet</span>
                : sp.cycles.map((c) => (
                  <span key={c.id} className="font-mono text-2xs bg-surface-2 text-text rounded-xs px-1.5 py-px">
                    {c.code ?? c.name}
                  </span>
                ))}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-surface-2 border-t border-line-soft">
        {sp.scopeFinalized ? (
          <span className="text-2xs text-green flex items-center gap-1.5 font-semibold"><CheckCircle2 size={12} /> Scope finalized</span>
        ) : (
          <span className="text-2xs text-muted">Scope not finalized</span>
        )}
        {/* Always visible, not hover-only. A footer that stays empty until you hover looks
            unbalanced, and on touch it never appears at all. */}
        <span className="ml-auto text-2xs font-semibold text-blue flex items-center gap-1">
          Open <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────── bits */

/** ID and dates as one quiet line under the name.
 *
 * The ID used to be a blue chip sitting beside the name, which gave a bare reference the same
 * visual weight as the thing it refers to — three tinted pills per row competing with the only
 * words anyone reads. It is metadata, so it reads as metadata: below the name, muted, monospaced
 * because it is a technical identifier, with the dates beside it. */
function IdLine({ code, range }: { code?: string; range?: string }) {
  if (!code && !range) return null;
  return (
    <div className="flex items-center gap-2 text-2xs text-muted mt-0.5">
      {code && <span className="font-mono font-semibold">{code}</span>}
      {code && range && <Dot />}
      {range && <span>{range}</span>}
    </div>
  );
}

const Dot = () => <span className="text-line-strong" aria-hidden>·</span>;

function Stat({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted w-[72px] shrink-0">{label}</dt>
      <dd className={clsx('truncate', dim ? 'text-muted' : 'text-text')}>{value}</dd>
    </div>
  );
}

/** The record's lifecycle status — unless it is on its way out, in which case that is what matters.
 *
 * A pending archive REPLACES the status rather than sitting beside it. Showing 'Active · Archive
 * requested' asks the reader to work out which one wins; the answer is always the archive. */
function StatusTag({ level, code, statuses, archiveState }: {
  level: HierarchyLevel; code?: string; statuses: RefStatus[]; archiveState?: ArchiveState;
}) {
  if (archiveState === 'archived') {
    return <Tag variant="neutral" size="sm" className="shrink-0" icon={<Archive size={10} />}>Archived</Tag>;
  }
  if (archiveState === 'pending') {
    return (
      <Tag variant="warn" size="sm" className="shrink-0" icon={<Clock size={10} />}
        title="An archive request is open. Nothing changes until it is approved.">
        Archive requested
      </Tag>
    );
  }
  const name = statusName(statuses, level, code);
  if (name === '—') return null;
  return <Tag variant={statusVariant(code)} size="sm" className="shrink-0">{name}</Tag>;
}

import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Activity, ChevronDown, LayoutGrid, Layers, LogOut, Moon, ShieldCheck, UserCircle } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth';
import { BRANDS, useTheme } from '../../lib/theme';
import { usePrograms, useProjects, useSubproject, useSubprojects, useProject } from '../../lib/queries/programme';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { GlobalSearch } from './GlobalSearch';
import { useDismiss } from '../../components/useDismiss';
import { useCurrentRole } from '../../lib/queries/memberships';
import { useMyMemberships } from '../../lib/queries/launchpad';
import type { Env, RoleId } from '../../types/entities';

const ENV_CLASSES: Record<Env, string> = {
  DEV: 'bg-neutralTag-bg text-neutralTag-ink',
  QSA: 'bg-amber-bg text-amber-ink',
  PRD: 'bg-red-light text-red-ink',
};

function EnvPill() {
  const [params, setParams] = useSearchParams();
  const env = (params.get('env') as Env) || 'DEV';
  const [open, setOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Env | null>(null);
  const [password, setPassword] = useState('');
  const ref = useDismiss(open, () => setOpen(false));

  const applyEnv = (next: Env) => {
    const p = new URLSearchParams(params);
    p.set('env', next);
    setParams(p);
    setOpen(false);
  };

  const choose = (next: Env) => {
    if (next === env) { setOpen(false); return; }
    if (next === 'QSA' || next === 'PRD') { setConfirmTarget(next); setOpen(false); }
    else applyEnv(next);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx('px-2.5 py-1 rounded-pill text-2xs font-bold flex items-center gap-1', ENV_CLASSES[env])}
      >
        {env}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-32 bg-surface text-text rounded shadow-cardHover py-1 z-20">
          {(['DEV', 'QSA', 'PRD'] as Env[]).map((e) => (
            <button
              key={e}
              onClick={() => choose(e)}
              className="w-full text-left px-3 py-1.5 text-sm2 font-semibold hover:bg-blue-pale flex items-center gap-2"
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full', ENV_CLASSES[e])} /> {e}
            </button>
          ))}
        </div>
      )}
      <Dialog
        open={!!confirmTarget}
        onClose={() => { setConfirmTarget(null); setPassword(''); }}
        title={`Switch to ${confirmTarget}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setConfirmTarget(null); setPassword(''); }}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!password}
              onClick={() => { if (confirmTarget) applyEnv(confirmTarget); setConfirmTarget(null); setPassword(''); }}
            >
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-sm2 text-muted mb-3.5">
          Switching to <strong>{confirmTarget}</strong> gives access to a higher environment. Re-enter your password to confirm.
        </p>
        <Field label="Password" htmlFor="env-confirm-password">
          <Input id="env-confirm-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
      </Dialog>
    </div>
  );
}

/** Only rendered inside a program. On Library or the launchpad it read "Pick a subproject" —
 * advertising a choice that does not apply there, and phrased as a task you had failed to do. */
function SubprojectSwitcher() {
  const { programId, subprojectId } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: programs = [] } = usePrograms();
  const { data: projects = [] } = useProjects(programId);
  const { data: subprojects = [] } = useSubprojects(projects.map((r) => r.id));
  const { data: subproject } = useSubproject(subprojectId);
  const { data: project } = useProject(subproject?.projectId);
  const ref = useDismiss(open, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-sm2 font-semibold hover:bg-chrome-hover rounded px-2 py-1.5">
        <Layers size={14} className="text-chrome-muted" />
        <span className="truncate max-w-[220px]">
          {project && subproject ? <>{project.name} <span className="text-chrome-muted font-normal">›</span> {subproject.name}</> : 'Pick a subproject'}
        </span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-72 bg-surface text-text rounded shadow-cardHover py-2 z-20 max-h-96 overflow-auto">
          {programs.length === 0 && <div className="px-3.5 py-2 text-sm2 text-muted">No programmes available.</div>}
          {programs.map((pg) => (
            <div key={pg.id} className="mb-1">
              <div className="px-3.5 py-1 text-2xs font-bold uppercase tracking-[.05em] text-muted">{pg.name}</div>
              {subprojects.filter((s) => projects.some((r) => r.id === s.projectId && r.programId === pg.id) || programId === pg.id).map((s) => (
                <button
                  key={s.id}
                  onClick={() => { navigate(`/pg/${pg.id}/sp/${s.id}/dashboard`); setOpen(false); }}
                  className={clsx('w-full text-left px-3.5 py-1.5 text-sm2 hover:bg-blue-pale', s.id === subprojectId && 'bg-blue-light font-semibold')}
                >
                  {s.name}
                </button>
              ))}
            </div>
          ))}
          {/* `/` is the launchpad now, not the picker — this has to point at the picker itself or
              it drops you a level further out than you asked for. */}
          <Link to="/projects" onClick={() => setOpen(false)} className="block px-3.5 py-1.5 mt-1 text-sm2 font-semibold text-blue hover:bg-blue-pale">
            All programs and projects
          </Link>
        </div>
      )}
    </div>
  );
}

function AvatarMenu() {
  const { user, signOut } = useAuth();
  const { dark, toggle, brand, setBrand } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="w-8 h-8 rounded-full bg-blue text-white text-sm2 font-bold grid place-items-center">
        {(user?.email ?? '?').slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-surface text-text rounded shadow-cardHover py-1.5 z-20">
          <div className="px-3.5 py-1.5 text-sm2 text-muted truncate border-b border-line mb-1">{user?.email ?? 'Not signed in'}</div>
          <Link to="/me" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3.5 py-1.5 text-sm2 font-semibold hover:bg-blue-pale">
            <UserCircle size={15} /> Profile
          </Link>
          <button onClick={toggle} className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-sm2 font-semibold hover:bg-blue-pale text-left">
            <Moon size={15} /> {dark ? 'Light mode' : 'Dark mode'}
          </button>

          {/* Brand and dark mode are independent — picking a brand must not cost someone their
              dark mode, and every brand has to look right in both. */}
          <div className="px-3.5 pt-2 pb-1.5 mt-1 border-t border-line">
            <div className="text-2xs font-bold uppercase tracking-[.05em] text-muted mb-1.5">Accent</div>
            <div className="flex items-center gap-1.5">
              {BRANDS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBrand(b.id)}
                  aria-pressed={brand === b.id}
                  title={`${b.label} accent`}
                  className={clsx(
                    'flex items-center gap-1.5 text-2xs font-semibold rounded pl-1.5 pr-2 py-1 transition-colors',
                    brand === b.id ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2',
                  )}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]"
                    style={{ background: b.swatch }}
                  />
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => signOut()} className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-sm2 font-semibold hover:bg-red-light text-red text-left">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const AREAS = [
  { to: '/admin', label: 'Administration', icon: ShieldCheck, roles: ['program_admin'] as RoleId[] },
  { to: '/projects', label: 'Migration Project', icon: Layers, roles: null },
  { to: '/status', label: 'Migration Status', icon: Activity, roles: ['program_admin', 'cab'] as RoleId[] },
];

/** Longest-prefix match, so /library/fmds still reads as Library. Anything under a program is the
 * migration work itself, which is what Migration Project leads to. */
function currentArea(pathname: string) {
  if (pathname.startsWith('/pg/')) return AREAS[1];
  return [...AREAS].sort((a, b) => b.to.length - a.to.length)
    .find((a) => pathname === a.to || pathname.startsWith(a.to + '/'));
}

/** Where you are, and how to go somewhere else — one control.
 *
 * It used to be a bare grid icon with a chevron: it named nothing, so it could not tell you where
 * you were, and gave no clue what it would do. Between it, the 'Home' row inside it, the breadcrumb's
 * own 'Home', and the DMS wordmark in the sidebar, the app offered four ways back with nothing to
 * connect them.
 *
 * Now it shows the area you are in. Home is the sidebar wordmark and the breadcrumb — this control
 * is for moving sideways. */
function AppSwitcher() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { data: memberships = [] } = useMyMemberships();
  const ref = useDismiss(open, () => setOpen(false));

  const areas = AREAS.filter((a) => (
    a.roles === null
      ? memberships.length > 0
      : a.roles.some((r) => memberships.some((m) => m.roleId === r && (r !== 'program_admin' || !m.subprojectId)))
  ));
  const here = currentArea(pathname);
  const Icon = here?.icon ?? LayoutGrid;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={here ? `Current area: ${here.label}. Switch area` : 'Switch area'}
        aria-expanded={open}
        className="flex items-center gap-2 rounded px-2.5 py-1.5 hover:bg-chrome-hover text-sm2 font-semibold"
      >
        <Icon size={15} className="text-chrome-muted shrink-0" />
        <span className="truncate max-w-[180px]">{here?.label ?? 'Home'}</span>
        <ChevronDown size={13} className="text-chrome-muted shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-60 bg-surface text-text rounded shadow-cardHover py-1.5 z-20">
          {areas.map((a) => {
            const active = a.to === here?.to;
            return (
              <Link
                key={a.to} to={a.to} onClick={() => setOpen(false)}
                className={clsx(
                  'flex items-center gap-2.5 px-3.5 py-1.5 text-sm2 font-semibold',
                  active ? 'bg-blue-light text-blue-deep' : 'text-text hover:bg-blue-pale',
                )}
              >
                <a.icon size={15} className={active ? 'text-blue-deep' : 'text-muted'} /> {a.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The role you hold RIGHT HERE.
 *
 * A person is a functional consultant on one subproject and an ETL developer on another, and the
 * app resolved that correctly but never said so — which left the one thing nobody could check: which
 * hat am I wearing on this screen. It re-resolves as you move, so switching subproject visibly
 * changes it rather than silently changing what you're allowed to do. */
function RolePill() {
  const { programId, subprojectId } = useParams();
  const { data: role } = useCurrentRole(programId, subprojectId);
  if (!programId || !role || role === 'guest') return null;
  return (
    <span
      className="text-2xs font-semibold text-chrome-muted bg-chrome-hover rounded-pill px-2.5 py-1 shrink-0"
      title={subprojectId
        ? 'Your role on this subproject. It can differ on another one.'
        : 'Your role on this program.'}
    >
      {role.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
    </span>
  );
}

/** Search and a notifications bell once lived here as non-functional markup — an input with no
 * onChange and a button with no onClick — and were removed rather than left in place: a control
 * that ignores you in the most prominent strip of the app teaches people the chrome can't be
 * trusted. Search is back because it now has behaviour behind it. The bell is still absent, and
 * stays absent until it does too.
 *
 * `launchpad` drops everything that describes a subproject, because above the program level there
 * isn't one. */
export function HeaderBar({ variant = 'full' }: { variant?: 'full' | 'launchpad' }) {
  const { programId } = useParams();
  return (
    <header className="h-14 shrink-0 border-b border-chrome-line bg-chrome text-chrome-text flex items-center gap-3 px-5">
      {/* Both are launchpad-only. Inside a subproject you are working, and the areas are places
          you choose from home — offering them mid-task invites people to wander out of the
          context they just spent four clicks getting into. The DMS wordmark in the sidebar is
          the way back, and it is the one control every application already trains people on. */}
      {variant === 'launchpad' && (
        <>
          <Link to="/" className="font-bold text-xl truncate hover:opacity-80 transition-opacity shrink-0" title="Home">
            DMS
          </Link>
          <AppSwitcher />
        </>
      )}
      {/* The switcher CHANGES context; that's the only context job this bar has. The breadcrumb
          reports where you are, which belongs with the thing it describes — it sits above the page
          title now. Side by side up here the two restated the same project and subproject names, and
          the trail had to truncate to fit beside a control that was already showing its first half.
          Above the program level there is no subproject to switch, so it isn't rendered at all. */}
      {variant === 'full' && programId && (
        <>
          <SubprojectSwitcher />
          <RolePill />
        </>
      )}
      <div className="flex-1 min-w-0" />
      {variant === 'full' && <GlobalSearch />}
      <EnvPill />
      <AvatarMenu />
    </header>
  );
}

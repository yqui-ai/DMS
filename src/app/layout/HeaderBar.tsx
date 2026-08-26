import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronDown, UserCircle, Moon, LogOut, Layers } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { usePrograms, useProjects, useSubproject, useSubprojects, useProject } from '../../lib/queries/programme';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { Breadcrumb } from './Breadcrumb';
import type { Env } from '../../types/entities';

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
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx('px-2.5 py-1 rounded-pill text-2xs font-bold flex items-center gap-1', ENV_CLASSES[env])}
      >
        {env}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-32 bg-surface rounded-[8px] shadow-cardHover py-1 z-20">
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

function SubprojectSwitcher() {
  const { programId, subprojectId } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: programs = [] } = usePrograms();
  const { data: projects = [] } = useProjects(programId);
  const { data: subprojects = [] } = useSubprojects(projects.map((r) => r.id));
  const { data: subproject } = useSubproject(subprojectId);
  const { data: project } = useProject(subproject?.projectId);

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-sm2 font-semibold hover:bg-blue-pale rounded-[8px] px-2 py-1.5">
        <Layers size={14} className="text-muted" />
        <span className="truncate max-w-[220px]">
          {project && subproject ? <>{project.name} <span className="text-muted font-normal">›</span> {subproject.name}</> : 'Pick a subproject'}
        </span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-72 bg-surface rounded-[8px] shadow-cardHover py-2 z-20 max-h-96 overflow-auto">
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
          <Link to="/" onClick={() => setOpen(false)} className="block px-3.5 py-1.5 mt-1 text-sm2 font-semibold text-blue hover:bg-blue-pale">
            Program configuration
          </Link>
        </div>
      )}
    </div>
  );
}

function AvatarMenu() {
  const { user, signOut } = useAuth();
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="w-8 h-8 rounded-full bg-blue text-white text-sm2 font-bold grid place-items-center">
        {(user?.email ?? '?').slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-surface rounded-[8px] shadow-cardHover py-1.5 z-20">
          <div className="px-3.5 py-1.5 text-sm2 text-muted truncate border-b border-line mb-1">{user?.email ?? 'Not signed in'}</div>
          <Link to="/me" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3.5 py-1.5 text-sm2 font-semibold hover:bg-blue-pale">
            <UserCircle size={15} /> Profile
          </Link>
          <button onClick={toggle} className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-sm2 font-semibold hover:bg-blue-pale text-left">
            <Moon size={15} /> {dark ? 'Light mode' : 'Dark mode'}
          </button>
          <button onClick={() => signOut()} className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-sm2 font-semibold hover:bg-red-light text-red text-left">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Global search and a notifications bell used to live here as non-functional markup — an input
 * with no onChange and a button with no onClick. Both were removed rather than left in place:
 * a control that ignores you in the most prominent strip of the app teaches people the chrome
 * can't be trusted, which makes the working controls feel unreliable too. Reinstate them when
 * they have behaviour behind them, not before. */
export function HeaderBar() {
  return (
    <header className="h-14 shrink-0 border-b border-line bg-surface flex items-center gap-3 px-5">
      {/* Switcher changes context; breadcrumb reports it and walks back up. Two different jobs, so
          they stay separate controls rather than one overloaded dropdown. */}
      <SubprojectSwitcher />
      <div className="h-5 w-px bg-line shrink-0" aria-hidden />
      <Breadcrumb />
      <div className="flex-1 min-w-0" />
      <EnvPill />
      <AvatarMenu />
    </header>
  );
}

import { useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { HeaderBar } from './HeaderBar';
import { Breadcrumb } from './Breadcrumb';
import { useAuth } from '../../lib/auth';
import { LoginPage } from '../../features/auth/LoginPage';

/** Signed-in or nothing. Shared by both shells so the launchpad can't become a way in. */
function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen w-screen grid place-items-center bg-bg text-muted text-sm2">Loading…</div>;
  }
  if (!user) return <LoginPage />;
  return <>{children}</>;
}

/** The launchpad and the areas directly under it: header, and nothing else.
 *
 * No sidebar and no breadcrumb, because neither has anything to say yet — the sidebar navigates
 * within a subproject and the breadcrumb reports a position inside one. Rendering them empty above
 * a screen whose whole job is "choose where you're going" is chrome describing nothing. */
export function LaunchpadShell() {
  return (
    <AuthGate>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg text-text">
        <HeaderBar variant="launchpad" />
        <main className="flex-1 overflow-auto px-[22px] py-[22px] md:px-[26px] md:py-[26px]">
          {/* Library standalone lives here now, and it is two levels deep — it still needs the
              way back. Renders nothing on the areas that are their own root. */}
          <Breadcrumb />
          <Outlet />
        </main>
      </div>
    </AuthGate>
  );
}

/** Inside a program: the full working chrome. */
export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <AuthGate>
      <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <div className="flex-1 flex flex-col min-w-0">
          <HeaderBar />
          {/* flex column so a screen can opt into filling the viewport instead of growing the
              page. Everything that does not opt in still flows and scrolls exactly as before. */}
          <main className="flex-1 overflow-auto px-[22px] py-[22px] md:px-[26px] md:py-[26px] flex flex-col">
            {/* Above the page title rather than in the header bar: a trail reads as the approach to
                the thing it names, and it gets the full content width here instead of competing with
                the switcher for a strip that also holds the environment and account controls.
                Rendered here, not inside PageHeader, because the tabbed sections build their own
                title block and would otherwise be the only screens without one. */}
            <Breadcrumb />
            <Outlet />
          </main>
        </div>
      </div>
    </AuthGate>
  );
}

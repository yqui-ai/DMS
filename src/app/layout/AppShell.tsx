import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { HeaderBar } from './HeaderBar';
import { useAuth } from '../../lib/auth';
import { LoginPage } from '../../features/auth/LoginPage';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen w-screen grid place-items-center bg-bg text-muted text-sm">Loading…</div>;
  }
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex-1 flex flex-col min-w-0">
        <HeaderBar />
        <main className="flex-1 overflow-auto px-[22px] py-[22px] md:px-[26px] md:py-[26px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

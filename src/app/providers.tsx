import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../lib/auth';
import { ToastProvider } from '../components/Toast';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function ThemeInit() {
  useEffect(() => {
    const stored = localStorage.getItem('dms-theme');
    if (stored === 'dark') document.documentElement.classList.add('dark');
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <ThemeInit />
          {children}
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

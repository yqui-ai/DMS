import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../lib/auth';
import { ToastProvider } from '../components/Toast';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

/* Theme restoration moved to an inline script in index.html — see the comment there. Doing it in
   an effect meant it ran after the first paint, so a dark-theme user saw a white flash on every
   load. Both keys ('dms-theme', 'dms-brand') are still written from the settings UI as before;
   only the point at which they are READ changed. */

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

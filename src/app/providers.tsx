import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../lib/auth';
import { ToastProvider } from '../components/Toast';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function ThemeInit() {
  useEffect(() => {
    if (localStorage.getItem('dms-theme') === 'dark') document.documentElement.classList.add('dark');
    // Restored the same way and independently — a brand choice survives a reload whether or not
    // dark mode is on. `default` writes no attribute, so `:root` applies unmodified.
    const brand = localStorage.getItem('dms-brand');
    if (brand && brand !== 'default') document.documentElement.dataset.brand = brand;
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

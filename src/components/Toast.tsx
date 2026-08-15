import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import clsx from 'clsx';

type ToastKind = 'info' | 'success' | 'error';
interface ToastItem { id: number; kind: ToastKind; message: string }

const ToastContext = createContext<((kind: ToastKind, message: string) => void) | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setItems((cur) => [...cur, { id, kind, message }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'rounded-lg shadow-cardHover px-4 py-3 text-base font-semibold min-w-[240px] max-w-sm',
              t.kind === 'success' && 'bg-green text-white',
              t.kind === 'error' && 'bg-red text-white',
              t.kind === 'info' && 'bg-ink text-white',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast must be used within ToastProvider');
  return {
    info: (message: string) => push('info', message),
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
  };
}

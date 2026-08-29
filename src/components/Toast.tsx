import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import clsx from 'clsx';

type ToastKind = 'info' | 'success' | 'error';
export interface ToastAction { label: string; onClick: () => void }
interface ToastItem { id: number; kind: ToastKind; message: string; action?: ToastAction }

const ToastContext = createContext<((kind: ToastKind, message: string, action?: ToastAction) => void) | null>(null);

let nextId = 1;

const KIND_META: Record<ToastKind, { icon: typeof CheckCircle2; iconColor: string; bar: string }> = {
  success: { icon: CheckCircle2, iconColor: 'text-green', bar: 'bg-green' },
  error: { icon: XCircle, iconColor: 'text-red', bar: 'bg-red' },
  info: { icon: Info, iconColor: 'text-blue', bar: 'bg-blue' },
};

/** Modern toast: white card, colored left accent + icon, dark text, optional action link (e.g.
 * "View FMD" after a generate/save), dismiss button. Toasts with an action stay a bit longer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), []);

  const push = useCallback((kind: ToastKind, message: string, action?: ToastAction) => {
    const id = nextId++;
    setItems((cur) => [...cur, { id, kind, message, action }]);
    setTimeout(() => dismiss(id), action ? 6000 : 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Toasts are the app's whole feedback channel — every save, publish, export and failure
          reports here and nowhere else. Without a live region a screen-reader user gets silence
          after every action, with no way to tell a success from an error.

          `polite` and not `assertive`: a confirmation should wait for a gap rather than cut across
          what someone is reading. The region is rendered permanently and empty, because a live
          region announces changes to its contents — one mounted at the same moment as the message
          usually announces nothing at all.

          `aria-atomic="false"` so an arriving toast is read on its own instead of re-reading every
          toast still on screen. */}
      <div
        role="status" aria-live="polite" aria-atomic="false"
        className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2.5"
      >
        {items.map((t) => {
          const meta = KIND_META[t.kind];
          const Icon = meta.icon;
          return (
            <div key={t.id} className="relative flex items-start gap-2.5 bg-surface rounded-lg shadow-cardHover pl-3.5 pr-8 py-3 min-w-[280px] max-w-sm overflow-hidden">
              <span className={clsx('absolute left-0 top-0 bottom-0 w-[3px]', meta.bar)} />
              <Icon size={17} className={clsx('shrink-0 mt-0.5', meta.iconColor)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm2 font-semibold text-text">{t.message}</p>
                {t.action && (
                  <button
                    onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                    className="text-sm2 font-semibold text-blue hover:underline mt-1"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="absolute right-2 top-2 text-muted hover:text-text p-0.5 rounded hover:bg-blue-pale">
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast must be used within ToastProvider');
  return {
    info: (message: string, action?: ToastAction) => push('info', message, action),
    success: (message: string, action?: ToastAction) => push('success', message, action),
    error: (message: string, action?: ToastAction) => push('error', message, action),
  };
}

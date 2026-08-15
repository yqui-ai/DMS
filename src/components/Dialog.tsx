import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ArrowLeft, X } from 'lucide-react';

export type DialogSize = 'sm' | 'md' | 'lg' | 'win';

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'w-[440px]', md: 'w-[640px]', lg: 'w-[960px]', win: 'w-[94vw] h-[94vh]',
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: DialogSize;
  children: ReactNode;
  footer?: ReactNode;
  /** Shows a back arrow before the title when provided — for dialogs that navigate within themselves. */
  onBack?: () => void;
}

export function Dialog({ open, onClose, title, size = 'md', children, footer, onBack }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className={clsx('bg-surface rounded-lg shadow-cardHover flex flex-col max-h-full', SIZE_CLASSES[size])}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-line">
          {onBack && (
            <button onClick={onBack} aria-label="Back" className="text-muted hover:text-text p-1 -ml-1 rounded hover:bg-blue-pale shrink-0">
              <ArrowLeft size={18} />
            </button>
          )}
          <h2 className="text-lg font-bold text-text flex-1 min-w-0 truncate">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-text p-1 rounded hover:bg-blue-pale shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-line flex items-center justify-end gap-2.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

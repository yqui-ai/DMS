import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

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
}

export function Dialog({ open, onClose, title, size = 'md', children, footer }: DialogProps) {
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-bold text-text">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-text p-1 rounded hover:bg-blue-pale">
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

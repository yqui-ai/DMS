import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ArrowLeft, Sparkles, X } from 'lucide-react';

export type DialogSize = 'sm' | 'md' | 'lg' | 'win';
export type DialogVariant = 'default' | 'ai';

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'w-[440px]', md: 'w-[640px]', lg: 'w-[960px]', win: 'w-[94vw] h-[94vh]',
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small muted line shown right under the title — e.g. who created/last changed the record. */
  subtitle?: ReactNode;
  size?: DialogSize;
  children: ReactNode;
  footer?: ReactNode;
  /** Shows a back arrow before the title when provided — for dialogs that navigate within themselves. */
  onBack?: () => void;
  /** Rendered in the title bar itself, between the title and the close button — vertically centered
   * with both by virtue of sharing their flex row, so a primary action here never needs its own
   * cross-row alignment math against tabs/content below it. */
  headerActions?: ReactNode;
  /** 'ai' swaps the plain card for a saturated light-blue-to-purple gradient border + an
   * "AI-Assisted" badge next to the title — for dialogs whose whole purpose is an AI action (a
   * conversion, a suggestion), so that's visually obvious before anyone even reads the copy. */
  variant?: DialogVariant;
  /** With variant="ai", swaps the static gradient border for one that visibly sweeps around the
   * card — set while an AI call is actually in flight, so there's a constant "still working" cue
   * beyond whatever text/spinner is in the body, and it stops the moment the operation resolves. */
  processing?: boolean;
}

export function Dialog({ open, onClose, title, subtitle, size = 'md', children, footer, onBack, headerActions, variant = 'default', processing = false }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const isAi = variant === 'ai';

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className={clsx(
          'rounded-lg flex flex-col max-h-full shadow-cardHover',
          SIZE_CLASSES[size],
          isAi && 'p-[1.5px]',
          isAi && (processing ? 'ai-border-processing' : 'bg-gradient-to-br from-[#3b82f6] via-[#8b5cf6] to-[#a855f7]'),
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="bg-surface rounded-[7px] flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-line">
            {onBack && (
              <button onClick={onBack} aria-label="Back" className="text-muted hover:text-text p-1 -ml-1 rounded hover:bg-blue-pale shrink-0">
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-text truncate">{title}</h2>
              {subtitle && <div className="text-2xs text-muted truncate mt-0.5">{subtitle}</div>}
            </div>
            {isAi && (
              <span className="hidden sm:inline-flex items-center gap-1 text-2xs font-bold px-2 py-0.5 rounded-pill bg-gradient-to-r from-[#eff6ff] to-[#faf5ff] text-[#7c3aed] shrink-0">
                <Sparkles size={11} /> AI-Assisted
              </span>
            )}
            {headerActions}
            <button onClick={onClose} aria-label="Close" className="text-muted hover:text-text p-1 rounded hover:bg-blue-pale shrink-0">
              <X size={18} />
            </button>
          </div>
          <div className="px-5 py-4 overflow-auto flex-1">{children}</div>
          {footer && <div className="px-5 py-3.5 border-t border-line flex items-center justify-end gap-2.5">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  /** When set, closing the dialog (X, backdrop or Escape) asks first instead of discarding. Pass
   * the reason — e.g. "You have unsaved changes to the Golden FMD." — and pass undefined once the
   * form is clean, so a dialog with nothing to lose still closes in one click. Living here rather
   * than in each dialog means every form gets the guard for free and none can forget it. */
  unsavedWarning?: string;
}

/** Every currently-open dialog, in the order they opened. Dialogs nest (a composer inside a viewer,
 * a save prompt inside a designer), and previously each one attached its own document-level Escape
 * listener with no idea whether it was on top — so one Escape closed the composer AND the viewer
 * behind it, discarding the version and tab you were on. Only the last entry here reacts. */
const openDialogs: symbol[] = [];

export function Dialog({ open, onClose, title, subtitle, size = 'md', children, footer, onBack, headerActions, variant = 'default', processing = false, unsavedWarning }: DialogProps) {
  const idRef = useRef<symbol>(undefined as unknown as symbol);
  if (!idRef.current) idRef.current = Symbol('dialog');
  const [depth, setDepth] = useState(0);
  const [confirmingClose, setConfirmingClose] = useState(false);
  // Every close path funnels through here so the guard can't be bypassed by one of them.
  const requestClose = () => { if (unsavedWarning) setConfirmingClose(true); else onClose(); };

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    openDialogs.push(id);
    setDepth(openDialogs.length - 1);
    const onKey = (e: KeyboardEvent) => {
      // Topmost only. Also stop the event so a parent dialog can't act on it either.
      if (e.key !== 'Escape' || openDialogs[openDialogs.length - 1] !== id) return;
      e.stopPropagation();
      requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = openDialogs.indexOf(id);
      if (i >= 0) openDialogs.splice(i, 1);
    };
  }, [open, onClose, unsavedWarning]);

  if (!open) return null;
  const isAi = variant === 'ai';
  // Stacking follows nesting depth rather than DOM insertion order, which is what decided it before.
  const z = 900 + depth * 10;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" style={{ zIndex: z }} onMouseDown={requestClose}>
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
              <h2 className="text-xl font-semibold text-text truncate">{title}</h2>
              {subtitle && <div className="text-2xs text-muted truncate mt-0.5">{subtitle}</div>}
            </div>
            {isAi && (
              <span className="hidden sm:inline-flex items-center gap-1 text-2xs font-bold px-2 py-0.5 rounded-pill bg-gradient-to-r from-[#eff6ff] to-[#faf5ff] text-[#7c3aed] shrink-0">
                <Sparkles size={11} /> AI-Assisted
              </span>
            )}
            {headerActions}
            <button onClick={requestClose} aria-label="Close" className="text-muted hover:text-text p-1 rounded hover:bg-blue-pale shrink-0">
              <X size={18} />
            </button>
          </div>
          {/* min-h-0 is load-bearing: a flex item defaults to min-height:auto, so without it this
              body grows to fit its content instead of shrinking, overflow-auto never has anything
              to scroll, and the panel's max-h-full simply clips the overflow. Tall dialogs then
              lose their bottom with no scrollbar — which is what happened to the Historical FMD
              comparison. */}
          <div className="px-5 py-4 overflow-auto flex-1 min-h-0">{children}</div>
          {footer && <div className="px-5 py-3.5 border-t border-line flex items-center justify-end gap-2.5">{footer}</div>}
        </div>
      </div>
      {confirmingClose && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" style={{ zIndex: z + 5 }} onMouseDown={() => setConfirmingClose(false)}>
          <div className="w-[400px] bg-surface rounded-lg shadow-cardHover p-5" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="text-md font-semibold text-text mb-1.5">Discard unsaved changes?</h3>
            <p className="text-sm2 text-muted mb-4">{unsavedWarning}</p>
            <div className="flex items-center justify-end gap-2.5">
              <button onClick={() => setConfirmingClose(false)} className="text-sm2 font-semibold px-4 py-[9px] rounded-[8px] bg-surface text-text shadow-[inset_0_0_0_1px_var(--line)] hover:bg-blue-pale">
                Keep editing
              </button>
              <button onClick={() => { setConfirmingClose(false); onClose(); }} className="text-sm2 font-semibold px-4 py-[9px] rounded-[8px] text-red hover:bg-red-light">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

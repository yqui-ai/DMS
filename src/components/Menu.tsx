import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import clsx from 'clsx';
import { useDismiss } from './useDismiss';

export interface MenuAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Renders in red — deletes, archives and anything else that takes work away. */
  danger?: boolean;
  disabled?: boolean;
  /** Why the item is disabled. A refused action that gives no reason is the thing people file
   * bugs about — a disabled item without this is usually a mistake. */
  title?: string;
}

const WIDTH = 184;
const MARGIN = 8;

/** An overflow menu: a `⋯` button and a list of actions.
 *
 * Rendered in a **portal** with fixed positioning, not as an absolutely-positioned child. A menu
 * inside the tree is at the mercy of every ancestor: the program cards on Migration Project carry
 * `overflow-hidden` for their rounded corners, which silently cut the last item off every menu in
 * them. A portal has no ancestors to be clipped by.
 *
 * It also flips above the trigger when there isn't room below, so a menu on the last row of a long
 * page opens upward instead of off the bottom of the screen.
 *
 * Dismissal is built in rather than left to the caller — see the `app-guards` skill for why. */
export function Menu({ actions, label = 'More actions', align = 'right', className }: {
  actions: MenuAction[];
  label?: string;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false), panelRef);

  // Positioned after layout but before paint, so the menu never appears in the wrong place first.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const height = actions.length * 32 + 8;
      const below = window.innerHeight - r.bottom;
      setPos({
        top: below < height + MARGIN && r.top > height + MARGIN ? r.top - height - 4 : r.bottom + 4,
        left: align === 'right'
          ? Math.max(MARGIN, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - MARGIN))
          : Math.max(MARGIN, Math.min(r.left, window.innerWidth - WIDTH - MARGIN)),
      });
    };
    place();
    // A fixed-position menu does not travel with its trigger, so it closes rather than detaching.
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, actions.length, align]);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        className={clsx(
          'w-7 h-7 grid place-items-center rounded transition-colors',
          open ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2 hover:text-text',
        )}
      >
        <MoreHorizontal size={15} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: WIDTH }}
          className="bg-surface rounded shadow-cardHover py-1 z-[60]"
        >
          {actions.map((a) => (
            // A disabled <button> swallows pointer events, so its own `title` never appears. The
            // wrapper is what carries the tooltip — which is the whole point of disabling rather
            // than hiding: the reason is the useful part.
            <span key={a.key} title={a.title} className={clsx('block', a.disabled && 'cursor-not-allowed')}>
              <button
                role="menuitem"
                disabled={a.disabled}
                onClick={() => { setOpen(false); a.onSelect(); }}
                className={clsx(
                  'w-full text-left px-3 py-1.5 text-sm2 font-semibold flex items-center gap-2.5 disabled:opacity-40 disabled:pointer-events-none',
                  a.danger ? 'text-red hover:bg-red-light' : 'hover:bg-blue-pale',
                )}
              >
                {a.icon}
                {a.label}
              </button>
            </span>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

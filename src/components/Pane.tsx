import type { ReactNode } from 'react';
import clsx from 'clsx';

/** A titled panel: outline, header strip, scrolling body. Every side-by-side pane uses this so
 * their headers line up — before it, three panes sitting in one row each drew their own header with
 * different padding and only one of them had a divider, so the titles didn't share a baseline.
 *
 * `actions` sits at the right of the header (counts, filters, a toggle) and shares the header's
 * vertical centring, so it never needs its own alignment maths against the title. */
export function Pane({ title, actions, children, className, bodyClassName }: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Padding for the body. Omit for a flush list (rows draw their own dividers). */
  bodyClassName?: string;
}) {
  return (
    <div className={clsx('flex flex-col rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden min-h-0', className)}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line shrink-0 min-h-[32px]">
        <span className="text-2xs font-bold uppercase tracking-[.04em] text-muted shrink-0">{title}</span>
        {actions && <div className="flex items-center gap-1.5 flex-wrap min-w-0">{actions}</div>}
      </div>
      <div className={clsx('flex-1 min-h-0 overflow-auto', bodyClassName)}>{children}</div>
    </div>
  );
}

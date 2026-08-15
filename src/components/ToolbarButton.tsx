import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

/** Toolbar-row action button — neutral surface, subtle border + shadow, icon and text turn blue
 * on hover/focus. Same height as the search box and filter dropdowns beside it. Kept deliberately
 * quiet (no fill color) so it doesn't compete with real status/semantic color elsewhere in the UI. */
export function ToolbarButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        'flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-[8px] shrink-0',
        'bg-surface text-text border border-[#e2e5ea] shadow-[0_1px_2px_rgba(22,28,40,.04)]',
        'hover:text-blue hover:border-blue-mid/40 hover:shadow-[0_2px_6px_rgba(10,79,140,.08)]',
        'disabled:opacity-50 disabled:pointer-events-none transition-all',
        className,
      )}
      {...props}
    />
  );
}

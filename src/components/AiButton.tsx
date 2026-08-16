import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

/** Standard visual treatment for any AI-triggered action — a saturated light-blue-to-purple
 * gradient fill, used consistently wherever a button specifically means "this uses AI" (as
 * opposed to ToolbarButton's deliberately neutral default, or Button's plain primary). Same sizing
 * as ToolbarButton so it drops into the same toolbar rows; pairs with Dialog's variant="ai". */
export function AiButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        'flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-[8px] shrink-0 text-white',
        'bg-gradient-to-r from-[#3b82f6] to-[#a855f7] border border-[#a855f7]/40',
        'shadow-[0_1px_3px_rgba(168,85,247,.3)] hover:brightness-110 hover:shadow-[0_2px_10px_rgba(168,85,247,.4)]',
        'disabled:opacity-50 disabled:pointer-events-none transition-all',
        className,
      )}
      {...props}
    />
  );
}

import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'ghost' | 'dangerGhost' | 'ai';
export type ButtonSize = 'sm' | 'md';

/** One button, four jobs. This replaced three separate components — `ToolbarButton`, `AiButton` and
 * `GoldenToggle` — which between them had three different heights and two type sizes, and which sat
 * side by side in the same toolbar rows. The row couldn't align because the components didn't agree,
 * so alignment is now a property of the size scale rather than of each caller's discipline.
 *
 * Size is the whole story on height: `sm` matches the toolbar controls (search, filters), `md` is
 * for dialog footers and forms. Never override padding or text size at the call site — that's how
 * the drift started. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-blue text-white hover:bg-blue-deep',
  secondary: 'bg-surface text-text shadow-[inset_0_0_0_1px_var(--line)] hover:bg-blue-pale',
  /** Toolbar default — a neutral surface that stays out of the way, so semantic colour elsewhere
   * in the row keeps its meaning. */
  quiet: 'bg-surface text-text border border-line-strong shadow-[0_1px_2px_rgba(22,28,40,.04)] hover:text-blue hover:border-blue-mid/40',
  ghost: 'text-blue hover:bg-blue-light',
  dangerGhost: 'text-red hover:bg-red-light',
  /** Reserved for actions that actually invoke AI — pairs with Dialog's variant="ai". */
  ai: 'text-white bg-gradient-to-r from-[#3b82f6] to-[#a855f7] border border-[#a855f7]/40 shadow-[0_1px_3px_rgba(168,85,247,.3)] hover:brightness-110',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-sm2 px-2.5 py-1.5 gap-1.5',
  md: 'text-sm2 px-4 py-[9px] gap-[7px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center font-semibold rounded shrink-0 whitespace-nowrap',
        'disabled:opacity-50 disabled:pointer-events-none transition-all',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}

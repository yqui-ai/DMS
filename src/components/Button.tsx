import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dangerGhost';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-blue text-white hover:bg-blue-deep px-4 py-[9px]',
  secondary: 'bg-surface text-text shadow-[inset_0_0_0_1px_var(--line)] hover:bg-blue-pale px-4 py-[9px]',
  ghost: 'text-blue px-2 py-1.5 hover:bg-blue-light',
  dangerGhost: 'text-red px-2 py-1.5 hover:bg-red-light',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'secondary', className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-[7px] font-semibold text-base rounded-[8px]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-mid focus-visible:outline-offset-1',
        'disabled:opacity-50 disabled:pointer-events-none transition-colors',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}

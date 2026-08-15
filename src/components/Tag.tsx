import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

export type TagVariant = 'accent' | 'neutral' | 'warn' | 'danger' | 'table' | 'connection' | 'column' | 'rule' | 'variable';

const VARIANT_CLASSES: Record<TagVariant, string> = {
  accent: 'bg-blue-light text-blue-deep',
  neutral: 'bg-neutralTag-bg text-neutralTag-ink',
  warn: 'bg-amber-bg text-amber-ink',
  danger: 'bg-red-light text-red-ink',
  // technical identifiers — always monospace + bold
  table: 'bg-blue-light text-blue font-mono font-bold',
  connection: 'bg-violet-bg text-violet-deep font-mono font-bold',
  column: 'bg-teal-bg text-teal font-mono font-bold',
  rule: 'bg-green-bg text-green font-mono font-bold',
  variable: 'bg-amber-bg text-amber-ink font-mono font-bold',
};

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
  icon?: ReactNode;
}

export function Tag({ variant = 'neutral', icon, className, children, ...props }: TagProps) {
  return (
    <span
      className={clsx('inline-flex items-center gap-[5px] text-xs font-semibold px-2.5 py-[3px] rounded-pill', VARIANT_CLASSES[variant], className)}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

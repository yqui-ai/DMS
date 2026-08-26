import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

export type TagVariant = 'accent' | 'neutral' | 'warn' | 'danger' | 'success' | 'table' | 'connection' | 'column' | 'rule' | 'variable';

const VARIANT_CLASSES: Record<TagVariant, string> = {
  accent: 'bg-blue-light text-blue-deep',
  neutral: 'bg-neutralTag-bg text-neutralTag-ink',
  warn: 'bg-amber-bg text-amber-ink',
  danger: 'bg-red-light text-red-ink',
  /** Something good and recent — a freshly published version. Distinct from `rule`, which is also
   * green but monospaced+bold for technical identifiers. */
  success: 'bg-green-bg text-green',
  // technical identifiers — always monospace + bold
  table: 'bg-blue-light text-blue font-mono font-bold',
  connection: 'bg-violet-bg text-violet-deep font-mono font-bold',
  column: 'bg-teal-bg text-teal font-mono font-bold',
  rule: 'bg-green-bg text-green font-mono font-bold',
  variable: 'bg-amber-bg text-amber-ink font-mono font-bold',
};

/** `sm` is for tags that annotate a value rather than label a record — "Outdated" next to a version
 * number, "New" next to a name. At the default size those read as a second column competing with
 * the data; at `sm` they sit quietly beside it and are still perfectly legible. */
const SIZE_CLASSES = {
  sm: 'text-2xs px-1.5 py-[1px] gap-1',
  md: 'text-2xs font-semibold px-2.5 py-[3px] gap-[5px]',
} as const;

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
  size?: keyof typeof SIZE_CLASSES;
  icon?: ReactNode;
}

export function Tag({ variant = 'neutral', size = 'md', icon, className, children, ...props }: TagProps) {
  return (
    <span
      className={clsx('inline-flex items-center rounded-pill', SIZE_CLASSES[size], VARIANT_CLASSES[variant], className)}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

import type { ReactNode } from 'react';
import clsx from 'clsx';

/** A one-of-N choice rendered inline — review-point category, status filter, view tab. Distinct
 * from `Button` (which performs an action) and from `Select` (which hides its options): use this
 * when the options are few, worth seeing at a glance, and switching between them is cheap.
 *
 * Existed as three different hand-rolled pill groups before — different paddings, different
 * selected treatments, one with a rounded-pill and one with a square. They now share one shape,
 * which is what makes them read as the same control in different places. */
export function Segmented<T extends string>({ options, value, onChange, className }: {
  options: readonly { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx('inline-flex items-center gap-0.5 bg-surface-2 rounded p-0.5', className)} role="group">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.title}
          aria-pressed={value === o.value}
          className={clsx(
            'flex items-center gap-1.5 text-sm2 font-semibold px-2.5 py-1 rounded whitespace-nowrap transition-colors',
            value === o.value
              ? 'bg-surface text-text shadow-[0_1px_2px_rgba(22,28,40,.08)]'
              : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

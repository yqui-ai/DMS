import type { SelectHTMLAttributes } from 'react';
import clsx from 'clsx';

/** The only styled `<select>` in the app. Sizes match `Button` exactly — `sm` for toolbar rows,
 * `md` for forms — because a select sitting beside a button at a different height is the most
 * common way a row stops aligning.
 *
 * Before this existed there were six different paddings across the codebase (`px-[11px] py-2`,
 * `px-2 py-1`, `px-2.5 py-1.5`, `px-2 py-1.5`, …) and the FMD version picker had invented its own
 * blue fill, so it read as a different kind of control from the buttons next to it. Don't override
 * padding, height or text size at a call site. */
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Named sizes, matching Button. Omits the native `size` attribute (a row count), which this
   * shadows deliberately — no caller in this app wants a multi-row list box. */
  size?: 'sm' | 'md';
  /** Technical values (version strings, structure idents) read better monospaced. */
  mono?: boolean;
  /** Renders like an inactive toolbar filter — transparent until focused or set. Pass it when the
   * control sits in a toolbar row and is currently at its default value. */
  quiet?: boolean;
}

const SIZE_CLASSES = {
  sm: 'text-sm2 px-2.5 py-1.5',
  md: 'text-sm2 px-[11px] py-2 min-h-[38px]',
} as const;

export function Select({ size = 'md', mono = false, quiet = false, className, ...props }: SelectProps) {
  return (
    <select
      className={clsx(
        'text-text rounded border',
        'hover:border-blue-mid/40 disabled:opacity-50 disabled:pointer-events-none transition-colors',
        // Quiet matches an INACTIVE MultiSelectFilter: no border, no fill, muted text, so a toolbar
        // of controls recedes behind the data. A select sitting in that row with a permanent border
        // and a white fill reads as the loudest thing on the screen for no reason — it is doing the
        // same job as the filters beside it.
        quiet
          ? 'bg-transparent border-transparent text-muted hover:bg-surface-2 focus:bg-surface focus:border-line-strong'
          : 'bg-surface border-line-strong',
        SIZE_CLASSES[size],
        mono && 'font-mono',
        className,
      )}
      {...props}
    />
  );
}

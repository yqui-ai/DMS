import clsx from 'clsx';

/** One control that switches between Select all and Deselect all.
 *
 * Three screens showed both as separate buttons side by side, which asks the reader to work out
 * which one applies — and half of any such pair is always a no-op: "Select all" does nothing when
 * everything is already selected. One button that names the action available right now says more
 * in half the space, and matches how the FMD Draft tab already behaved.
 *
 * `allSelected` is the caller's own comparison, because only the caller knows what "all" means —
 * the whole list, or just the rows a filter left visible. */
export function SelectAllToggle({ allSelected, onSelectAll, onDeselectAll, className }: {
  allSelected: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={allSelected ? onDeselectAll : onSelectAll}
      className={clsx('text-2xs font-semibold text-blue hover:underline shrink-0', className)}
    >
      {allSelected ? 'Deselect all' : 'Select all'}
    </button>
  );
}

import { Check, Pencil } from 'lucide-react';
import clsx from 'clsx';

/** The one control that puts a row, section or grid into edit mode and takes it out again.
 *
 * **The icon changes with the state.** A pencil that stays a pencil while its row is full of open
 * inputs gives the reader nothing to click back — the way out of edit mode looked identical to the
 * way in, so the only signal that a row was editable at all was the inputs themselves.
 *
 * While editing it shows a **check, not a floppy disk**. Everywhere this is used the value is
 * already persisted — `PersonSelect` writes on change, grid cells write on blur — so a save icon
 * would promise an action that does not exist and imply the edit is unsaved until you click it.
 * A check says what the button does: finish. The tooltip says the rest.
 *
 * If a future surface genuinely defers its writes, that surface needs a real Save BUTTON with a
 * label and a disabled state, not this icon wearing a different glyph. */
export function EditToggle({ editing, onToggle, what, size = 14, className }: {
  editing: boolean;
  onToggle: () => void;
  /** What is being edited, for the tooltip and the accessible name: "consultant and ETL developer". */
  what: string;
  size?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={editing}
      title={editing ? `Done — changes to ${what} are already saved` : `Edit ${what}`}
      aria-label={editing ? `Finish editing ${what}` : `Edit ${what}`}
      className={clsx(
        'w-7 h-7 grid place-items-center rounded transition-colors',
        editing
          ? 'text-blue bg-blue-pale hover:bg-blue-light'
          : 'text-muted hover:bg-surface-2 hover:text-text',
        className,
      )}
    >
      {editing ? <Check size={size} /> : <Pencil size={size} />}
    </button>
  );
}

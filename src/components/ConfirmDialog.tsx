import { Dialog } from './Dialog';
import { Button } from './Button';

/** Confirmation for an action that is hard or impossible to undo. Deliberately NOT used for
 * ordinary saves — a confirm on every save trains people to dismiss confirms without reading them,
 * which is exactly what makes the one that matters ineffective. Reserve it for irreversible steps
 * (publishing a version, discarding unsaved work, deleting).
 *
 * The message should say what will happen, not ask "are you sure" — the button already asks. */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  destructive = false, busy = false, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as a warning — for discarding work or removing something. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open} onClose={onCancel} title={title} size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button
            variant={destructive ? 'secondary' : 'primary'}
            className={destructive ? 'text-red hover:bg-red-light' : undefined}
            onClick={onConfirm} disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm2 text-text">{message}</div>
    </Dialog>
  );
}

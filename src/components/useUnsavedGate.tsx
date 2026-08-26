import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

/** Guards transitions that are NOT route changes.
 *
 * `UnsavedChangesGuard` above only sees the router and the page unload. Most of the ways an edit
 * actually gets abandoned in this app are neither: switching tab inside a dialog, opening a
 * different field, closing the dialog. Those are plain state updates, so no navigation API can
 * intercept them — the transition itself has to ask.
 *
 * Wrap the handler: `onClick={gate(() => setTab('versions'))}`. When nothing is dirty the action
 * runs straight through, so the cost of guarding a control that is usually clean is one comparison.
 */
export function useUnsavedGate(dirty: boolean, what = 'Your changes') {
  const [pending, setPending] = useState<{ run: () => void } | null>(null);

  const gate = useCallback(
    (action: () => void) => () => {
      if (dirty) setPending({ run: action });
      else action();
    },
    [dirty],
  );

  // A dirty flag can clear while the question is on screen — the field saved on blur as the dialog
  // opened, say. Nothing left to discard, so stop asking and let the action through.
  useEffect(() => {
    if (!dirty && pending) {
      const { run } = pending;
      setPending(null);
      run();
    }
  }, [dirty, pending]);

  const dialog = (
    <ConfirmDialog
      open={!!pending}
      title="Discard unsaved changes?"
      confirmLabel="Discard"
      onCancel={() => setPending(null)}
      onConfirm={() => { const next = pending; setPending(null); next?.run(); }}
      message={<p>{what} haven’t been saved. Continuing discards them.</p>}
    />
  );

  return { gate, dialog };
}

import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from './ConfirmDialog';

/** Stops an in-progress edit from being thrown away by navigation.
 *
 * `Dialog`'s own `unsavedWarning` only covers closing that dialog — Escape, the X, a click outside.
 * It can't see the sidebar, the breadcrumb, browser Back, a reload, or the tab being closed, and
 * those are exactly the ways an edit actually gets lost: you look something up mid-sentence and the
 * sentence is gone when you come back.
 *
 * Two mechanisms, because one can't cover both cases:
 *  - `useBlocker` intercepts in-app route changes and asks properly, in the app's own dialog.
 *  - `beforeunload` covers leaving the site entirely. The browser shows its own generic wording
 *    there and ignores custom text — that's a deliberate anti-abuse rule, not something to work
 *    around, so the message below is for the in-app case only.
 *
 * Mount it wherever a component holds edits that aren't saved yet. Deliberately a component rather
 * than a hook: it renders a dialog, and a hook that renders is a hook that has to be threaded
 * through its caller's JSX anyway. */
export function UnsavedChangesGuard({ when, what = 'Your changes' }: {
  when: boolean;
  /** Names what would be lost, e.g. "This rule" — read as "<what> hasn't been saved yet." */
  what?: string;
}) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    when && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Assigning returnValue is what actually triggers the prompt in older engines; the text is
      // ignored by every current browser.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  // The blocker survives a `when` that flips false — after a save, say — so release it rather than
  // leaving a dialog asking about changes that no longer exist.
  useEffect(() => {
    if (!when && blocker.state === 'blocked') blocker.reset?.();
  }, [when, blocker]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Leave without saving?"
      confirmLabel="Leave"
      onCancel={() => blocker.reset?.()}
      onConfirm={() => blocker.proceed?.()}
      message={<p>{what} haven’t been saved. Leaving this screen discards them.</p>}
    />
  );
}

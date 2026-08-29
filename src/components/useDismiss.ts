import { useEffect, useRef } from 'react';

/** Closes a popover when you click outside it or press Escape.
 *
 * Every dropdown in the app used to answer this for itself, and most of them answered "no" — the
 * header's four (app switcher, subproject switcher, environment, avatar) stayed open until you
 * clicked the trigger again, so two could be open at once, overlapping. The three that did handle it
 * each hand-rolled the same effect, and only one of them handled Escape.
 *
 * `mousedown`, not `click`: a click fires after mouseup, so a menu closing on click would still be
 * open while the press lands on whatever is underneath — which is how a stray press activates the
 * thing behind the menu you were dismissing.
 *
 * Attach the returned ref to the element that contains BOTH the trigger and the panel, so pressing
 * the trigger to close doesn't read as an outside click and immediately reopen it.
 *
 * ```tsx
 * const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
 * return <div ref={ref} className="relative">…trigger…{open && <div>…panel…</div>}</div>;
 * ```
 */
export function useDismiss<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onDismiss: () => void,
  /** A second element that also counts as "inside" — for a panel rendered through a portal, which
   * is not a DOM descendant of the trigger and would otherwise dismiss on its own clicks. Without
   * this, `mousedown` on a portalled menu item closes the menu and unmounts the button before its
   * `click` can fire, so the action silently never runs. */
  extraRef?: { current: HTMLElement | null },
) {
  const ref = useRef<T>(null);
  /** Held in a ref so the effect doesn't resubscribe on every render when the caller passes an
   * inline arrow — which is every caller. */
  const handler = useRef(onDismiss);
  handler.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const inside = ref.current?.contains(target) || extraRef?.current?.contains(target);
      if (!inside) handler.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler.current();
    };
    // `extraRef.current` is deliberately not a dependency — it is a ref, read at event time, and
    // listing it would resubscribe on every render without changing behaviour.
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return ref;
}

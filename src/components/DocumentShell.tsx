import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Dialog } from './Dialog';

/** One document, rendered either as a dialog over its catalogue or as a page of its own.
 *
 * The two are the same view — same tabs, same version selector, same everything — differing only in
 * their frame. That is the whole point of this component: a "full screen mode" built as a second
 * copy of the viewer would be a second copy to keep in step, and the copies would diverge on the
 * first change either one received.
 *
 * **Why a page mode exists at all.** A modal has to be closed to look at anything else, which is
 * exactly wrong for a document you consult WHILE working somewhere else — checking a mapping against
 * the scope register, or against a second FMD. Opened in another browser tab it stops being a thing
 * in the way and becomes a thing beside you. In that tab a modal is nonsense: it would float over a
 * catalogue nobody navigated to, with a close button that reveals a screen they did not ask for. So
 * the tab gets the document as the page, under the app's own header, with a way back to the
 * catalogue rather than a dismiss.
 */
export function DocumentShell({ asPage, open, title, subtitle, backTo, backLabel, onClose, children }: {
  /** True in a dedicated tab; false when floating over the list that opened it. */
  asPage?: boolean;
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  /** Where "back" goes in page mode — the catalogue this document belongs to. */
  backTo?: string;
  backLabel?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!asPage) {
    return (
      <Dialog open={open} onClose={onClose} title={title} subtitle={subtitle} size="win">
        {children}
      </Dialog>
    );
  }

  if (!open) return null;

  return (
    /* Fills the shell's content area and scrolls INSIDE itself, like the dialog body does. Letting
       the page scroll instead would take the tab strip and version selector off the top of a long
       FMD — the two controls you reach for most while reading one. */
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 pb-3 mb-1 border-b border-line">
        {backTo && (
          <Link
            to={backTo}
            className="inline-flex items-center gap-1.5 text-2xs font-semibold text-blue hover:underline mb-1.5"
          >
            <ArrowLeft size={13} /> {backLabel ?? 'Back to the catalogue'}
          </Link>
        )}
        <h1 className="text-lg font-bold text-text leading-tight">{title}</h1>
        {subtitle && <p className="text-2xs text-muted mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

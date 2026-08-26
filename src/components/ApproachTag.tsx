import { useEffect, useRef, useState } from 'react';
import { ColorTag } from './ColorTag';
import { approachLabelSet, type ApproachSize } from '../lib/approachLabels';

const SIZES: ApproachSize[] = ['big', 'medium', 'small'];
/** Rough width of the pill's own chrome (ColorTag's px-2.5 padding on both sides, plus a little
 * slack) — subtracted from the measured container width before comparing against label widths. */
const PILL_CHROME_PX = 26;

/** Approach names ("Migration Cockpit - Direct Transfer - AFS") are long — this measures the
 * actual available width of whatever it's placed in (a table cell, a detail-panel field, …) via
 * ResizeObserver, and shows the widest big/medium/small variant that still fits. Reacts to real
 * layout changes (window resize, sibling columns competing for space) rather than fixed viewport
 * breakpoints, since a table cell's available width isn't the same thing as the screen's width.
 * The full name is always available as a tooltip regardless of which variant is showing. */
export function ApproachTag({ approach, className }: { approach?: string | null; className?: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<ApproachSize>('big');
  const labels = approachLabelSet(approach);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure || !approach) return;

    const pick = () => {
      const available = container.offsetWidth - PILL_CHROME_PX;
      for (const s of SIZES) {
        measure.textContent = labels[s];
        if (measure.offsetWidth <= available) { setSize(s); return; }
      }
      setSize('small');
    };

    const ro = new ResizeObserver(pick);
    ro.observe(container);
    pick();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approach]);

  if (!approach) return <span className="text-sm2 text-muted">—</span>;

  return (
    <span ref={containerRef} className="block w-full min-w-0" title={labels.big}>
      <span ref={measureRef} aria-hidden className="fixed -top-[999px] -left-[999px] whitespace-nowrap text-2xs font-semibold pointer-events-none" />
      <ColorTag colorKey={approach} className={className}>{labels[size]}</ColorTag>
    </span>
  );
}

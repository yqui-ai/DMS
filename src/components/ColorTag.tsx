import type { ReactNode } from 'react';
import clsx from 'clsx';
import { groupColorClasses } from '../lib/tagColor';

/** Like Tag, but color-coded by a hash of `colorKey` instead of a fixed semantic variant — for
 * categorical fields (component, approach, …) where the point is telling groups apart at a
 * glance, not signaling status. */
export function ColorTag({ colorKey, children, className }: { colorKey: string | null | undefined; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-[5px] text-xs font-semibold px-2.5 py-[3px] rounded-pill', groupColorClasses(colorKey), className)}>
      {children}
    </span>
  );
}

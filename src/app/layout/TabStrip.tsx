import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { navIcon } from './navIcons';

export interface TabStripItem {
  /** A precondition the section must meet before this tab appears at all. */
  requires?: 'scopeFinalized';
  key: string;
  label: string;
  icon?: string;
  to: string;
}

/** Per-screen tab strip. `to` is relative to the current route (empty string = index tab).
 *
 * **Wraps rather than scrolls.** `overflow-x-auto` made this a scroll container, and CSS then
 * promotes `overflow-y` from `visible` to `auto` — so the 1px that each tab's `-mb-px` hangs below
 * the content box was enough to raise a vertical scrollbar on a 40px-tall strip. These strips carry
 * at most four short items; wrapping is the honest narrow-screen fallback, and it cannot clip a tab
 * the way a hidden overflow would. */
export function TabStrip({ items, basePath }: { items: TabStripItem[]; basePath: string }) {
  return (
    <div className="flex items-center gap-1 flex-wrap border-b border-line mb-4">
      {items.map((item) => {
        const Icon = navIcon(item.icon);
        const to = item.to ? `${basePath}/${item.to}` : basePath;
        return (
          <NavLink
            key={item.key}
            to={to}
            end={item.to === ''}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-1.5 px-3.5 py-2.5 text-sm2 font-semibold border-b-2 -mb-px whitespace-nowrap',
                isActive ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text',
              )
            }
          >
            {Icon && <Icon size={13} />}
            {item.label}
          </NavLink>
        );
      })}
    </div>
  );
}

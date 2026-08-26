import { NavLink } from 'react-router-dom';
import * as icons from 'lucide-react';
import clsx from 'clsx';

export interface TabStripItem {
  key: string;
  label: string;
  icon?: string;
  to: string;
}

const toPascal = (s: string) => s.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');

/** Per-screen tab strip. `to` is relative to the current route (empty string = index tab). */
export function TabStrip({ items, basePath }: { items: TabStripItem[]; basePath: string }) {
  return (
    <div className="flex items-center gap-1 border-b border-line mb-4 overflow-x-auto">
      {items.map((item) => {
        const Icon = item.icon ? (icons as any)[toPascal(item.icon)] : undefined;
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

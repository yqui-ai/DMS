import { NavLink, useParams } from 'react-router-dom';
import * as icons from 'lucide-react';
const { ChevronsLeft, ChevronsRight } = icons;
import clsx from 'clsx';
import { NAV_GROUPS, type NavItem } from '../nav';
import { canView, SCOPE_GATED } from '../../lib/rbac';
import { useCurrentRole } from '../../lib/queries/memberships';
import { useDefaultProgram, useSubproject } from '../../lib/queries/programme';
import type { ScreenKey } from '../../types/entities';

const toPascal = (s: string) => s.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');

/** Nested (/pg/:programId/sp/:subprojectId/...) whenever a project is open, so items with a
 * `standalone` fallback (Library, Program Admin) never kick the user out of their current
 * project — the fallback is only used when the nested path can't be resolved. */
function resolveHref(item: NavItem, programId?: string, subprojectId?: string): string {
  if (item.to.startsWith('/')) return item.to;
  if (item.to.startsWith('../../')) return `/pg/${programId}/${item.to.replace('../../', '')}`;
  if (programId && subprojectId) return `/pg/${programId}/sp/${subprojectId}/${item.to}`;
  return item.standalone?.(programId) ?? `/pg/${programId}/sp/${subprojectId}/${item.to}`;
}

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { programId, subprojectId } = useParams();
  // routes with no :programId in the URL (Library, Connections, /, /me) still need a role to check against
  const { data: defaultProgram } = useDefaultProgram();
  const { data: role = 'guest' } = useCurrentRole(programId ?? defaultProgram?.id, subprojectId);
  const { data: subproject } = useSubproject(subprojectId);
  const scopeFinalized = subproject?.scopeFinalized ?? false;

  return (
    <aside
      className={clsx(
        'flex flex-col shrink-0 bg-surface border-r border-line transition-[width] duration-150',
        collapsed ? 'w-[60px]' : 'w-[228px]',
      )}
    >
      <div className="flex items-center h-14 px-3.5 border-b border-line shrink-0">
        {!collapsed && <span className="font-bold text-xl text-text truncate">DMS</span>}
        <button
          onClick={onToggle}
          className={clsx('ml-auto text-muted hover:text-text p-1.5 rounded hover:bg-blue-pale', collapsed && 'mx-auto')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2.5">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (!canView(role, item.key as ScreenKey)) return false;
            if (SCOPE_GATED.includes(item.key as ScreenKey) && !scopeFinalized) return false;
            // relative links need real :programId/:subprojectId in the URL to resolve — hide them
            // rather than link to /pg/undefined/... when browsing a program-less screen, unless
            // they have a standalone fallback (Library, Program Admin) that resolves instead
            if (!item.to.startsWith('/') && !item.to.startsWith('../../')) {
              const hasProjectContext = !!programId && !!subprojectId;
              if (!hasProjectContext && !item.standalone?.(programId)) return false;
            }
            if (item.to.startsWith('../../') && !programId) return false;
            return true;
          });
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.title} className="mb-3.5">
              {!collapsed && (
                <div className="px-3.5 mb-1 text-2xs font-bold uppercase tracking-[.05em] text-muted">{group.title}</div>
              )}
              {visibleItems.map((item) => {
                const Icon = (icons as any)[toPascal(item.icon)] ?? icons.Circle;
                return (
                  <NavLink
                    key={item.key}
                    to={resolveHref(item, programId, subprojectId)}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-2.5 mx-2 px-2 py-2 rounded-[8px] text-sm2 font-semibold truncate',
                        isActive ? 'bg-blue text-white' : 'text-text hover:bg-blue-pale',
                      )
                    }
                  >
                    <Icon size={15} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

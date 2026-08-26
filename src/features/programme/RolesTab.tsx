import { Fragment, useMemo } from 'react';
import { useRolesFull, useRoleScreens, useRoleScreenMutations } from '../../lib/queries/roles';
import { useToast } from '../../components/Toast';
import { Tag } from '../../components/Tag';
import type { RoleId, ScreenKey } from '../../types/entities';

const SCREEN_GROUPS: { title: string; screens: { key: ScreenKey; label: string }[] }[] = [
  {
    title: 'General',
    screens: [
      { key: 'myWork', label: 'My Work' }, { key: 'dashboard', label: 'Dashboard' },
      { key: 'programSettings', label: 'Program Settings' }, { key: 'programAdmin', label: 'Program Admin' },
    ],
  },
  {
    title: 'Scope & Design',
    screens: [
      { key: 'preparation', label: 'Scope' }, { key: 'rules', label: 'Rules & XREF' },
      { key: 'referenceData', label: 'Reference Data' },
    ],
  },
  {
    title: 'Execution',
    screens: [
      { key: 'migration', label: 'Data Migration' }, { key: 'quality', label: 'Data Quality' },
      { key: 'cutover', label: 'Cutover' }, { key: 'connections', label: 'Connections' },
    ],
  },
  {
    title: 'Governance',
    screens: [
      { key: 'promotions', label: 'Promotions' }, { key: 'jobMonitor', label: 'Job Monitor' },
    ],
  },
  {
    title: 'Library',
    screens: [
      { key: 'catalogObjects', label: 'Migration Object' }, { key: 'catalogFmds', label: 'Field Mapping' },
      { key: 'catalogRules', label: 'Rule' }, { key: 'catalogXref', label: 'Cross Reference (XREF)' },
    ],
  },
];

export function RolesTab() {
  const toast = useToast();
  const { data: roles = [] } = useRolesFull();
  const { data: roleScreens = [] } = useRoleScreens();
  const mutations = useRoleScreenMutations();

  const viewSet = useMemo(() => {
    const s = new Set<string>();
    for (const rs of roleScreens) if (rs.canView) s.add(rs.roleId + '::' + rs.screenKey);
    return s;
  }, [roleScreens]);

  const toggle = async (roleId: RoleId, screenKey: ScreenKey) => {
    const has = viewSet.has(roleId + '::' + screenKey);
    try {
      await mutations.toggle(roleId, screenKey, !has);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not update permission.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {roles.map((r) => (
          <div key={r.id} className="bg-surface rounded-lg shadow-card p-3.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-text text-sm2">{r.name}</span>
              {r.isStandard && <Tag variant="neutral">Standard</Tag>}
            </div>
            {r.description && <p className="text-2xs text-muted">{r.description}</p>}
          </div>
        ))}
      </div>

      <div className="rounded-lg shadow-card overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full border-collapse text-sm2">
            <thead>
              <tr>
                <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3.5 py-2.5 sticky top-0 text-left z-[1]">Screen</th>
                {roles.map((r) => (
                  <th key={r.id} className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-2 py-2.5 sticky top-0 text-center z-[1]">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCREEN_GROUPS.map((group) => (
                <Fragment key={group.title}>
                  <tr>
                    <td colSpan={roles.length + 1} className="px-3.5 py-1.5 bg-blue-pale text-2xs font-bold uppercase tracking-[.05em] text-blue-deep">
                      {group.title}
                    </td>
                  </tr>
                  {group.screens.map((screen) => (
                    <tr key={screen.key} className="border-t border-line">
                      <td className="px-3.5 py-2">{screen.label}</td>
                      {roles.map((r) => (
                        <td key={r.id} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={viewSet.has(r.id + '::' + screen.key)}
                            onChange={() => toggle(r.id, screen.key)}
                            className="w-4 h-4 accent-[var(--blue)]"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

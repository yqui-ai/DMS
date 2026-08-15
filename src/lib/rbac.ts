import type { RoleId, ScreenKey } from '../types/entities';

/** Seed matrix — mirrors role_screens in the database. DB is the source of truth at runtime. */
export const ROLE_SCREENS: Record<RoleId, ScreenKey[] | 'all'> = {
  program_admin: 'all',
  data_owner: ['myWork','dashboard','timeline','preparation','rules','referenceData','catalogObjects','catalogFmds','catalogRules','goldenLibrary'],
  etl_developer: ['myWork','dashboard','timeline','migration','quality','catalogObjects','jobMonitor'],
  etl_lead: ['myWork','dashboard','timeline','migration','quality','cutover','promotions','auditLog','jobMonitor','connections','catalogObjects','catalogFmds','catalogRules','goldenLibrary'],
  data_governance_lead: ['myWork','dashboard','timeline','preparation','rules','referenceData','quality','promotions','catalogObjects','catalogFmds','catalogRules','goldenLibrary'],
  cab: ['myWork','dashboard','timeline','promotions','auditLog','cutover'],
  end_user: ['myWork','dashboard','timeline','catalogObjects','catalogFmds','catalogRules','goldenLibrary'],
  guest: [],
};

export const canView = (role: RoleId, screen: ScreenKey) => {
  const allowed = ROLE_SCREENS[role];
  return allowed === 'all' || allowed.includes(screen);
};

/** Screens hidden until the active wave has scope_finalized = true */
export const SCOPE_GATED: ScreenKey[] = ['rules','referenceData','migration','quality','cutover','promotions','auditLog','jobMonitor'];

export const deniedMessage = (role: string, label: string) =>
  `As "${role}", this role has no access to ${label}. Restricted by the approval workflow matrix.`;

import type { RoleId, ScreenKey } from '../types/entities';

/** Seed matrix — mirrors role_screens in the database. DB is the source of truth at runtime. */
export const ROLE_SCREENS: Record<RoleId, ScreenKey[] | 'all'> = {
  program_admin: 'all',
  data_owner: ['myWork', 'dashboard', 'preparation', 'rules', 'referenceData', 'quality', 'cutover', 'catalogObjects', 'catalogFmds', 'catalogRules', 'catalogXref'],
  etl_developer: ['myWork', 'dashboard', 'migration', 'quality', 'jobMonitor', 'catalogObjects'],
  etl_lead: ['myWork', 'dashboard', 'migration', 'quality', 'cutover', 'promotions', 'jobMonitor', 'connections', 'catalogObjects', 'catalogFmds', 'catalogRules', 'catalogXref'],
  data_governance_lead: ['myWork', 'dashboard', 'preparation', 'rules', 'referenceData', 'quality', 'promotions', 'catalogObjects', 'catalogFmds', 'catalogRules', 'catalogXref'],
  cab: ['myWork', 'dashboard', 'promotions', 'cutover'],
  end_user: ['myWork', 'dashboard'],
  guest: [],
};

export const canView = (role: RoleId, screen: ScreenKey) => {
  const allowed = ROLE_SCREENS[role];
  return allowed === 'all' || allowed.includes(screen);
};

/** Screens hidden until the active subproject has scope_finalized = true */
export const SCOPE_GATED: ScreenKey[] = ['rules', 'referenceData', 'migration', 'quality', 'cutover', 'promotions', 'jobMonitor'];

/** Roles that may publish an FMD version regardless of who owns the object. Ownership says who is
 * RESPONSIBLE for a document; these roles are accountable for the programme's governance and must
 * not be locked out by an object nobody has been assigned yet — which was the actual effect of
 * gating publish on ownership alone. */
const PUBLISHER_ROLES: RoleId[] = ['program_admin', 'data_governance_lead', 'data_owner'];

export const canPublish = (role: RoleId, isOwner: boolean) => isOwner || PUBLISHER_ROLES.includes(role);

export const deniedMessage = (role: string, label: string) =>
  `As "${role}", this role has no access to ${label}. Restricted by the approval workflow matrix.`;

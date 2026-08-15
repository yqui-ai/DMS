import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { canView, deniedMessage } from '../../lib/rbac';
import { useCurrentRole } from '../../lib/queries/memberships';
import { useDefaultProject } from '../../lib/queries/programme';
import { RestrictedNotice } from '../../components/RestrictedNotice';
import type { ScreenKey } from '../../types/entities';

const ROLE_LABEL: Record<string, string> = {
  program_admin: 'Program Admin', data_owner: 'Data Owner', data_governance_lead: 'Data Governance Lead',
  etl_lead: 'ETL Lead', etl_developer: 'ETL Developer', cab: 'CAB', end_user: 'End User', guest: 'Guest',
};

/** Wraps a route's element and shows the inline restriction notice instead of the screen when denied. */
export function ScreenGate({ screen, children }: { screen: ScreenKey; children: ReactNode }) {
  const { projectId, waveId } = useParams();
  // routes with no :projectId in the URL (Library, Connections, /, /me) still need a role to check against
  const { data: defaultProject } = useDefaultProject();
  const { data: role = 'guest' } = useCurrentRole(projectId ?? defaultProject?.id, waveId);
  if (!canView(role, screen)) {
    return <RestrictedNotice message={deniedMessage(ROLE_LABEL[role] ?? role, screen)} />;
  }
  return <>{children}</>;
}

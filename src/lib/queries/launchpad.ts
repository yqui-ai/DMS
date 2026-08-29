import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import type { RoleId } from '../../types/entities';

/** One membership the signed-in user holds, with the names already resolved.
 *
 * A person holds SEVERAL of these and the roles differ between them — functional consultant on one
 * subproject, ETL developer on another. That is the normal case, not an edge case, so nothing here
 * reduces the list to "the user's role". */
export interface MyMembership {
  membershipId: string;
  roleId: RoleId;
  programId: string;
  programCode?: string;
  programName?: string;
  /** Null for a program-wide membership, which applies to every subproject in that program. */
  subprojectId?: string;
  subprojectName?: string;
  projectCode?: string;
  projectName?: string;
}

/** Every membership the signed-in user holds, across every program.
 *
 * The launchpad needs this before any program is chosen — which tiles to show, which programs the
 * Administration area may list, and which role to display for wherever you currently are. All three
 * used to be impossible above the program level, because `useCurrentRole` requires a programId. */
export function useMyMemberships() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-memberships', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MyMembership[]> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, role_id, program_id, subproject_id, programs(code, name), subprojects(name, projects(code, name))')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        membershipId: m.id,
        roleId: m.role_id as RoleId,
        programId: m.program_id,
        programCode: m.programs?.code ?? undefined,
        programName: m.programs?.name ?? undefined,
        subprojectId: m.subproject_id ?? undefined,
        subprojectName: m.subprojects?.name ?? undefined,
        projectCode: m.subprojects?.projects?.code ?? undefined,
        projectName: m.subprojects?.projects?.name ?? undefined,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

/** True when the user holds this role on ANY program.
 *
 * Tile visibility is a question about the whole account, not about one program — you can reach the
 * Administration tile if you administer something, even though which programs it lists is a
 * separate, narrower question answered by `adminProgramIds`. */
export const holdsRoleAnywhere = (memberships: MyMembership[], roles: RoleId[]): boolean =>
  memberships.some((m) => roles.includes(m.roleId));

/** The programs this user may administer — program-wide `program_admin` memberships only.
 *
 * A subproject-scoped admin membership deliberately does NOT qualify: administering users and roles
 * is a program-level act, and someone made admin of one wave has no business editing memberships
 * that reach the others. */
export const adminProgramIds = (memberships: MyMembership[]): string[] =>
  [...new Set(memberships.filter((m) => m.roleId === 'program_admin' && !m.subprojectId).map((m) => m.programId))];

/** Progress and outstanding risk for one program — the `program_status` view (migration 0036). */
export interface ProgramStatus {
  programId: string;
  code: string;
  name: string;
  objectsInScope: number;
  objectsMapped: number;
  objectsFmdLive: number;
  objectsLoaded: number;
  openFindings: number;
  openErrors: number;
  missingPrereqs: number;
  failedRuns7d: number;
}

/** The portfolio rollup, one row per program the caller can reach.
 *
 * RLS on the view limits it to programs the user has a membership on — there is no cross-program
 * bypass in this schema and this does not add one. Leadership sees a program by being granted `cab`
 * on it. */
export function useProgramStatus(enabled = true) {
  return useQuery({
    queryKey: ['program-status'],
    enabled,
    queryFn: async (): Promise<ProgramStatus[]> => {
      const { data, error } = await supabase.from('program_status').select('*').order('code');
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        programId: r.program_id,
        code: r.code,
        name: r.name,
        objectsInScope: Number(r.objects_in_scope ?? 0),
        objectsMapped: Number(r.objects_mapped ?? 0),
        objectsFmdLive: Number(r.objects_fmd_live ?? 0),
        objectsLoaded: Number(r.objects_loaded ?? 0),
        openFindings: Number(r.open_findings ?? 0),
        openErrors: Number(r.open_errors ?? 0),
        missingPrereqs: Number(r.missing_prereqs ?? 0),
        failedRuns7d: Number(r.failed_runs_7d ?? 0),
      }));
    },
    staleTime: 60_000,
  });
}

/** Every user in the given programs, with ALL of their memberships — the Administration user list.
 *
 * Grouped by user rather than by membership row, because "who is this person and what are they on"
 * is the question being asked. A person on four subprojects is one row with four roles, not four
 * rows that happen to share a name. */
export interface AdminUser {
  userId: string;
  name: string;
  email: string;
  status: 'Active' | 'Invited' | 'Disabled';
  lastLogin?: string;
  memberships: {
    membershipId: string;
    programId: string; programCode?: string;
    subprojectId?: string; subprojectName?: string; projectCode?: string;
    roleId: RoleId;
  }[];
}

export function useAdminUsers(programIds: string[]) {
  return useQuery({
    queryKey: ['admin-users', [...programIds].sort().join(',')],
    enabled: programIds.length > 0,
    queryFn: async (): Promise<AdminUser[]> => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, role_id, program_id, subproject_id, programs(code), subprojects(name, projects(code)), app_users(id, name, email, status, last_login)')
        .in('program_id', programIds);
      if (error) throw error;

      const byUser = new Map<string, AdminUser>();
      for (const m of (data ?? []) as any[]) {
        if (!m.app_users) continue;
        const u = m.app_users;
        if (!byUser.has(u.id)) {
          byUser.set(u.id, {
            userId: u.id, name: u.name, email: u.email, status: u.status,
            lastLogin: u.last_login ?? undefined, memberships: [],
          });
        }
        byUser.get(u.id)!.memberships.push({
          membershipId: m.id,
          programId: m.program_id,
          programCode: m.programs?.code ?? undefined,
          subprojectId: m.subproject_id ?? undefined,
          subprojectName: m.subprojects?.name ?? undefined,
          projectCode: m.subprojects?.projects?.code ?? undefined,
          roleId: m.role_id as RoleId,
        });
      }
      return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

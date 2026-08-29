import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { RoleId } from '../../types/entities';

export interface AssignablePerson {
  userId: string;
  name: string;
  email: string;
  /** Every role this person holds within the scope that was asked for. */
  roles: RoleId[];
}

/** Who can be named in a person-shaped field, scoped to where the field lives.
 *
 * The scope is the point. A Program Lead is chosen from the people who administer that program; a
 * consultant or ETL developer on a subproject is chosen from the people actually on that
 * subproject. A single flat list of every user in the system would let you assign someone to work
 * they cannot open.
 *
 * - `programId` alone → everyone with a membership on that program (program-wide or on any of its
 *   subprojects).
 * - `programId` + `subprojectId` → only people on that subproject, plus the program-wide members,
 *   who reach every subproject by definition.
 * - neither → everyone the caller can see. Used when creating a program, which has no members yet;
 *   see the note on that case below.
 *
 * `roles` narrows further — pass `['program_admin']` for a Program Lead. */
export function useAssignablePeople({ programId, subprojectId, roles, enabled = true }: {
  programId?: string;
  subprojectId?: string;
  roles?: RoleId[];
  enabled?: boolean;
} = {}) {
  const roleKey = roles ? [...roles].sort().join(',') : '';
  return useQuery({
    queryKey: ['assignable-people', programId ?? '', subprojectId ?? '', roleKey],
    enabled,
    queryFn: async (): Promise<AssignablePerson[]> => {
      let q = supabase
        .from('memberships')
        .select('role_id, subproject_id, app_users(id, name, email, status)');
      if (programId) q = q.eq('program_id', programId);
      if (roles?.length) q = q.in('role_id', roles);

      const { data, error } = await q;
      if (error) throw error;

      const byUser = new Map<string, AssignablePerson>();
      for (const m of (data ?? []) as any[]) {
        const u = m.app_users;
        if (!u) continue;
        // A disabled account should not appear in a list of people you can hand work to.
        if (u.status === 'Disabled') continue;
        // A subproject-scoped question includes program-wide members, who reach every subproject.
        if (subprojectId && m.subproject_id && m.subproject_id !== subprojectId) continue;

        const existing = byUser.get(u.id);
        if (existing) {
          if (!existing.roles.includes(m.role_id)) existing.roles.push(m.role_id);
        } else {
          byUser.set(u.id, { userId: u.id, name: u.name, email: u.email, roles: [m.role_id] });
        }
      }
      return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 5 * 60_000,
  });
}

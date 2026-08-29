import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { toCycle, toProgram, toProject, toSubproject } from './programme';
import type { Cycle, HierarchyLevel, Program, Project, RefStatus, Subproject } from '../../types/entities';

/** Which table each level of the hierarchy lives in, and the column pointing at its parent.
 *
 * One table drives create, update and delete for all four levels, so a new field is wired once
 * rather than in four near-identical mutations that drift. */
export const LEVELS = {
  PRGM: { table: 'programs', label: 'Program', parentColumn: null },
  PRJT: { table: 'projects', label: 'Project', parentColumn: 'program_id' },
  SPRJ: { table: 'subprojects', label: 'Subproject', parentColumn: 'project_id' },
  CYCL: { table: 'cycles', label: 'Cycle', parentColumn: 'subproject_id' },
} as const;

/** Statuses valid for one level — `dms_ref_status` filtered by type. */
export function useRefStatus(type?: HierarchyLevel) {
  return useQuery({
    queryKey: ['ref-status', type],
    enabled: !!type,
    queryFn: async (): Promise<RefStatus[]> => {
      const { data, error } = await supabase
        .from('dms_ref_status').select('*').eq('type', type!).order('seq');
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        type: r.type, code: r.code, name: r.name, seq: r.seq,
        isDefault: r.is_default, isClosed: r.is_closed,
      }));
    },
    staleTime: 30 * 60_000,
  });
}

/** Every status across every level, so a tree rendering four levels at once makes one request
 * instead of one per node. */
export function useAllRefStatus() {
  return useQuery({
    queryKey: ['ref-status', 'all'],
    queryFn: async (): Promise<RefStatus[]> => {
      const { data, error } = await supabase.from('dms_ref_status').select('*').order('type').order('seq');
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        type: r.type, code: r.code, name: r.name, seq: r.seq,
        isDefault: r.is_default, isClosed: r.is_closed,
      }));
    },
    staleTime: 30 * 60_000,
  });
}

/** `end_date` defaults to `9999-12-31` (migration 0001) and means OPEN-ENDED, not a date.
 *
 * It has to be stripped everywhere it surfaces: printed in a list it reads as a data error
 * ("Jan 05, 2026 – Dec 31, 9999"), and loaded into a date input it turns an unset end date into
 * one the user then has to clear by hand — or worse, saves back unnoticed. */
export const isOpenEnded = (iso?: string) => !iso || iso.startsWith('9999');

/** An open-ended date as an empty form value, so a date input shows blank rather than 9999. */
export const dateForInput = (iso?: string) => (isOpenEnded(iso) ? '' : iso);

export const statusName = (statuses: RefStatus[], type: HierarchyLevel, code?: string): string =>
  statuses.find((s) => s.type === type && s.code === code)?.name ?? code ?? '—';

export const isClosedStatus = (statuses: RefStatus[], type: HierarchyLevel, code?: string): boolean =>
  !!statuses.find((s) => s.type === type && s.code === code)?.isClosed;

/** The whole hierarchy the user can reach, in one shape.
 *
 * Four requests rather than a nested select, because RLS filters each level independently and a
 * join would silently drop a project whose subprojects you cannot see — which reads as "this
 * project is empty" rather than "you can't see inside it". */
/** Where a record stands with respect to archiving — separate from its lifecycle `status`.
 *
 * A pending request is a real state of the record, and one people need to see: an object still
 * reading "Active" while three approvals are being collected to archive it is the app hiding the
 * most important thing about it right now.
 *
 * Derived rather than written onto the row. Stamping the record would mean remembering and
 * restoring its previous status when a request is rejected or cancelled — a second source of truth
 * for the same fact, and one that drifts the first time a restore is missed. */
export type ArchiveState = 'none' | 'pending' | 'archived';

export interface WithArchive {
  archiveState: ArchiveState;
  /** The open request, so a row can offer to withdraw it rather than raise a second one the
   * database would reject. Present only while  is . */
  archiveRequestId?: string;
  archivedAt?: string; archivedBy?: string;
}

export interface ProgramNode extends Program, WithArchive {
  projects: (Project & WithArchive & { subprojects: (Subproject & WithArchive & { cycles: Cycle[] })[] })[];
}

export function useHierarchy(includeArchived = false) {
  return useQuery({
    queryKey: ['hierarchy', includeArchived],
    queryFn: async (): Promise<ProgramNode[]> => {
      // Archived records leave the working lists by default. Nothing is deleted (migration 0040),
      // so without this filter every list would grow forever.
      const live = (q: any) => (includeArchived ? q : q.is('archived_at', null));
      const [programs, projects, subprojects, cycles] = await Promise.all([
        live(supabase.from('programs').select('*')).order('code'),
        live(supabase.from('projects').select('*')).order('seq'),
        live(supabase.from('subprojects').select('*')).order('seq'),
        live(supabase.from('cycles').select('*')).order('seq'),
      ]);
      for (const r of [programs, projects, subprojects, cycles]) if (r.error) throw r.error;

      // Open archive requests, so a record can say it is on its way out. One query for the whole
      // tree rather than one per node.
      const { data: pendingRows, error: pendingError } = await supabase
        .from('archive_requests').select('id, entity_type, entity_id').eq('status', 'Pending');
      if (pendingError) throw pendingError;
      const pending = new Map((pendingRows ?? []).map((r: any) => [`${r.entity_type}:${r.entity_id}`, r.id as string]));

      const archiveOf = (type: string, row: any): WithArchive => {
        const requestId = pending.get(`${type}:${row.id}`);
        return {
          archiveState: row.archived_at ? 'archived' : requestId ? 'pending' : 'none',
          archiveRequestId: requestId,
          archivedAt: row.archived_at ?? undefined,
          archivedBy: row.archived_by ?? undefined,
        };
      };

      const cyclesBySubproject = new Map<string, Cycle[]>();
      for (const c of (cycles.data ?? []).map(toCycle)) {
        cyclesBySubproject.set(c.subprojectId, [...(cyclesBySubproject.get(c.subprojectId) ?? []), c]);
      }
      const subprojectsByProject = new Map<string, ProgramNode['projects'][number]['subprojects']>();
      for (const raw of (subprojects.data ?? [])) {
        const sp = toSubproject(raw);
        const withCycles = { ...sp, ...archiveOf('subproject', raw), cycles: cyclesBySubproject.get(sp.id) ?? [] };
        subprojectsByProject.set(sp.projectId, [...(subprojectsByProject.get(sp.projectId) ?? []), withCycles]);
      }
      const projectsByProgram = new Map<string, ProgramNode['projects']>();
      for (const raw of (projects.data ?? [])) {
        const pj = toProject(raw);
        const withSubs = { ...pj, ...archiveOf('project', raw), subprojects: subprojectsByProject.get(pj.id) ?? [] };
        projectsByProgram.set(pj.programId, [...(projectsByProgram.get(pj.programId) ?? []), withSubs]);
      }
      return (programs.data ?? []).map((raw: any) => ({
        ...toProgram(raw),
        ...archiveOf('program', raw),
        projects: projectsByProgram.get(raw.id) ?? [],
      }));
    },
  });
}

/** Snake-cased payload for one level. Only the fields that level actually has — sending a null
 * `owner` to a cycle would be rejected by the column that doesn't exist. */
export interface HierarchyForm {
  code: string; name: string; description?: string; status?: string;
  startDate?: string; endDate?: string;
  owner?: string; coLead?: string;
  prepStartDate?: string; prepEndDate?: string; freezeDate?: string;
  migStart?: string; migEnd?: string; dataFreeze?: string;
  seq?: number;
}

/** Empty string → null. A date input clears to '', and '' is not a date; Postgres rejects it
 * rather than treating it as absent, which surfaces as an opaque 22007 on save. */
const d = (v?: string) => (v && v.trim() ? v : null);

const payloadFor = (level: HierarchyLevel, form: HierarchyForm): Record<string, unknown> => {
  const base: Record<string, unknown> = {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description?.trim() || null,
    status: form.status || null,
    start_date: d(form.startDate),
    end_date: d(form.endDate),
  };
  if (level === 'PRGM') return { ...base, owner: form.owner?.trim() || null, co_lead: form.coLead?.trim() || null };
  if (level === 'PRJT') return { ...base, seq: form.seq ?? 1 };
  if (level === 'SPRJ') {
    return {
      ...base, seq: form.seq ?? 1,
      prep_start_date: d(form.prepStartDate), prep_end_date: d(form.prepEndDate),
      freeze_date: d(form.freezeDate),
    };
  }
  return {
    ...base, seq: form.seq ?? 1,
    mig_start: d(form.migStart), mig_end: d(form.migEnd), data_freeze: d(form.dataFreeze),
  };
};

export function useHierarchyMutations() {
  const queryClient = useQueryClient();
  /** A write at any level changes what the pickers, the switcher and the launchpad counts show. */
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['hierarchy'] }),
      queryClient.invalidateQueries({ queryKey: ['programs'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['subprojects'] }),
      queryClient.invalidateQueries({ queryKey: ['cycles'] }),
      queryClient.invalidateQueries({ queryKey: ['my-memberships'] }),
      queryClient.invalidateQueries({ queryKey: ['program-status'] }),
    ]);
  };

  const create = useMutation({
    mutationFn: async ({ level, parentId, form }: { level: HierarchyLevel; parentId?: string; form: HierarchyForm }) => {
      // A program goes through an RPC, not a plain insert. `INSERT ... RETURNING` under RLS also
      // has to pass the SELECT policy, and a program is only selectable once you hold a membership
      // on it — which the creator does not yet, at the moment they create it. See migration 0038.
      if (level === 'PRGM') {
        const { data, error } = await supabase.rpc('dms_create_program', {
          p_code: form.code.trim(),
          p_name: form.name.trim(),
          p_owner: form.owner?.trim() ?? '',
          p_co_lead: form.coLead?.trim() || null,
          p_status: form.status || null,
          p_start_date: d(form.startDate),
          p_end_date: d(form.endDate),
        });
        if (error) throw error;
        return data;
      }

      const { table, parentColumn } = LEVELS[level];
      const row = payloadFor(level, form);
      if (parentColumn) {
        if (!parentId) throw new Error(`A ${LEVELS[level].label.toLowerCase()} needs a parent.`);
        row[parentColumn] = parentId;
      }
      // guid, status default, created_by and created_at are all set by the trigger in 0037 —
      // deliberately not sent from here, so a client cannot forge an identity or an audit stamp.
      //
      // No `.select()`. Reading the row back would make the insert depend on the SELECT policy as
      // well, and a policy that decides visibility by looking the row up cannot see a row that is
      // still being written (see migration 0039). Nothing here uses the returned row — the
      // invalidation below refetches the list — so asking for it only adds a way to fail.
      const { error } = await supabase.from(table).insert(row);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ level, id, form }: { level: HierarchyLevel; id: string; form: HierarchyForm }) => {
      const { error } = await supabase.from(LEVELS[level].table).update(payloadFor(level, form)).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // There is no `remove`. Nothing in this hierarchy is deleted — see `useArchiveMutations` and
  // migrations 0040/0041, where a BEFORE DELETE trigger rejects it outright. The mutation that used
  // to live here is what hard-deleted a subproject, and its cycles, scope, FMDs, rules and runs
  // went with it through the cascades.
  return { create, update };
}

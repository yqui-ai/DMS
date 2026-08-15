import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import type { Cycle, Program, Project, Subproject } from '../../types/entities';

const toProgram = (p: any): Program => ({
  id: p.id, code: p.code, name: p.name, description: p.description ?? undefined,
  startDate: p.start_date ?? undefined, endDate: p.end_date ?? undefined,
});
const toProject = (r: any): Project => ({
  id: r.id, programId: r.program_id, code: r.code, name: r.name, description: r.description ?? undefined,
  seq: r.seq, startDate: r.start_date ?? undefined, endDate: r.end_date ?? undefined,
});
const toSubproject = (w: any): Subproject => ({
  id: w.id, projectId: w.project_id, code: w.code, name: w.name, description: w.description ?? undefined,
  startDate: w.start_date ?? undefined, endDate: w.end_date ?? undefined,
  freezeDate: w.freeze_date ?? undefined, scopeFinalized: w.scope_finalized, seq: w.seq,
});
const toCycle = (c: any): Cycle => ({
  id: c.id, subprojectId: c.subproject_id, name: c.name, seq: c.seq, description: c.description ?? undefined,
  migStart: c.mig_start ?? undefined, migEnd: c.mig_end ?? undefined, dataFreeze: c.data_freeze ?? undefined,
});

/** Programmes the current user has any membership in — drives the subproject picker/switcher. */
export function usePrograms() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['programs', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Program[]> => {
      const { data, error } = await supabase.from('programs').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map(toProgram);
    },
  });
}

/** First accessible programme — used by programme-wide screens (Library, Connections) that aren't nested under /pg/:programId. */
export function useDefaultProgram() {
  const { data: programs, ...rest } = usePrograms();
  return { data: programs?.[0], ...rest };
}

export function useProgram(programId?: string) {
  return useQuery({
    queryKey: ['program', programId],
    enabled: !!programId,
    queryFn: async (): Promise<Program | null> => {
      const { data, error } = await supabase.from('programs').select('*').eq('id', programId!).maybeSingle();
      if (error) throw error;
      return data ? toProgram(data) : null;
    },
  });
}

export function useProjects(programId?: string) {
  return useQuery({
    queryKey: ['projects', programId],
    enabled: !!programId,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase.from('projects').select('*').eq('program_id', programId!).order('seq');
      if (error) throw error;
      return (data ?? []).map(toProject);
    },
  });
}

/** Projects across every programme in `programIds` — used by the subproject picker. */
export function useProjectsForPrograms(programIds: string[]) {
  return useQuery({
    queryKey: ['projects-multi', programIds],
    enabled: programIds.length > 0,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase.from('projects').select('*').in('program_id', programIds).order('seq');
      if (error) throw error;
      return (data ?? []).map(toProject);
    },
  });
}

export function useProject(projectId?: string) {
  return useQuery({
    queryKey: ['project', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<Project | null> => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', projectId!).maybeSingle();
      if (error) throw error;
      return data ? toProject(data) : null;
    },
  });
}

export function useSubprojects(projectIds: string[]) {
  return useQuery({
    queryKey: ['subprojects', projectIds],
    enabled: projectIds.length > 0,
    queryFn: async (): Promise<Subproject[]> => {
      const { data, error } = await supabase.from('subprojects').select('*').in('project_id', projectIds).order('seq');
      if (error) throw error;
      return (data ?? []).map(toSubproject);
    },
  });
}

export function useSubproject(subprojectId?: string) {
  return useQuery({
    queryKey: ['subproject', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<Subproject | null> => {
      const { data, error } = await supabase.from('subprojects').select('*').eq('id', subprojectId!).maybeSingle();
      if (error) throw error;
      return data ? toSubproject(data) : null;
    },
  });
}

export function useCyclesForSubprojects(subprojectIds: string[]) {
  return useQuery({
    queryKey: ['cycles-multi', subprojectIds],
    enabled: subprojectIds.length > 0,
    queryFn: async (): Promise<Cycle[]> => {
      const { data, error } = await supabase.from('cycles').select('*').in('subproject_id', subprojectIds).order('seq');
      if (error) throw error;
      return (data ?? []).map(toCycle);
    },
  });
}

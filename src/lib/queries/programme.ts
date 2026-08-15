import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import type { Cycle, Project, Release, Wave } from '../../types/entities';

const toProject = (p: any): Project => ({
  id: p.id, code: p.code, name: p.name, description: p.description ?? undefined,
  startDate: p.start_date ?? undefined, endDate: p.end_date ?? undefined,
});
const toRelease = (r: any): Release => ({
  id: r.id, projectId: r.project_id, code: r.code, name: r.name, description: r.description ?? undefined,
  seq: r.seq, startDate: r.start_date ?? undefined, endDate: r.end_date ?? undefined,
});
const toWave = (w: any): Wave => ({
  id: w.id, releaseId: w.release_id, code: w.code, name: w.name, description: w.description ?? undefined,
  startDate: w.start_date ?? undefined, endDate: w.end_date ?? undefined,
  freezeDate: w.freeze_date ?? undefined, scopeFinalized: w.scope_finalized, seq: w.seq,
});
const toCycle = (c: any): Cycle => ({
  id: c.id, waveId: c.wave_id, name: c.name, seq: c.seq, description: c.description ?? undefined,
  migStart: c.mig_start ?? undefined, migEnd: c.mig_end ?? undefined, dataFreeze: c.data_freeze ?? undefined,
});

/** Projects the current user has any membership in — drives the subproject picker/switcher. */
export function useProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['projects', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase.from('projects').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map(toProject);
    },
  });
}

/** First accessible project — used by programme-wide screens (Library, Connections) that aren't nested under /p/:projectId. */
export function useDefaultProject() {
  const { data: projects, ...rest } = useProjects();
  return { data: projects?.[0], ...rest };
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

export function useReleases(projectId?: string) {
  return useQuery({
    queryKey: ['releases', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<Release[]> => {
      const { data, error } = await supabase.from('releases').select('*').eq('project_id', projectId!).order('seq');
      if (error) throw error;
      return (data ?? []).map(toRelease);
    },
  });
}

/** Releases across every project in `projectIds` — used by the subproject picker. */
export function useReleasesForProjects(projectIds: string[]) {
  return useQuery({
    queryKey: ['releases-multi', projectIds],
    enabled: projectIds.length > 0,
    queryFn: async (): Promise<Release[]> => {
      const { data, error } = await supabase.from('releases').select('*').in('project_id', projectIds).order('seq');
      if (error) throw error;
      return (data ?? []).map(toRelease);
    },
  });
}

export function useRelease(releaseId?: string) {
  return useQuery({
    queryKey: ['release', releaseId],
    enabled: !!releaseId,
    queryFn: async (): Promise<Release | null> => {
      const { data, error } = await supabase.from('releases').select('*').eq('id', releaseId!).maybeSingle();
      if (error) throw error;
      return data ? toRelease(data) : null;
    },
  });
}

export function useWaves(releaseIds: string[]) {
  return useQuery({
    queryKey: ['waves', releaseIds],
    enabled: releaseIds.length > 0,
    queryFn: async (): Promise<Wave[]> => {
      const { data, error } = await supabase.from('waves').select('*').in('release_id', releaseIds).order('seq');
      if (error) throw error;
      return (data ?? []).map(toWave);
    },
  });
}

export function useWave(waveId?: string) {
  return useQuery({
    queryKey: ['wave', waveId],
    enabled: !!waveId,
    queryFn: async (): Promise<Wave | null> => {
      const { data, error } = await supabase.from('waves').select('*').eq('id', waveId!).maybeSingle();
      if (error) throw error;
      return data ? toWave(data) : null;
    },
  });
}

export function useCyclesForWaves(waveIds: string[]) {
  return useQuery({
    queryKey: ['cycles-multi', waveIds],
    enabled: waveIds.length > 0,
    queryFn: async (): Promise<Cycle[]> => {
      const { data, error } = await supabase.from('cycles').select('*').in('wave_id', waveIds).order('seq');
      if (error) throw error;
      return (data ?? []).map(toCycle);
    },
  });
}

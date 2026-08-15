import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import type { Project, Release, Wave } from '../../types/entities';

/** Projects the current user has any membership in — drives the subproject switcher. */
export function useProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['projects', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase.from('projects').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id, code: p.code, name: p.name, description: p.description ?? undefined,
        startDate: p.start_date ?? undefined, endDate: p.end_date ?? undefined,
      }));
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
      return (data ?? []).map((r) => ({
        id: r.id, projectId: r.project_id, code: r.code, name: r.name, description: r.description ?? undefined,
        seq: r.seq, startDate: r.start_date ?? undefined, endDate: r.end_date ?? undefined,
      }));
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
      return (data ?? []).map((w) => ({
        id: w.id, releaseId: w.release_id, code: w.code, name: w.name, description: w.description ?? undefined,
        freezeDate: w.freeze_date ?? undefined, scopeFinalized: w.scope_finalized, seq: w.seq,
      }));
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
      if (!data) return null;
      return {
        id: data.id, projectId: data.project_id, code: data.code, name: data.name, description: data.description ?? undefined,
        seq: data.seq, startDate: data.start_date ?? undefined, endDate: data.end_date ?? undefined,
      };
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
      if (!data) return null;
      return {
        id: data.id, releaseId: data.release_id, code: data.code, name: data.name, description: data.description ?? undefined,
        freezeDate: data.freeze_date ?? undefined, scopeFinalized: data.scope_finalized, seq: data.seq,
      };
    },
  });
}

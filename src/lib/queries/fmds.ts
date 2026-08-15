import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Fmd, FmdVersion, GovState } from '../../types/entities';

const toFmdVersion = (v: any): FmdVersion => ({
  id: v.id, fmdId: v.fmd_id, version: v.version, state: v.state,
  sheets: v.sheets ?? {}, createdBy: v.created_by ?? undefined, createdAt: v.created_at ?? undefined,
  approvedBy: v.approved_by ?? undefined, approvedAt: v.approved_at ?? undefined,
});

export function useAllFmds() {
  return useQuery({
    queryKey: ['fmds-all'],
    queryFn: async (): Promise<Fmd[]> => {
      const { data, error } = await supabase.from('fmds').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map((f) => ({ id: f.id, subprojectId: f.subproject_id, migrationObjectId: f.migration_object_id ?? undefined, name: f.name }));
    },
  });
}

/** The latest fmd_versions row for an fmd — the FMD editor works against this single "working" version. */
export function useLatestFmdVersion(fmdId?: string) {
  return useQuery({
    queryKey: ['fmd-version-latest', fmdId],
    enabled: !!fmdId,
    queryFn: async (): Promise<FmdVersion | null> => {
      const { data, error } = await supabase
        .from('fmd_versions').select('*').eq('fmd_id', fmdId!)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data ? toFmdVersion(data) : null;
    },
  });
}

export function useFmdVersionMutations(fmdId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['fmd-version-latest', fmdId] });

  return {
    /** Creates the first working version (v1.0.0, Draft) when an FMD has none yet. */
    async createInitialVersion(): Promise<string> {
      const { data, error } = await supabase
        .from('fmd_versions')
        .insert({ fmd_id: fmdId, version: 'v1.0.0', state: 'Draft', sheets: { source: [], target: [], mapping: [] } })
        .select('id').single();
      if (error) throw error;
      await invalidate();
      return data.id;
    },
    async saveSheets(versionId: string, sheets: FmdVersion['sheets']) {
      const { error } = await supabase.from('fmd_versions').update({ sheets }).eq('id', versionId);
      if (error) throw error;
      await invalidate();
    },
    async setState(versionId: string, state: GovState) {
      const { error } = await supabase.from('fmd_versions').update({ state }).eq('id', versionId);
      if (error) throw error;
      await invalidate();
    },
  };
}

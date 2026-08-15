import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { GoldenLibraryEntry } from '../../types/entities';

const toEntry = (g: any): GoldenLibraryEntry => ({
  id: g.id, programId: g.program_id, kind: g.kind, name: g.name,
  reference: g.reference ?? undefined, version: g.version ?? undefined,
  createdBy: g.created_by ?? undefined, createdAt: g.created_at ?? undefined,
  changedBy: g.changed_by ?? undefined, changedAt: g.changed_at ?? undefined,
});

export function useGoldenLibrary(programId?: string) {
  return useQuery({
    queryKey: ['golden-library', programId],
    enabled: !!programId,
    queryFn: async (): Promise<GoldenLibraryEntry[]> => {
      const { data, error } = await supabase.from('golden_library').select('*').eq('program_id', programId!).order('name');
      if (error) throw error;
      return (data ?? []).map(toEntry);
    },
  });
}

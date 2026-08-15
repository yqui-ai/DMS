import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { TimelineCategory, TimelineEntry } from '../../types/entities';

const toCategory = (c: any): TimelineCategory => ({ id: c.id, projectId: c.project_id, name: c.name, seq: c.seq });
const toEntry = (e: any): TimelineEntry => ({
  id: e.id, categoryId: e.category_id, rowLabel: e.row_label, name: e.name, kind: e.kind,
  icon: e.icon ?? undefined, startDate: e.start_date ?? undefined, endDate: e.end_date ?? undefined,
});

export function useTimelineCategories(projectId?: string) {
  return useQuery({
    queryKey: ['timeline-categories', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<TimelineCategory[]> => {
      const { data, error } = await supabase.from('timeline_categories').select('*').eq('project_id', projectId!).order('seq');
      if (error) throw error;
      return (data ?? []).map(toCategory);
    },
  });
}

export function useTimelineEntries(categoryIds: string[]) {
  return useQuery({
    queryKey: ['timeline-entries', categoryIds],
    enabled: categoryIds.length > 0,
    queryFn: async (): Promise<TimelineEntry[]> => {
      const { data, error } = await supabase.from('timeline_entries').select('*').in('category_id', categoryIds);
      if (error) throw error;
      return (data ?? []).map(toEntry);
    },
  });
}

export function useTimelineAdminMutations(projectId: string) {
  const queryClient = useQueryClient();
  const invalidateCats = () => queryClient.invalidateQueries({ queryKey: ['timeline-categories', projectId] });
  const invalidateEntries = () => queryClient.invalidateQueries({ queryKey: ['timeline-entries'] });
  return {
    async addCategory(name: string, seq: number) {
      const { error } = await supabase.from('timeline_categories').insert({ project_id: projectId, name, seq });
      if (error) throw error;
      await invalidateCats();
    },
    async removeCategory(id: string) {
      const { error } = await supabase.from('timeline_categories').delete().eq('id', id);
      if (error) throw error;
      await invalidateCats();
      await invalidateEntries();
    },
    async addEntry(categoryId: string, entry: { rowLabel: string; name: string; kind: 'point' | 'range'; icon?: string; startDate?: string; endDate?: string }) {
      const { error } = await supabase.from('timeline_entries').insert({
        category_id: categoryId, row_label: entry.rowLabel, name: entry.name, kind: entry.kind,
        icon: entry.icon || null, start_date: entry.startDate || null, end_date: entry.endDate || null,
      });
      if (error) throw error;
      await invalidateEntries();
    },
    async removeEntry(id: string) {
      const { error } = await supabase.from('timeline_entries').delete().eq('id', id);
      if (error) throw error;
      await invalidateEntries();
    },
  };
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import type { FmdFieldNote } from '../../types/entities';

const toNote = (n: any): FmdFieldNote => ({
  id: n.id, fmdId: n.fmd_id, structureId: n.structure_id, rowKey: n.row_key,
  tag: n.tag, field: n.field ?? undefined, parentId: n.parent_id ?? undefined,
  body: n.body, resolved: !!n.resolved,
  createdBy: n.created_by, createdAt: n.created_at,
});

/** Every note for one FMD, across all its fields — fetched once per FMD (not per-field) since the
 * field-level view's Review points panel just filters this down to whichever row is open; cheaper
 * than a query per field click, and keeps note counts available for every row at once (e.g. for a
 * future "which fields have open to-dos" indicator in the table view). */
export function useFmdFieldNotes(fmdId?: string) {
  return useQuery({
    queryKey: ['fmd-field-notes', fmdId],
    enabled: !!fmdId,
    queryFn: async (): Promise<FmdFieldNote[]> => {
      const { data, error } = await supabase
        .from('fmd_field_notes').select('*').eq('fmd_id', fmdId!).order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toNote);
    },
  });
}

export function useFmdFieldNoteMutations(fmdId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['fmd-field-notes', fmdId] });

  return {
    /** `field` pins the point to one cell; omit it for a point about the whole row. */
    async add(structureId: string, rowKey: string, tag: string, body: string, field?: string): Promise<void> {
      const { error } = await supabase.from('fmd_field_notes').insert({
        fmd_id: fmdId, structure_id: structureId, row_key: rowKey, tag, body: body.trim(),
        field: field ?? null, created_by: user?.email ?? 'Unknown',
      });
      if (error) throw error;
      await invalidate();
    },
    /** Replies to a review point. Inherits the parent's structure/row/field identity so a thread
     * stays attached to the same cell even though only the parent is rendered against it. */
    async reply(parent: FmdFieldNote, body: string): Promise<void> {
      const { error } = await supabase.from('fmd_field_notes').insert({
        fmd_id: fmdId, structure_id: parent.structureId, row_key: parent.rowKey,
        field: parent.field ?? null, parent_id: parent.id,
        tag: 'remark', body: body.trim(), created_by: user?.email ?? 'Unknown',
      });
      if (error) throw error;
      await invalidate();
    },
    /** Marking a to-do resolved doesn't delete it — it stays as a record that the change was made,
     * just no longer counted as outstanding. */
    async setResolved(noteId: string, resolved: boolean): Promise<void> {
      const { error } = await supabase.from('fmd_field_notes').update({ resolved }).eq('id', noteId);
      if (error) throw error;
      await invalidate();
    },
    async remove(noteId: string): Promise<void> {
      const { error } = await supabase.from('fmd_field_notes').delete().eq('id', noteId);
      if (error) throw error;
      await invalidate();
    },
  };
}

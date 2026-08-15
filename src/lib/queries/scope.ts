import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { MigrationObject, SubprojectObject } from '../../types/entities';

const toMigrationObject = (o: any): MigrationObject => ({
  id: o.id, guid: o.guid ?? undefined, objectId: o.object_id, technicalName: o.technical_name ?? undefined,
  description: o.description ?? undefined, category: o.category ?? undefined, approach: o.approach ?? undefined,
  component: o.component ?? undefined,
});
const toSubprojectObject = (w: any): SubprojectObject => ({
  id: w.id, subprojectId: w.subproject_id, migrationObjectId: w.migration_object_id, inScope: w.in_scope,
  approach: w.approach ?? undefined, loadSeq: w.load_seq ?? undefined, owner: w.owner ?? undefined,
  waiverReason: w.waiver_reason ?? undefined,
});

/** The full SAP migration-object catalogue — programme-wide, readable by any authenticated member. */
export function useMigrationObjects() {
  return useQuery({
    queryKey: ['migration-objects'],
    queryFn: async (): Promise<MigrationObject[]> => {
      const { data, error } = await supabase.from('migration_objects').select('*').order('object_id');
      if (error) throw error;
      return (data ?? []).map(toMigrationObject);
    },
    staleTime: 5 * 60_000,
  });
}

export function useSubprojectObjects(subprojectId?: string) {
  return useQuery({
    queryKey: ['subproject-objects', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<SubprojectObject[]> => {
      const { data, error } = await supabase.from('subproject_objects').select('*').eq('subproject_id', subprojectId!);
      if (error) throw error;
      return (data ?? []).map(toSubprojectObject);
    },
  });
}

/** Idents (real DMC catalogue only) required by any in-scope object but not themselves in scope. */
export function useMissingPrerequisites(subprojectId?: string) {
  return useQuery({
    queryKey: ['missing-prereqs', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<{ object: string; requires: string }[]> => {
      const { data: subprojectObjs, error: e1 } = await supabase
        .from('subproject_objects').select('migration_object_id').eq('subproject_id', subprojectId!).eq('in_scope', true);
      if (e1) throw e1;
      const inScopeIds = (subprojectObjs ?? []).map((w) => w.migration_object_id);
      if (inScopeIds.length === 0) return [];
      const { data: deps, error: e2 } = await supabase
        .from('object_dependencies')
        .select('migration_object_id, requires_object_id, mo:migration_objects!object_dependencies_migration_object_id_fkey(object_id), req:migration_objects!object_dependencies_requires_object_id_fkey(object_id)')
        .in('migration_object_id', inScopeIds);
      if (e2) throw e2;
      const inScopeSet = new Set(inScopeIds);
      return (deps ?? [])
        .filter((d: any) => !inScopeSet.has(d.requires_object_id))
        .map((d: any) => ({ object: d.mo?.object_id ?? d.migration_object_id, requires: d.req?.object_id ?? d.requires_object_id }));
    },
  });
}

export function useScopeMutations(subprojectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['subproject-objects', subprojectId] });

  return {
    async setInScope(migrationObjectId: string, inScope: boolean) {
      const { error } = await supabase
        .from('subproject_objects')
        .upsert({ subproject_id: subprojectId, migration_object_id: migrationObjectId, in_scope: inScope }, { onConflict: 'subproject_id,migration_object_id' });
      if (error) throw error;
      await invalidate();
    },
    async setOwner(migrationObjectId: string, owner: string) {
      const { error } = await supabase
        .from('subproject_objects')
        .upsert({ subproject_id: subprojectId, migration_object_id: migrationObjectId, owner, in_scope: true }, { onConflict: 'subproject_id,migration_object_id' });
      if (error) throw error;
      await invalidate();
    },
    async setScopeFinalized(finalized: boolean) {
      const { error } = await supabase.from('subprojects').update({ scope_finalized: finalized }).eq('id', subprojectId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['subproject', subprojectId] });
      await queryClient.invalidateQueries({ queryKey: ['subprojects'] });
    },
    async setLoadSeq(migrationObjectId: string, loadSeq: number) {
      const { error } = await supabase
        .from('subproject_objects')
        .upsert({ subproject_id: subprojectId, migration_object_id: migrationObjectId, load_seq: loadSeq, in_scope: true }, { onConflict: 'subproject_id,migration_object_id' });
      if (error) throw error;
      await invalidate();
    },
  };
}

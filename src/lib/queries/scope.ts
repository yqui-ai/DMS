import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { MigrationObject, SubprojectObject } from '../../types/entities';

const toMigrationObject = (o: any): MigrationObject => ({
  id: o.id, guid: o.guid ?? undefined, objectId: o.object_id, technicalName: o.technical_name ?? undefined,
  description: o.description ?? undefined, category: o.category ?? undefined, approach: o.approach ?? undefined,
  component: o.component ?? undefined, class: o.class, programId: o.program_id,
  scontainer: o.scontainer ?? undefined, rcontainer: o.rcontainer ?? undefined,
  url: o.url ?? undefined, customFieldSupport: o.custom_field_support ?? undefined,
  analyzeSelection: o.analyze_selection ?? undefined, invalid: o.invalid ?? undefined,
});
const toSubprojectObject = (w: any): SubprojectObject => ({
  id: w.id, subprojectId: w.subproject_id, migrationObjectId: w.migration_object_id, inScope: w.in_scope,
  approach: w.approach ?? undefined, loadSeq: w.load_seq ?? undefined, owner: w.owner ?? undefined,
  waiverReason: w.waiver_reason ?? undefined,
});

/** The full SAP migration-object catalogue — programme-wide, readable by any authenticated member. */
/** `enabled` lets a component that is mounted but showing nothing (a dialog with no record open)
 * skip the fetch — the whole catalogue is a big read to make for a screen nobody is looking at. */
export function useMigrationObjects(enabled = true) {
  return useQuery({
    queryKey: ['migration-objects'],
    enabled,
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

/** Owner of one in-scope object, keyed `<subprojectId>::<migrationObjectId>`, across every
 * subproject the user can see. An FMD's owner is NOT its own setting — it's whoever owns the
 * migration object in the subproject the FMD belongs to, assigned during in-scope selection
 * (Scope > Criteria). Keeping one source means an FMD can't disagree with the scope register
 * about who is responsible for the object. */
export function useScopeObjectOwners(enabled = true) {
  return useQuery({
    queryKey: ['scope-object-owners'],
    enabled,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from('subproject_objects').select('subproject_id, migration_object_id, owner').not('owner', 'is', null);
      if (error) throw error;
      return new Map((data ?? []).map((r: any) => [`${r.subproject_id}::${r.migration_object_id}`, r.owner as string]));
    },
  });
}

export const scopeOwnerKey = (subprojectId?: string, migrationObjectId?: string) =>
  subprojectId && migrationObjectId ? `${subprojectId}::${migrationObjectId}` : '';

export interface ObjectScopeUsage { subprojectId: string; subprojectName: string; projectCode?: string; programCode?: string }

/** Every subproject that has this object in scope, program-wide — used by "Generate FMD" to
 * decide Standard (not in scope anywhere) vs Custom (in scope somewhere), and to let the user
 * pick which subproject/project a Custom FMD is generated for when there's more than one. */
export function useObjectScopeUsage(migrationObjectId?: string) {
  return useQuery({
    queryKey: ['object-scope-usage', migrationObjectId],
    enabled: !!migrationObjectId,
    queryFn: async (): Promise<ObjectScopeUsage[]> => {
      const { data, error } = await supabase
        .from('subproject_objects')
        .select('subproject_id, subprojects(name, projects(code, programs(code)))')
        .eq('migration_object_id', migrationObjectId!).eq('in_scope', true);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        subprojectId: r.subproject_id, subprojectName: r.subprojects?.name ?? '—',
        projectCode: r.subprojects?.projects?.code as string | undefined,
        programCode: r.subprojects?.projects?.programs?.code as string | undefined,
      }));
    },
  });
}

export interface ObjectPrerequisite {
  requiresObjectId: string; requiresIdent: string; requiresDescription?: string; mandatory: boolean;
  requiresCategory?: string; requiresComponent?: string;
}

/** Prerequisite objects for a single migration object (from DMC_SIN_SCOBJSEQ), for the Library
 * object detail dialog's Details tab / dependency diagram. */
export function useObjectDependencies(migrationObjectId?: string) {
  return useQuery({
    queryKey: ['object-dependencies', migrationObjectId],
    enabled: !!migrationObjectId,
    queryFn: async (): Promise<ObjectPrerequisite[]> => {
      const { data, error } = await supabase
        .from('object_dependencies')
        .select('mandatory, req:migration_objects!object_dependencies_requires_object_id_fkey(id, object_id, description, category, component)')
        .eq('migration_object_id', migrationObjectId!);
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        requiresObjectId: d.req.id, requiresIdent: d.req.object_id, requiresDescription: d.req.description ?? undefined, mandatory: d.mandatory,
        requiresCategory: d.req.category ?? undefined, requiresComponent: d.req.component ?? undefined,
      }));
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

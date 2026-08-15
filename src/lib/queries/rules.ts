import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { formatLibraryReference } from '../libraryReference';
import type { GovState, LibraryListing, Rule, XrefRow, XrefTable } from '../../types/entities';

const toRule = (r: any): Rule => ({
  id: r.id, subprojectId: r.subproject_id, code: r.code, name: r.name, migrationObjectId: r.migration_object_id ?? undefined,
  type: r.type, severity: r.severity, status: r.status, expression: r.expression ?? undefined,
  owner: r.owner ?? undefined, version: r.version ?? undefined, class: r.class,
  origin: r.origin, displayId: r.display_id ?? undefined,
});

export function useRules(subprojectId?: string) {
  return useQuery({
    queryKey: ['rules', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<Rule[]> => {
      const { data, error } = await supabase.from('rules').select('*').eq('subproject_id', subprojectId!).order('code');
      if (error) throw error;
      return (data ?? []).map(toRule);
    },
  });
}

/** Rules across every subproject the user can access — used by the programme-wide Library > Rules catalogue. */
export function useAllRules() {
  return useQuery({
    queryKey: ['rules-all'],
    queryFn: async (): Promise<Rule[]> => {
      const { data, error } = await supabase.from('rules').select('*').order('code');
      if (error) throw error;
      return (data ?? []).map(toRule);
    },
  });
}

export interface LibraryRuleRow extends Rule, LibraryListing {}

/** Rules enriched with the program/project reference — for the Library > Rule catalogue. */
export function useLibraryRules() {
  return useQuery({
    queryKey: ['rules-library'],
    queryFn: async (): Promise<LibraryRuleRow[]> => {
      const { data, error } = await supabase
        .from('rules')
        .select('*, subprojects(projects(code, programs(code)))')
        .order('code');
      if (error) throw error;
      return (data ?? []).map((r: any) => {
        const programCode = r.subprojects?.projects?.programs?.code as string | undefined;
        const projectCode = r.subprojects?.projects?.code as string | undefined;
        return { ...toRule(r), reference: formatLibraryReference(r.class, programCode, projectCode) };
      });
    },
  });
}

export function useRuleMutations(subprojectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['rules', subprojectId] });
  return {
    async setStatus(id: string, status: GovState) {
      const { error } = await supabase.from('rules').update({ status }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

const toXrefTable = (x: any): XrefTable => ({
  id: x.id, subprojectId: x.subproject_id, name: x.name, purpose: x.purpose ?? undefined, version: x.version ?? undefined, class: x.class,
  displayId: x.display_id ?? undefined,
});

export function useXrefTables(subprojectId?: string) {
  return useQuery({
    queryKey: ['xref-tables', subprojectId],
    enabled: !!subprojectId,
    queryFn: async (): Promise<XrefTable[]> => {
      const { data, error } = await supabase.from('xref_tables').select('*').eq('subproject_id', subprojectId!).order('name');
      if (error) throw error;
      return (data ?? []).map(toXrefTable);
    },
  });
}

export interface LibraryXrefRow extends XrefTable, LibraryListing {}

/** XREF tables across every subproject the user can access, enriched with the program/project
 * reference — for the Library > Cross Reference (XREF) catalogue. */
export function useLibraryXrefTables() {
  return useQuery({
    queryKey: ['xref-tables-library'],
    queryFn: async (): Promise<LibraryXrefRow[]> => {
      const { data, error } = await supabase
        .from('xref_tables')
        .select('*, subprojects(projects(code, programs(code)))')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((x: any) => {
        const programCode = x.subprojects?.projects?.programs?.code as string | undefined;
        const projectCode = x.subprojects?.projects?.code as string | undefined;
        return { ...toXrefTable(x), reference: formatLibraryReference(x.class, programCode, projectCode) };
      });
    },
  });
}

export function useXrefRows(xrefTableId?: string) {
  return useQuery({
    queryKey: ['xref-rows', xrefTableId],
    enabled: !!xrefTableId,
    queryFn: async (): Promise<XrefRow[]> => {
      const { data, error } = await supabase.from('xref_rows').select('*').eq('xref_table_id', xrefTableId!);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id, xrefTableId: r.xref_table_id, legacyValue: r.legacy_value ?? undefined,
        s4Value: r.s4_value ?? undefined, validFrom: r.valid_from ?? undefined, status: r.status,
      }));
    },
  });
}

export function useXrefRowMutations(xrefTableId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['xref-rows', xrefTableId] });
  return {
    async update(id: string, patch: { legacyValue?: string; s4Value?: string; status?: 'Active' | 'Retired' }) {
      const payload: Record<string, unknown> = {};
      if (patch.legacyValue !== undefined) payload.legacy_value = patch.legacyValue;
      if (patch.s4Value !== undefined) payload.s4_value = patch.s4Value;
      if (patch.status !== undefined) payload.status = patch.status;
      const { error } = await supabase.from('xref_rows').update(payload).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
    async add(row: { legacyValue: string; s4Value: string }) {
      const { error } = await supabase.from('xref_rows').insert({ xref_table_id: xrefTableId, legacy_value: row.legacyValue, s4_value: row.s4Value, status: 'Active' });
      if (error) throw error;
      await invalidate();
    },
  };
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { formatLibraryReference } from '../libraryReference';
import type { GoldenFmdStructure, GovState, LibraryListing, Rule, XrefRow, XrefTable, XrefVersion } from '../../types/entities';

/** Bumps the patch segment of a 'vMAJOR.MINOR.PATCH' version string — same convention as
 * bumpVersion in queries/fmds.ts, kept local since it's a 3-line pure helper. */
const bumpVersion = (version: string): string => {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) return 'v1.0.1';
  return `v${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
};

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
export function useLibraryRules(enabled = true) {
  return useQuery({
    queryKey: ['rules-library'],
    enabled,
    queryFn: async (): Promise<LibraryRuleRow[]> => {
      const { data, error } = await supabase
        .from('rules')
        .select('*, subprojects(projects(code, program_id, programs(code)))')
        .is('archived_at', null)
        .order('code');
      if (error) throw error;
      return (data ?? []).map((r: any) => {
        const programCode = r.subprojects?.projects?.programs?.code as string | undefined;
        const projectCode = r.subprojects?.projects?.code as string | undefined;
        return {
          ...toRule(r),
          programId: r.subprojects?.projects?.program_id as string | undefined,
          reference: formatLibraryReference(r.class, programCode, projectCode),
        };
      });
    },
  });
}

export function useRuleMutations(subprojectId: string) {
  const queryClient = useQueryClient();
  // All three rule caches, not just the subproject-scoped one — the Library > Rule catalogue reads
  // 'rules-library' and would otherwise keep showing the pre-change status until a hard refetch.
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['rules', subprojectId] }),
    queryClient.invalidateQueries({ queryKey: ['rules-all'] }),
    queryClient.invalidateQueries({ queryKey: ['rules-library'] }),
  ]);
  return {
    async setStatus(id: string, status: GovState) {
      const { error } = await supabase.from('rules').update({ status }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

// x.version (a plain column on xref_tables from before xref_versions existed) is never written by
// any mutation below — every real version lives in xref_versions now, so this is a dead field kept
// around only for the odd row seeded before the versioning table existed. Never surface it as "the"
// version; useLibraryXrefTables derives the real latest version from xref_versions instead.
const toXrefTable = (x: any): XrefTable => ({
  id: x.id, subprojectId: x.subproject_id ?? undefined, name: x.name, purpose: x.purpose ?? undefined, class: x.class,
  type: x.type ?? 'Standard', displayId: x.display_id ?? undefined,
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

export interface LibraryXrefRow extends XrefTable, LibraryListing {
  /** The real current version, derived from xref_versions (newest by created_at) — not the dead
   * xref_tables.version column, which no mutation has written to since versioning was introduced. */
  latestVersion?: string; latestVersionId?: string;
}

/** XREF tables across every subproject the user can access, enriched with the program/project
 * reference — for the Library > Cross Reference (XREF) catalogue. */
export function useLibraryXrefTables(enabled = true) {
  return useQuery({
    queryKey: ['xref-tables-library'],
    enabled,
    queryFn: async (): Promise<LibraryXrefRow[]> => {
      const { data, error } = await supabase
        .from('xref_tables')
        .select('*, subprojects(projects(code, program_id, programs(code))), xref_versions!xref_table_id(id, version, created_at)')
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []).map((x: any) => {
        const programCode = x.subprojects?.projects?.programs?.code as string | undefined;
        const projectCode = x.subprojects?.projects?.code as string | undefined;
        const versions = [...(x.xref_versions ?? [])].sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
        return {
          ...toXrefTable(x),
          programId: x.subprojects?.projects?.program_id as string | undefined,
          reference: formatLibraryReference(x.class, programCode, projectCode),
          latestVersion: versions[0]?.version as string | undefined, latestVersionId: versions[0]?.id as string | undefined,
        };
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

const toXrefVersion = (v: any): XrefVersion => ({
  id: v.id, xrefTableId: v.xref_table_id, version: v.version, state: v.state, structure: v.structure ?? { sections: [] },
  comment: v.comment ?? undefined, createdBy: v.created_by ?? undefined, createdAt: v.created_at ?? undefined,
});

/** Every version row for the (singleton) Golden XREF, newest first — the version-history viewer's
 * list, same pattern as useFmdVersions. */
export function useXrefVersions(xrefTableId?: string) {
  return useQuery({
    queryKey: ['xref-versions', xrefTableId],
    enabled: !!xrefTableId,
    queryFn: async (): Promise<XrefVersion[]> => {
      const { data, error } = await supabase
        .from('xref_versions').select('*').eq('xref_table_id', xrefTableId!).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toXrefVersion);
    },
  });
}

/** Summary of the (singleton) Golden XREF — id + latest version. Null if none has been registered yet. */
export function useGoldenXrefSummary() {
  return useQuery({
    queryKey: ['golden-xref-summary'],
    queryFn: async (): Promise<{ id: string; name: string; latestVersionId?: string; latestVersion?: string } | null> => {
      const { data, error } = await supabase
        .from('xref_tables').select('id, name, xref_versions!xref_table_id(id, version, created_at)')
        .eq('type', 'Golden').maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const versions = [...((data as any).xref_versions ?? [])].sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
      return { id: data.id, name: data.name, latestVersionId: versions[0]?.id as string | undefined, latestVersion: versions[0]?.version as string | undefined };
    },
  });
}

/** Creates and updates the (singleton) Golden XREF's structure — same versioning model as Golden
 * FMD: every save is a new immutable version row, never overwriting the previous one. */
export function useGoldenXrefMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['xref-tables-library'] }),
    queryClient.invalidateQueries({ queryKey: ['golden-xref-summary'] }),
  ]);

  return {
    async create(name: string, structure: GoldenFmdStructure, comment: string): Promise<{ xrefTableId: string; versionId: string }> {
      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();
      const { data: xrefTable, error: tableError } = await supabase
        .from('xref_tables').insert({ name, class: 'Global', type: 'Golden' }).select('id').single();
      if (tableError) throw tableError;
      const { data: version, error: versionError } = await supabase
        .from('xref_versions')
        .insert({ xref_table_id: xrefTable.id, version: 'v1.0.0', state: 'Draft', structure, comment, created_by: who, created_at: now })
        .select('id').single();
      if (versionError) throw versionError;
      await invalidate();
      return { xrefTableId: xrefTable.id, versionId: version.id };
    },
    async saveNewVersion(xrefTableId: string, previousVersion: string, structure: GoldenFmdStructure, comment: string): Promise<string> {
      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();
      const { data: version, error } = await supabase
        .from('xref_versions')
        .insert({ xref_table_id: xrefTableId, version: bumpVersion(previousVersion), state: 'Draft', structure, comment, created_by: who, created_at: now })
        .select('id').single();
      if (error) throw error;
      await invalidate();
      return version.id;
    },
  };
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { formatLibraryReference } from '../libraryReference';
import { useAuth } from '../auth';
import type { Fmd, FmdVersion, GeneratedColumn, GeneratedTable, GoldenFmdStructure, GovState, LibraryListing } from '../../types/entities';

const toFmdVersion = (v: any): FmdVersion => ({
  id: v.id, fmdId: v.fmd_id, version: v.version, state: v.state,
  sheets: v.sheets ?? {}, comment: v.comment ?? undefined,
  createdBy: v.created_by ?? undefined, createdAt: v.created_at ?? undefined,
  approvedBy: v.approved_by ?? undefined, approvedAt: v.approved_at ?? undefined,
  changedBy: v.changed_by ?? undefined, changedAt: v.changed_at ?? undefined,
});

/** Bumps the patch segment of a 'vMAJOR.MINOR.PATCH' version string; falls back to 'v1.0.1' for
 * anything that doesn't match (shouldn't happen — every version is app-generated). */
const bumpVersion = (version: string): string => {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) return 'v1.0.1';
  return `v${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
};

export function useAllFmds() {
  return useQuery({
    queryKey: ['fmds-all'],
    queryFn: async (): Promise<Fmd[]> => {
      const { data, error } = await supabase.from('fmds').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map((f) => ({ id: f.id, subprojectId: f.subproject_id ?? undefined, migrationObjectId: f.migration_object_id ?? undefined, name: f.name, class: f.class, type: f.type, displayId: f.display_id ?? undefined }));
    },
  });
}

export interface LibraryFmdRow extends Fmd, LibraryListing {
  latestVersion?: string; latestVersionId?: string;
  createdBy?: string; createdAt?: string; changedBy?: string; changedAt?: string;
}

/** FMDs enriched with the program/project reference (via subproject -> project -> program) and
 * latest version — for the Library > Field Mapping catalogue. Newest-generated/changed first, so
 * new work always surfaces at the top instead of getting buried alphabetically. */
export function useLibraryFmds() {
  return useQuery({
    queryKey: ['fmds-library'],
    queryFn: async (): Promise<LibraryFmdRow[]> => {
      const { data, error } = await supabase
        .from('fmds')
        .select('*, subprojects(projects(code, programs(code))), fmd_versions!fmd_id(id, version, created_at, created_by, changed_at, changed_by)')
        .order('name');
      if (error) throw error;
      const rows = (data ?? []).map((f: any) => {
        const programCode = f.subprojects?.projects?.programs?.code as string | undefined;
        const projectCode = f.subprojects?.projects?.code as string | undefined;
        const versions = [...(f.fmd_versions ?? [])].sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
        const latest = versions[0];
        return {
          id: f.id, subprojectId: f.subproject_id ?? undefined, migrationObjectId: f.migration_object_id ?? undefined, name: f.name,
          class: f.class, type: f.type, displayId: f.display_id ?? undefined, reference: formatLibraryReference(f.class, programCode, projectCode),
          latestVersion: latest?.version as string | undefined, latestVersionId: latest?.id as string | undefined,
          createdBy: latest?.created_by ?? undefined, createdAt: latest?.created_at ?? undefined,
          changedBy: latest?.changed_by ?? undefined, changedAt: latest?.changed_at ?? undefined,
        };
      });
      return rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    },
  });
}

export interface StandardFmdLink { migrationObjectId: string; fmdId: string; displayId?: string; name: string }

/** Every Standard FMD that's linked to a migration object — the Migration Object list's "Standard
 * FMD" column links straight to it in Field Mapping. */
export function useStandardFmdLinks() {
  return useQuery({
    queryKey: ['standard-fmd-links'],
    queryFn: async (): Promise<StandardFmdLink[]> => {
      const { data, error } = await supabase
        .from('fmds').select('id, name, display_id, migration_object_id')
        .eq('type', 'Standard').not('migration_object_id', 'is', null);
      if (error) throw error;
      return (data ?? []).map((f: any) => ({ migrationObjectId: f.migration_object_id, fmdId: f.id, displayId: f.display_id ?? undefined, name: f.name }));
    },
  });
}

/** Creates and updates Golden FMDs — program-wide, curated field-mapping templates built via the
 * Golden FMD Designer (not attached to any subproject/object). */
export function useGoldenFmdMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['fmds-library'] }),
    queryClient.invalidateQueries({ queryKey: ['fmds-all'] }),
  ]);

  return {
    /** Registers the (singleton) Golden FMD with its first version, v1.0.0. */
    async create(name: string, structure: GoldenFmdStructure, comment: string): Promise<{ fmdId: string; versionId: string }> {
      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();
      const { data: fmd, error: fmdError } = await supabase
        .from('fmds').insert({ name, class: 'Global', type: 'Golden' }).select('id').single();
      if (fmdError) throw fmdError;
      const { data: version, error: versionError } = await supabase
        .from('fmd_versions')
        .insert({
          fmd_id: fmd.id, version: 'v1.0.0', state: 'Draft', sheets: { goldenStructure: structure },
          comment, created_by: who, created_at: now,
        })
        .select('id').single();
      if (versionError) throw versionError;
      await invalidate();
      return { fmdId: fmd.id, versionId: version.id };
    },
    /** Every edit is a new immutable version row (never overwrites the previous one), so past
     * structures stay inspectable — the version number's patch segment bumps automatically. */
    async saveNewVersion(fmdId: string, previousVersion: string, structure: GoldenFmdStructure, comment: string): Promise<string> {
      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();
      const { data: version, error } = await supabase
        .from('fmd_versions')
        .insert({
          fmd_id: fmdId, version: bumpVersion(previousVersion), state: 'Draft', sheets: { goldenStructure: structure },
          comment, created_by: who, created_at: now,
        })
        .select('id').single();
      if (error) throw error;
      await invalidate();
      return version.id;
    },
  };
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

/** Every version row for an fmd, newest first — used by the Golden FMD viewer's "Version Updates"
 * tab so a past structure snapshot can be inspected. */
export function useFmdVersions(fmdId?: string) {
  return useQuery({
    queryKey: ['fmd-versions', fmdId],
    enabled: !!fmdId,
    queryFn: async (): Promise<FmdVersion[]> => {
      const { data, error } = await supabase
        .from('fmd_versions').select('*').eq('fmd_id', fmdId!).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toFmdVersion);
    },
  });
}

/** Summary of the (singleton) Golden FMD — id + latest version — for the "Apply Golden Template"
 * action in the Standard FMD editor. Null if no Golden FMD has been registered yet. */
export function useGoldenFmdSummary() {
  return useQuery({
    queryKey: ['golden-fmd-summary'],
    queryFn: async (): Promise<{ id: string; latestVersionId?: string; latestVersion?: string } | null> => {
      const { data, error } = await supabase
        .from('fmds').select('id, fmd_versions!fmd_id(id, version, created_at)')
        .eq('type', 'Golden').maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const versions = [...((data as any).fmd_versions ?? [])].sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
      return { id: data.id, latestVersionId: versions[0]?.id as string | undefined, latestVersion: versions[0]?.version as string | undefined };
    },
  });
}

/** Which Golden FMD version (if any) a Standard FMD was built from — set by "Apply Golden
 * Template" in the FMD editor. Queried independently of the Fmd prop so it stays fresh after
 * applying without the parent needing to re-pass a new object. */
export function useFmdGoldenLink(fmdId?: string) {
  return useQuery({
    queryKey: ['fmd-golden-link', fmdId],
    enabled: !!fmdId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.from('fmds').select('based_on_golden_version_id').eq('id', fmdId!).single();
      if (error) throw error;
      return (data as any)?.based_on_golden_version_id ?? null;
    },
  });
}

export function useApplyGoldenTemplateMutation(fmdId: string) {
  const queryClient = useQueryClient();
  return {
    async apply(goldenVersionId: string) {
      const { error } = await supabase.from('fmds').update({ based_on_golden_version_id: goldenVersionId }).eq('id', fmdId);
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fmd-golden-link', fmdId] }),
        queryClient.invalidateQueries({ queryKey: ['golden-where-used'] }),
      ]);
    },
  };
}

export interface GoldenWhereUsedRow {
  fmdId: string; name: string; displayId?: string; reference: string; objectId?: string;
  basedOnVersion?: string; isOutdated: boolean;
}

/** Every Standard/Custom FMD that's declared itself built from the Golden FMD, with whether it's
 * still on the current latest version — the Golden FMD viewer's "Where-used" tab, and (filtered by
 * version) the per-version "who's using this" panel. */
export function useGoldenWhereUsed(goldenFmdId?: string, latestVersionId?: string) {
  return useQuery({
    queryKey: ['golden-where-used', goldenFmdId, latestVersionId],
    enabled: !!goldenFmdId && !!latestVersionId,
    queryFn: async (): Promise<GoldenWhereUsedRow[]> => {
      const [fmdsRes, versionsRes] = await Promise.all([
        supabase.from('fmds').select('id, name, display_id, based_on_golden_version_id, subprojects(projects(code, programs(code))), migration_objects(object_id)').not('based_on_golden_version_id', 'is', null),
        supabase.from('fmd_versions').select('id, version').eq('fmd_id', goldenFmdId!),
      ]);
      if (fmdsRes.error) throw fmdsRes.error;
      if (versionsRes.error) throw versionsRes.error;
      const versionLabel = new Map((versionsRes.data ?? []).map((v: any) => [v.id, v.version as string]));
      return (fmdsRes.data ?? []).map((f: any) => {
        const programCode = f.subprojects?.projects?.programs?.code as string | undefined;
        const projectCode = f.subprojects?.projects?.code as string | undefined;
        return {
          fmdId: f.id, name: f.name, displayId: f.display_id ?? undefined,
          reference: programCode && projectCode ? `${programCode}-${projectCode}` : '—',
          objectId: f.migration_objects?.object_id as string | undefined,
          basedOnVersion: versionLabel.get(f.based_on_golden_version_id),
          isOutdated: f.based_on_golden_version_id !== latestVersionId,
        };
      });
    },
  });
}

/** Generates a Standard/Custom FMD for a migration object from the Golden FMD's structure: one
 * table per selected sender structure, columns matching the Golden structure's field names at
 * generation time (a snapshot, like everything else about a Golden version). Standard when the
 * object isn't in scope anywhere (program-wide, class Global, no subproject); Custom when it's in
 * scope for a specific subproject (class Local, attached to that subproject). If an FMD of that
 * type already exists for this object (+ subproject, for Custom), it's reused — a new version is
 * added rather than creating a duplicate FMD — so there's ever only one Standard/Custom FMD per
 * object. Links based_on_golden_version_id immediately, so it shows up in Where-used without a
 * separate "Apply" step. */
export function useGenerateFmdMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return {
    async generate(params: {
      migrationObjectId: string; name: string; type: 'Standard' | 'Custom'; class: 'Global' | 'Local';
      subprojectId: string | null; goldenVersionId: string; goldenVersionLabel: string;
      columns: GeneratedColumn[]; tables: GeneratedTable[];
    }): Promise<string> {
      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();

      // Plain select + limit(1) rather than .maybeSingle() — earlier testing (before this
      // reuse logic existed) can have left more than one Standard/Custom FMD for the same
      // object, and .maybeSingle() throws on >1 rows instead of just picking one.
      let existingQuery = supabase.from('fmds').select('id')
        .eq('migration_object_id', params.migrationObjectId).eq('type', params.type);
      existingQuery = params.subprojectId
        ? existingQuery.eq('subproject_id', params.subprojectId)
        : existingQuery.is('subproject_id', null);
      const { data: existingRows, error: existingError } = await existingQuery.limit(1);
      if (existingError) throw existingError;
      const existing = existingRows?.[0] ?? null;

      let fmdId: string;
      let version: string;
      if (existing) {
        fmdId = existing.id;
        const { error: updateError } = await supabase
          .from('fmds').update({ name: params.name, based_on_golden_version_id: params.goldenVersionId }).eq('id', fmdId);
        if (updateError) throw updateError;
        const { data: latest, error: latestError } = await supabase
          .from('fmd_versions').select('version').eq('fmd_id', fmdId).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (latestError) throw latestError;
        version = bumpVersion(latest?.version ?? 'v1.0.0');
      } else {
        const { data: fmd, error: fmdError } = await supabase
          .from('fmds')
          .insert({
            name: params.name, class: params.class, type: params.type,
            migration_object_id: params.migrationObjectId, subproject_id: params.subprojectId,
            based_on_golden_version_id: params.goldenVersionId,
          })
          .select('id').single();
        if (fmdError) throw fmdError;
        fmdId = fmd.id;
        version = 'v1.0.0';
      }

      const { error: versionError } = await supabase
        .from('fmd_versions')
        .insert({
          fmd_id: fmdId, version, state: 'Draft',
          sheets: { generatedColumns: params.columns, generatedTables: params.tables },
          comment: `Generated from Golden FMD ${params.goldenVersionLabel}`,
          created_by: who, created_at: now,
        });
      if (versionError) throw versionError;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fmds-all'] }),
        queryClient.invalidateQueries({ queryKey: ['fmds-library'] }),
        queryClient.invalidateQueries({ queryKey: ['golden-where-used'] }),
        queryClient.invalidateQueries({ queryKey: ['standard-fmd-links'] }),
        queryClient.invalidateQueries({ queryKey: ['fmd-versions', fmdId] }),
        queryClient.invalidateQueries({ queryKey: ['fmd-version-latest', fmdId] }),
      ]);
      return fmdId;
    },
  };
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

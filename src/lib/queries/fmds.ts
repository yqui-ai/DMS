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
  /** Which Golden FMD version this FMD was generated against, and whether Golden has since moved
   * on — undefined for the Golden FMD itself (it doesn't reference itself) and for anything never
   * generated from one (e.g. a raw Historical upload). */
  goldenVersionLabel?: string; goldenOutdated?: boolean;
  /** A Custom FMD's snapshot reference to the object's Standard FMD version — undefined for
   * Standard/Golden/Historical, which reference something else (or nothing). Outdated when the
   * Standard FMD has since moved to a newer version for any reason, not just a Golden change. */
  standardRefVersionLabel?: string; standardRefOutdated?: boolean;
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
      const rows = data ?? [];

      // One pass over every fmd's nested versions resolves ANY version id in the system to its
      // label — covers based_on_golden_version_id / based_on_standard_fmd_version_id regardless of
      // which fmd they actually belong to, without a second round-trip.
      const versionLabelById = new Map<string, string>();
      for (const f of rows as any[]) for (const v of f.fmd_versions ?? []) versionLabelById.set(v.id, v.version);

      const latestVersionId = (f: any): string | undefined => {
        const sorted = [...(f.fmd_versions ?? [])].sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
        return sorted[0]?.id as string | undefined;
      };
      const goldenFmd = (rows as any[]).find((f) => f.type === 'Golden');
      const goldenLatestVersionId = goldenFmd ? latestVersionId(goldenFmd) : undefined;
      const standardLatestVersionIdByObject = new Map<string, string>();
      for (const f of rows as any[]) {
        if (f.type !== 'Standard' || !f.migration_object_id) continue;
        const id = latestVersionId(f);
        if (id) standardLatestVersionIdByObject.set(f.migration_object_id, id);
      }

      const decorated = (rows as any[]).map((f) => {
        const programCode = f.subprojects?.projects?.programs?.code as string | undefined;
        const projectCode = f.subprojects?.projects?.code as string | undefined;
        // Ascending — first entry is the FMD's true origin, last is whatever a "Generate FMD" /
        // "Save new version" action most recently added.
        const versions = [...(f.fmd_versions ?? [])].sort((a: any, b: any) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
        const first = versions[0];
        const latest = versions[versions.length - 1];
        // "Changed" only means something once a second version exists — a brand-new FMD hasn't
        // been changed yet, it's just been created.
        const hasChanged = versions.length > 1;

        const goldenVersionId = f.based_on_golden_version_id ?? undefined;
        const standardRefVersionId = f.based_on_standard_fmd_version_id ?? undefined;
        const currentStandardLatestId = f.migration_object_id ? standardLatestVersionIdByObject.get(f.migration_object_id) : undefined;

        const row = {
          id: f.id, subprojectId: f.subproject_id ?? undefined, migrationObjectId: f.migration_object_id ?? undefined, name: f.name,
          class: f.class, type: f.type, displayId: f.display_id ?? undefined, aiGenerated: !!f.ai_generated,
          histSourceName: f.hist_source_name ?? undefined, histPlant: f.hist_plant ?? undefined,
          reference: formatLibraryReference(f.class, programCode, projectCode),
          latestVersion: latest?.version as string | undefined, latestVersionId: latest?.id as string | undefined,
          createdBy: first?.created_by ?? undefined, createdAt: first?.created_at ?? undefined,
          changedBy: hasChanged ? (latest?.created_by ?? undefined) : undefined,
          changedAt: hasChanged ? (latest?.created_at ?? undefined) : undefined,
          goldenVersionLabel: goldenVersionId ? versionLabelById.get(goldenVersionId) : undefined,
          goldenOutdated: f.type !== 'Golden' && !!goldenVersionId && !!goldenLatestVersionId && goldenVersionId !== goldenLatestVersionId,
          standardRefVersionLabel: standardRefVersionId ? versionLabelById.get(standardRefVersionId) : undefined,
          standardRefOutdated: f.type === 'Custom' && !!standardRefVersionId && !!currentStandardLatestId && standardRefVersionId !== currentStandardLatestId,
        };
        return { row, lastActivityAt: (latest?.created_at ?? first?.created_at ?? '') as string };
      });
      return decorated.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)).map((d) => d.row);
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
      /** Null for an object-agnostic conversion (e.g. AI-converting a historical FMD that was
       * never attached to a specific object) — the reuse lookup below matches on "no object" the
       * same way it already matches on "no subproject". */
      migrationObjectId: string | null; name: string; type: 'Standard' | 'Custom'; class: 'Global' | 'Local';
      subprojectId: string | null; goldenVersionId: string; goldenVersionLabel: string;
      columns: GeneratedColumn[]; tables: GeneratedTable[];
      /** True for the Historical FMD AI-conversion wizard's output — shows an AI icon next to the
       * name in the catalog, distinct from a manually "Generate FMD"'d one. */
      aiGenerated?: boolean;
      /** Source-file + plant identity for an AI conversion — when set, the reuse lookup below
       * matches on THESE instead of name/object, since the display name can be edited without
       * that meaning "this is now a different FMD". histPlant null means the no-plant-detected
       * single-FMD case. */
      histSourceName?: string; histPlant?: string | null;
      /** Overrides the default "Generated from Golden FMD vX" version comment — e.g. an
       * AI-written summary of what changed since the previous version. */
      comment?: string;
      /** Which of the object's Standard FMD version this Custom FMD was aligned to at generation
       * time — a snapshot, like based_on_golden_version_id, so a Standard FMD moving on later
       * (regenerated for any reason, not just a Golden change) can be flagged without retroactively
       * rewriting history. Only meaningful for type:'Custom'; omit for Standard/Golden. */
      basedOnStandardFmdVersionId?: string | null;
    }): Promise<{ fmdId: string; versionId: string }> {
      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();

      // Plain select + limit(1) rather than .maybeSingle() — earlier testing (before this
      // reuse logic existed) can have left more than one Standard/Custom FMD for the same
      // object, and .maybeSingle() throws on >1 rows instead of just picking one.
      let existingQuery = supabase.from('fmds').select('id').eq('type', params.type);
      if (params.histSourceName) {
        existingQuery = existingQuery.eq('hist_source_name', params.histSourceName);
        existingQuery = params.histPlant ? existingQuery.eq('hist_plant', params.histPlant) : existingQuery.is('hist_plant', null);
      } else if (params.migrationObjectId) {
        existingQuery = existingQuery.eq('migration_object_id', params.migrationObjectId);
      } else {
        // Object-less, non-lineage-tracked FMDs have nothing else to key the reuse lookup on, so
        // every one would otherwise collide on "no object + same subproject" and silently
        // overwrite each other — name is the only thing that distinguishes them in that case.
        existingQuery = existingQuery.is('migration_object_id', null).eq('name', params.name);
      }
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
          .from('fmds').update({
            name: params.name, based_on_golden_version_id: params.goldenVersionId, ai_generated: !!params.aiGenerated,
            hist_source_name: params.histSourceName ?? null, hist_plant: params.histPlant ?? null,
            based_on_standard_fmd_version_id: params.basedOnStandardFmdVersionId ?? null,
          }).eq('id', fmdId);
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
            based_on_golden_version_id: params.goldenVersionId, ai_generated: !!params.aiGenerated,
            hist_source_name: params.histSourceName ?? null, hist_plant: params.histPlant ?? null,
            based_on_standard_fmd_version_id: params.basedOnStandardFmdVersionId ?? null,
          })
          .select('id').single();
        if (fmdError) throw fmdError;
        fmdId = fmd.id;
        version = 'v1.0.0';
      }

      const { data: versionRow, error: versionError } = await supabase
        .from('fmd_versions')
        .insert({
          fmd_id: fmdId, version, state: 'Draft',
          sheets: { generatedColumns: params.columns, generatedTables: params.tables },
          comment: params.comment ?? `Generated from Golden FMD ${params.goldenVersionLabel}`,
          created_by: who, created_at: now,
        })
        .select('id').single();
      if (versionError) throw versionError;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fmds-all'] }),
        queryClient.invalidateQueries({ queryKey: ['fmds-library'] }),
        queryClient.invalidateQueries({ queryKey: ['golden-where-used'] }),
        queryClient.invalidateQueries({ queryKey: ['standard-fmd-links'] }),
        queryClient.invalidateQueries({ queryKey: ['fmd-versions', fmdId] }),
        queryClient.invalidateQueries({ queryKey: ['fmd-version-latest', fmdId] }),
      ]);
      return { fmdId, versionId: versionRow.id as string };
    },
  };
}

export interface HistoricalSiblingRow { fmdId: string; name: string; displayId?: string; reference: string; plant?: string; version?: string }

/** Other FMDs sharing the same tracked historical source (different plants from the same original
 * upload) — the "Where-used" concept for an AI-converted FMD, distinct from Golden's "who's based
 * on this version" tracking. */
export function useHistoricalSiblings(histSourceName?: string, excludeFmdId?: string) {
  return useQuery({
    queryKey: ['hist-siblings', histSourceName, excludeFmdId],
    enabled: !!histSourceName,
    queryFn: async (): Promise<HistoricalSiblingRow[]> => {
      const { data, error } = await supabase
        .from('fmds')
        .select('id, name, display_id, hist_plant, subprojects(projects(code, programs(code))), fmd_versions!fmd_id(version, created_at)')
        .eq('hist_source_name', histSourceName!).eq('ai_generated', true);
      if (error) throw error;
      return (data ?? [])
        .filter((f: any) => f.id !== excludeFmdId)
        .map((f: any) => {
          const programCode = f.subprojects?.projects?.programs?.code as string | undefined;
          const projectCode = f.subprojects?.projects?.code as string | undefined;
          const versions = [...(f.fmd_versions ?? [])].sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
          return {
            fmdId: f.id, name: f.name, displayId: f.display_id ?? undefined,
            reference: programCode && projectCode ? `${programCode}-${projectCode}` : '—',
            plant: f.hist_plant ?? undefined, version: versions[0]?.version as string | undefined,
          };
        });
    },
  });
}

/** Every distinct source filename already tracked from a past AI conversion — the candidate list
 * for "is this upload actually a renamed version of something we've already converted". */
export function useHistoricalSourceNames() {
  return useQuery({
    queryKey: ['hist-source-names'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('fmds').select('hist_source_name').eq('ai_generated', true).not('hist_source_name', 'is', null);
      if (error) throw error;
      return [...new Set((data ?? []).map((r: any) => r.hist_source_name as string))].sort();
    },
  });
}

/** The existing FMD (if any) already tracked for this exact (source file, plant) lineage, plus its
 * latest version's rows — for the re-upload flow to diff against and decide "new version" vs
 * "brand-new FMD". Plain async function, not a hook: called imperatively per plant while building
 * the wizard's plan, not tied to a component's render. */
export async function findHistoricalLineage(histSourceName: string, histPlant: string | null): Promise<{ fmdId: string; rows: GeneratedTable[] } | null> {
  let query = supabase.from('fmds').select('id').eq('ai_generated', true).eq('hist_source_name', histSourceName);
  query = histPlant ? query.eq('hist_plant', histPlant) : query.is('hist_plant', null);
  const { data: fmdRows, error: fmdError } = await query.limit(1);
  if (fmdError) throw fmdError;
  const fmd = fmdRows?.[0];
  if (!fmd) return null;

  const { data: versionRows, error: versionError } = await supabase
    .from('fmd_versions').select('sheets').eq('fmd_id', fmd.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (versionError) throw versionError;
  return { fmdId: fmd.id, rows: (versionRows?.sheets?.generatedTables as GeneratedTable[] | undefined) ?? [] };
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

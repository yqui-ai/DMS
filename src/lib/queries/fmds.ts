import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { formatLibraryReference } from '../libraryReference';
import { useAuth } from '../auth';
import { IDENTITY_FIELDS, rowKey, summariseVersionChange } from '../rowDiff';
import type { Fmd, FmdDraft, FmdPendingChange, FmdVersion, GeneratedColumn, GeneratedTable, GoldenFmdStructure, GovState, LibraryListing, MappingReview } from '../../types/entities';

const toFmdVersion = (v: any): FmdVersion => ({
  id: v.id, fmdId: v.fmd_id, version: v.version, state: v.state,
  sheets: v.sheets ?? {}, comment: v.comment ?? undefined,
  createdBy: v.created_by ?? undefined, createdAt: v.created_at ?? undefined,
  approvedBy: v.approved_by ?? undefined, approvedAt: v.approved_at ?? undefined,
  changedBy: v.changed_by ?? undefined, changedAt: v.changed_at ?? undefined,
  publishedBy: v.published_by ?? undefined, publishedAt: v.published_at ?? undefined,
});

/** The draft/version model lives in `../fmdDraft` — pure, and therefore testable without a
 * database. Re-exported here so every existing import of these names keeps working. */
export {
  DRAFT_VERSION, DRAFT_VERSION_ID, applyPendingChanges, draftOverlayVersion, nextPublishedVersion, bumpVersion,
} from '../fmdDraft';
import { DRAFT_VERSION, DRAFT_VERSION_ID, applyPendingChanges, bumpVersion, nextPublishedVersion } from '../fmdDraft';
import { CUSTOM_FIELD_TYPE } from '../goldenFmdRequiredFields';


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
  /** Why archiving is refused, or undefined when it is allowed — see archiveBlockedReason. */
  archiveBlockedReason?: string;
  latestVersion?: string; latestVersionId?: string;
  createdBy?: string; createdAt?: string; changedBy?: string; changedAt?: string;
  /** Which Golden FMD version this FMD was generated against, and whether Golden has since moved
   * on — undefined for the Golden FMD itself (it doesn't reference itself) and for anything never
   * generated from one. */
  goldenVersionLabel?: string; goldenOutdated?: boolean;
  /** A newer template version exists but has NOT been published.
   *
   * Deliberately separate from `goldenOutdated`. Outdated means "behind what the programme is
   * using" and asks for action; a draft on the template asks for nothing yet — it is one person's
   * work in progress, and syncing to it is not even possible. Both can be true at once: an FMD can
   * be genuinely behind the live template and have a further version coming after that. */
  goldenDraftPending?: boolean;
  /** A Custom FMD's snapshot reference to the object's Standard FMD version — undefined for
   * Standard/Golden, which reference something else (or nothing). Outdated when the
   * Standard FMD has since moved to a newer PUBLISHED version, for any reason, not just a Golden
   * change. */
  standardRefVersionLabel?: string; standardRefOutdated?: boolean;
  /** The object's Standard FMD has an unpublished draft — same distinction as goldenDraftPending. */
  standardRefDraftPending?: boolean;
  /** The newest PUBLISHED version — what everyone other than the editor should consider current.
   * Undefined while an FMD has only ever been a draft. */
  activeVersion?: string;
  /** When the live version was published — drives the "New Version" flag in the catalogue. */
  activePublishedAt?: string;
  /** True when there are unreleased edits — either uncommitted changes in `draft`, or a generated
   * version that has never been published. Independent of activeVersion: an FMD can have both. */
  hasDraft?: boolean;
  /** Uncommitted cell edits. Absent when nothing is in progress. */
  draft?: FmdDraft;
  /** Where the FMD lives, by name. `reference` carries the same fact as codes (PRG-PRJ); these are
   * what a person actually recognises, and a Global FMD has none of them — it is programme-wide. */
  programName?: string; projectName?: string; subprojectName?: string;
  /** The same three by CODE. The Library list shows these rather than the names: a subproject
   * called "Wave 1A — Material Master Core" under "S/4HANA Migration — NA Rollout" needs two
   * wrapped lines to say what PROJX › W1 › W1A says in one, and the codes are what people cite. */
  programCode?: string; projectCode?: string; subprojectCode?: string;
  latestState?: GovState;
}

/** FMDs enriched with the program/project reference (via subproject -> project -> program) and
 * latest version — for the Library > Field Mapping catalogue. Newest-generated/changed first, so
 * new work always surfaces at the top instead of getting buried alphabetically. */
/** Why this FMD cannot be archived, or undefined when it can.
 *
 * Returns a SENTENCE rather than a boolean, because every one of these has a different reason and
 * a disabled menu item with no explanation is the thing people file bugs about.
 *
 *  - Golden is the template every Standard and Custom is generated from, and
 *    `based_on_golden_version_id` points at its versions. Archiving it orphans the lot. It also
 *    has no program to scope a request to — it belongs to neither a subproject nor an object.
 *  - Standard is the reference its Customs align to (`based_on_standard_fmd_version_id`), so it
 *    goes only once none are left. */
const archiveBlockedReason = (
  f: any,
  programId: string | undefined,
  customCountByObject: Map<string, number>,
): string | undefined => {
  if (f.type === 'Golden') return 'The Golden FMD is the template every other FMD is generated from.';
  if (!programId) return 'This FMD is not scoped to a program, so it cannot be archived.';
  if (f.type === 'Standard') {
    const dependents = f.migration_object_id ? customCountByObject.get(f.migration_object_id) ?? 0 : 0;
    if (dependents > 0) {
      return `${dependents} Custom FMD${dependents === 1 ? '' : 's'} still reference this Standard FMD. Archive ${dependents === 1 ? 'it' : 'them'} first.`;
    }
  }
  return undefined;
};

export function useLibraryFmds(enabled = true) {
  return useQuery({
    queryKey: ['fmds-library'],
    enabled,
    queryFn: async (): Promise<LibraryFmdRow[]> => {
      const { data, error } = await supabase
        .from('fmds')
        // migration_objects.program_id is how a STANDARD fmd finds its program: it has no
        // subproject (it is program-wide), but it always has an object, and every object has a
        // program. The Golden fmd has neither and therefore no program at all — which is one
        // reason it can never be archived.
        .select('*, subprojects(code, name, project_id, projects(id, code, name, program_id, programs(code, name))), migration_objects(program_id), fmd_versions!fmd_id(id, version, state, created_at, created_by, changed_at, changed_by, published_at)')
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      const rows = data ?? [];

      // One pass over every fmd's nested versions resolves ANY version id in the system to its
      // label — covers based_on_golden_version_id / based_on_standard_fmd_version_id regardless of
      // which fmd they actually belong to, without a second round-trip.
      const versionLabelById = new Map<string, string>();
      for (const f of rows as any[]) for (const v of f.fmd_versions ?? []) versionLabelById.set(v.id, v.version);

      const sortedVersionsOf = (f: any) =>
        [...(f.fmd_versions ?? [])].sort((a: any, b: any) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

      /** The newest RELEASED version — what everything downstream should be measured against.
       *
       * "Outdated" has to mean "behind what the programme is using", and an unpublished draft is not
       * something the programme is using: it is one person's work in progress on the template. Using
       * the newest version of any kind marked every FMD in the catalogue Outdated the moment anyone
       * opened the Golden designer and saved, before a single change had been released — so the flag
       * that is supposed to mean "go and re-sync this" fired on work nobody could sync to yet. */
      const latestPublishedVersionId = (f: any): string | undefined =>
        sortedVersionsOf(f).find((v: any) => v.published_at)?.id as string | undefined;

      /** True when the newest version is an unpublished draft — a template change being prepared.
       * Worth saying, but in a different voice from Outdated: nothing is required of anyone yet. */
      const hasUnpublishedDraft = (f: any): boolean => {
        const newest = sortedVersionsOf(f)[0];
        return !!newest && !newest.published_at;
      };
      // How many Custom FMDs exist per object. A Standard FMD is the reference its Customs align
      // to, so archiving one with live children would leave them pointing at an archived parent.
      const customCountByObject = new Map<string, number>();
      for (const f of rows as any[]) {
        if (f.type !== 'Custom' || !f.migration_object_id) continue;
        customCountByObject.set(f.migration_object_id, (customCountByObject.get(f.migration_object_id) ?? 0) + 1);
      }

      const goldenFmd = (rows as any[]).find((f) => f.type === 'Golden');
      const goldenLatestVersionId = goldenFmd ? latestPublishedVersionId(goldenFmd) : undefined;
      /** The Golden has unreleased work on it. Not the same as anything being outdated. */
      const goldenDraftPending = goldenFmd ? hasUnpublishedDraft(goldenFmd) : false;
      const standardLatestVersionIdByObject = new Map<string, string>();
      const standardDraftPendingByObject = new Map<string, boolean>();
      for (const f of rows as any[]) {
        if (f.type !== 'Standard' || !f.migration_object_id) continue;
        // Published only, for the same reason as the Golden: a Custom FMD is not behind a Standard
        // draft that nobody has released.
        const id = latestPublishedVersionId(f);
        if (id) standardLatestVersionIdByObject.set(f.migration_object_id, id);
        standardDraftPendingByObject.set(f.migration_object_id, hasUnpublishedDraft(f));
      }

      const decorated = (rows as any[]).map((f) => {
        const programId = (f.subprojects?.projects?.program_id ?? f.migration_objects?.program_id) as string | undefined;
        const programCode = f.subprojects?.projects?.programs?.code as string | undefined;
        const projectCode = f.subprojects?.projects?.code as string | undefined;
        const programName = f.subprojects?.projects?.programs?.name as string | undefined;
        const projectName = f.subprojects?.projects?.name as string | undefined;
        const subprojectName = f.subprojects?.name as string | undefined;
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
          programId,
          archiveBlockedReason: archiveBlockedReason(f, programId, customCountByObject),
          programName, projectName, subprojectName,
          programCode, projectCode, subprojectCode: f.subprojects?.code as string | undefined,
          latestVersion: latest?.version as string | undefined, latestVersionId: latest?.id as string | undefined,
          activeVersion: [...versions].reverse().find((v: any) => v.published_at)?.version as string | undefined,
          activePublishedAt: [...versions].reverse().find((v: any) => v.published_at)?.published_at as string | undefined,
          draft: (f.draft ?? undefined) as FmdDraft | undefined,
          hasDraft: (!!latest && !latest.published_at) || !!(f.draft?.pendingChanges?.length),
          latestState: latest?.state as GovState | undefined,
          createdBy: first?.created_by ?? undefined, createdAt: first?.created_at ?? undefined,
          changedBy: hasChanged ? (latest?.created_by ?? undefined) : undefined,
          changedAt: hasChanged ? (latest?.created_at ?? undefined) : undefined,
          goldenVersionLabel: goldenVersionId ? versionLabelById.get(goldenVersionId) : undefined,
          goldenOutdated: f.type !== 'Golden' && !!goldenVersionId && !!goldenLatestVersionId && goldenVersionId !== goldenLatestVersionId,
          /** A new template version is being drafted. Informational — nothing is behind anything
           * until it is published, and this is deliberately independent of goldenOutdated: an FMD
           * can be genuinely outdated AND have a further draft coming. */
          goldenDraftPending: f.type !== 'Golden' && goldenDraftPending,
          standardRefVersionLabel: standardRefVersionId ? versionLabelById.get(standardRefVersionId) : undefined,
          standardRefOutdated: f.type === 'Custom' && !!standardRefVersionId && !!currentStandardLatestId && standardRefVersionId !== currentStandardLatestId,
          standardRefDraftPending: f.type === 'Custom' && !!f.migration_object_id && !!standardDraftPendingByObject.get(f.migration_object_id),
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

/** Every version row for an fmd, newest first — used by the Golden FMD viewer's "Versions"
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
export function useGoldenFmdSummary(enabled = true) {
  return useQuery({
    queryKey: ['golden-fmd-summary'],
    enabled,
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

/** Where one FMD sits, and what it is joined to in both directions. */
export interface FmdUsage {
  /** The Golden template this FMD was generated from, if any. */
  basedOn?: { fmdId: string; name: string; displayId?: string; version?: string; isOutdated: boolean };
}

/** What one FMD was generated FROM — the upward half of the Where-Used tab.
 *
 * Placement (programme / project / subproject / object) is deliberately NOT here. It was, resolved
 * with `subprojects(projects(programs(...)))`, and that silently returned null whenever RLS
 * filtered any level of the chain — the tab showed a real object beside three em-dashes.
 * `hierarchy.ts` already documents why: RLS filters each level independently, so the hierarchy is
 * fetched flat and joined in memory. `FmdWhereUsedTab` reads it from there.
 *
 * Every query below is a single table for the same reason.
 */
export function useFmdUsage(fmdId?: string) {
  return useQuery({
    queryKey: ['fmd-usage', fmdId],
    enabled: !!fmdId,
    queryFn: async (): Promise<FmdUsage> => {
      const { data: fmd, error } = await supabase
        .from('fmds').select('based_on_golden_version_id').eq('id', fmdId!).single();
      if (error) throw error;

      const goldenVersionId = (fmd as any).based_on_golden_version_id as string | null;
      if (!goldenVersionId) return {};

      const { data: gv, error: gvErr } = await supabase
        .from('fmd_versions').select('id, version, fmd_id').eq('id', goldenVersionId).single();
      if (gvErr) throw gvErr;

      const [templateRes, newestRes] = await Promise.all([
        supabase.from('fmds').select('name, display_id').eq('id', (gv as any).fmd_id).single(),
        // PUBLISHED only. Comparing against the newest row of any kind reported every FMD as
        // outdated the moment somebody saved a draft on the template — against a version they
        // could not have synced to even if they wanted to.
        supabase.from('fmd_versions').select('id').eq('fmd_id', (gv as any).fmd_id)
          .not('published_at', 'is', null)
          .order('created_at', { ascending: false }).limit(1),
      ]);
      if (templateRes.error) throw templateRes.error;
      if (newestRes.error) throw newestRes.error;
      const newest = newestRes.data?.[0];

      return {
        basedOn: {
          fmdId: (gv as any).fmd_id,
          name: (templateRes.data as any)?.name ?? 'Golden FMD',
          displayId: (templateRes.data as any)?.display_id ?? undefined,
          version: (gv as any).version,
          isOutdated: !!newest && newest.id !== goldenVersionId,
        },
      };
    },
  });
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
      /** The version this new one supersedes — captured so every version records what changed
       * relative to it, without anyone having to remember to ask. */
      let previousTables: GeneratedTable[] | undefined;
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
          .from('fmd_versions').select('version, sheets').eq('fmd_id', fmdId).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (latestError) throw latestError;
        // Numbered off the newest NUMBERED version, not simply the newest: an open editing draft
        // carries DRAFT_VERSION, which doesn't parse and would silently reset the count to v1.0.1.
        // The diff base below is still the newest content, draft included.
        const { data: numbered, error: numberedError } = await supabase
          .from('fmd_versions').select('version').eq('fmd_id', fmdId)
          .neq('version', DRAFT_VERSION).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (numberedError) throw numberedError;
        version = numbered ? bumpVersion(numbered.version as string) : 'v1.0.0';
        previousTables = latest?.sheets?.generatedTables as GeneratedTable[] | undefined;
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

      // Every new version is automatically compared with the one it replaces, and the result is
      // appended to that version's COMMENT. It used to be filed as a separate entry in the review
      // history, which made that list mostly duplicates — a change summary belongs with the version
      // it describes, not alongside the policy findings. Deterministic, so it always exists; null
      // only for a first version, which has nothing to compare against.
      const changeSummary = summariseVersionChange(previousTables, params.tables);
      const defaultComment = `Generated from Golden FMD ${params.goldenVersionLabel}`;
      // An explicit comment (the historical wizard passes its own full diff) already says what
      // changed — don't append a second, coarser summary on top of it.
      const comment = params.comment
        ?? (changeSummary ? `${defaultComment} — ${changeSummary}` : defaultComment);

      const { data: versionRow, error: versionError } = await supabase
        .from('fmd_versions')
        .insert({
          fmd_id: fmdId, version, state: 'Draft',
          sheets: { generatedColumns: params.columns, generatedTables: params.tables },
          comment,
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

/** Edits one cell of a generated FMD. This is how an FMD enters Draft state: if the latest version
 * is already an unpublished draft the edit lands in it directly, and if the latest version is
 * PUBLISHED (frozen — a DB trigger rejects content changes) the first edit forks a new draft from
 * it and edits that. Callers don't have to know which case they're in.
 *
 * Editing is per-cell rather than per-row so two people working on different fields of the same
 * structure don't overwrite each other's work with a stale row copy. */
export function useEditFmdField(fmdId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return {
    async saveField(params: {
      structureId: string; rowIndex: number; field: string; value: string;
    }): Promise<{ versionId: string; createdDraft: boolean; version: string }> {
      const { structureId, rowIndex, field, value } = params;

      // Read the current latest version from the DATABASE rather than trusting what the component
      // is holding. React state lags a save by one refetch, so two quick edits would both see the
      // published version and each fork their own draft — an editing session could end up with a
      // version per keystroke. Re-reading here makes "one draft per editing session" hold no matter
      // how fast edits arrive.
      const { data: current, error: readError } = await supabase
        .from('fmd_versions')
        .select('id, version, sheets, published_at')
        .eq('fmd_id', fmdId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (readError) throw readError;
      if (!current) throw new Error('This FMD has no version to edit yet.');

      const sheets = (current.sheets ?? {}) as FmdVersion['sheets'];
      const tables = sheets.generatedTables;
      if (!tables?.length) throw new Error('This version has no generated mapping data to edit.');
      const target = tables.find((t) => t.structureId === structureId);
      if (!target?.rows[rowIndex]) throw new Error('Could not locate that field.');

      // Only the unpublished branch below writes these; the published branch records the change
      // and lets the document be derived from it.
      const nextTables: GeneratedTable[] = tables.map((t) => (
        t.structureId !== structureId ? t : {
          ...t,
          rows: t.rows.map((r, i) => (i === rowIndex ? { ...r, [field]: value } : r)),
        }
      ));

      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();
      const before = target.rows[rowIndex][field] ?? '';
      const rowLabel = target.rows[rowIndex].SRC_FIELD || target.rows[rowIndex].TGT_FIELD || `Row ${rowIndex + 1}`;

      // A review point is anchored to `rowKey`, built from the row's identifying source/target
      // fields — content-based so a point survives REGENERATION. But that content is editable, so
      // renaming SRC_FIELD (or any other identity field) changed the row's identity and every point
      // on it silently detached: not deleted, just no longer matching, so they vanished from the
      // field's panel. The row is the same mapping before and after a rename, so its points move.
      if (IDENTITY_FIELDS.includes(field)) {
        const before = rowKey(target.rows[rowIndex], rowIndex);
        const after = rowKey({ ...target.rows[rowIndex], [field]: value }, rowIndex);
        if (before !== after) {
          const { error: rekeyError } = await supabase
            .from('fmd_field_notes')
            .update({ row_key: after })
            .eq('fmd_id', fmdId).eq('structure_id', structureId).eq('row_key', before);
          if (rekeyError) throw rekeyError;
          // Per-plant rules are anchored the same way and break the same way. A rule left behind by
          // a rename is not deleted, just orphaned — which is worse than deleted, because nothing
          // on screen shows that a plant override has stopped applying.
          const { error: plantRekeyError } = await supabase
            .from('fmd_plant_rules')
            .update({ row_key: after })
            .eq('fmd_id', fmdId).eq('structure_id', structureId).eq('row_key', before);
          if (plantRekeyError) throw plantRekeyError;
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['fmd-field-notes', fmdId] }),
            queryClient.invalidateQueries({ queryKey: ['fmd-plant-rules', fmdId] }),
          ]);
        }
      }
      // An unpublished version is a generation nobody has released yet — edit it in place. It needs
      // no PENDING CHANGES, because those are a publish selector and there is nothing to select:
      // publishing releases the whole version. It does need a CHANGE LOG. Without one, edits here
      // left no trace at all — the version's comment said why it existed ('Golden FMD updated') and
      // nothing recorded what anyone then changed inside it.
      if (!current.published_at) {
        const entry: FmdPendingChange = {
          id: crypto.randomUUID(), structureId, structureIdent: target.structureIdent,
          rowIndex, rowLabel, field, from: before, to: value, by: who, at: now,
        };
        const { error } = await supabase
          .from('fmd_versions')
          .update({
            sheets: {
              ...sheets,
              generatedTables: nextTables,
              changeLog: [...(sheets.changeLog ?? []), entry],
            },
            changed_by: who, changed_at: now,
          })
          .eq('id', current.id);
        if (error) throw error;
        await invalidateFmd(queryClient, fmdId);
        return { versionId: current.id as string, createdDraft: false, version: current.version as string };
      }

      // Published — the edit lands in the FMD's DRAFT, not in a new version row. `fmd_versions`
      // holds released versions and generations only; work in progress has no business appearing in
      // an FMD's version list, which is what saving a single cell used to do.
      //
      // The draft stores only the changes, never a copy of the mapping content — the edited
      // document is derived from this base plus these changes wherever it's shown, so there's one
      // copy of the data and nothing to keep in sync.
      const { data: fmdRow, error: draftReadError } = await supabase
        .from('fmds').select('draft').eq('id', fmdId).single();
      if (draftReadError) throw draftReadError;
      const stored = (fmdRow?.draft ?? undefined) as FmdDraft | undefined;
      // Changes written against a version that is no longer the baseline describe a document nobody
      // can see any more. Start clean rather than replay them onto content they were never made
      // against — the alternative is silently publishing an edit to a row that has since moved.
      const existing = stored && stored.baseVersionId === current.id ? stored.pendingChanges : [];
      const already = existing.find((c) => c.structureId === structureId && c.rowIndex === rowIndex && c.field === field);
      // Re-editing the same cell updates the destination but KEEPS the original `from`, so the
      // change always reads against what's published rather than against the last keystroke.
      const nextChanges: FmdPendingChange[] = already
        ? existing
            .map((c) => (c === already ? { ...c, to: value, by: who, at: now } : c))
            // An edit back to the published value isn't a change any more — drop it rather than
            // asking someone to publish a no-op.
            .filter((c) => c.from !== c.to)
        : [...existing, {
            id: crypto.randomUUID(), structureId, structureIdent: target.structureIdent,
            rowIndex, rowLabel, field, from: before, to: value, by: who, at: now,
          }].filter((c) => c.from !== c.to);

      const nextDraft: FmdDraft = { baseVersionId: current.id as string, pendingChanges: nextChanges };
      const { error } = await supabase
        .from('fmds')
        // Reverting the last outstanding edit clears the draft entirely rather than leaving an
        // empty one, so "there is a draft" and "there is something to publish" stay the same thing.
        .update({ draft: nextChanges.length ? nextDraft : null })
        .eq('id', fmdId);
      if (error) throw error;
      await invalidateFmd(queryClient, fmdId);
      return { versionId: DRAFT_VERSION_ID, createdDraft: !existing.length, version: DRAFT_VERSION };
    },
  };
}

/** Adds a field or a whole structure to a generated FMD — things the Golden template never gave it.
 *
 * **Always produces a real draft VERSION, never a pending change.** A pending change is a cell edit
 * (`structureId`, `rowIndex`, `field`, `from`, `to`); the model has no way to say "a row appeared",
 * and inventing one would mean every consumer of `applyPendingChanges` — the draft overlay, the
 * publish selector, the diff — learning to insert rows at a position that other pending changes are
 * already indexed against. Adding a field changes the document's SHAPE, which is a different kind of
 * act from changing a value, and it gets a version of its own.
 *
 * Anything already pending is folded into that version, exactly as goldenSync does. Without it the
 * edits would still be stored but invisible — a real version row wins over the overlay — and
 * publishing would silently release without them.
 */
export function useAddFmdContent(fmdId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  /** Reads the newest version, folds in any pending overlay, and hands back a writer that lands the
   * result either in the existing unpublished row or in a fresh one. */
  const openDraft = async () => {
    const { data: current, error: readError } = await supabase
      .from('fmd_versions')
      .select('id, version, sheets, published_at')
      .eq('fmd_id', fmdId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error('This FMD has no version to add to yet.');

    const sheets = (current.sheets ?? {}) as FmdVersion['sheets'];
    if (!sheets.generatedTables?.length) throw new Error('This version has no generated mapping data to add to.');

    const { data: fmdRow, error: draftReadError } = await supabase
      .from('fmds').select('draft').eq('id', fmdId).single();
    if (draftReadError) throw draftReadError;
    const stored = (fmdRow?.draft as FmdDraft | null) ?? undefined;
    const pending = stored && stored.baseVersionId === current.id ? (stored.pendingChanges ?? []) : [];

    const tables = pending.length
      ? applyPendingChanges(sheets.generatedTables, pending)
      : sheets.generatedTables;

    return { current, sheets, tables, pending };
  };

  const write = async (
    current: { id: string; version: string; published_at: string | null },
    _sheets: FmdVersion['sheets'],
    nextSheets: FmdVersion['sheets'],
    comment: string,
    hadPending: boolean,
  ) => {
    const who = user?.email ?? 'Unknown';
    const now = new Date().toISOString();

    if (!current.published_at) {
      // Already a working copy — edit it in place, exactly as a cell edit does.
      const { error } = await supabase
        .from('fmd_versions')
        .update({ sheets: nextSheets, changed_by: who, changed_at: now })
        .eq('id', current.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('fmd_versions').insert({
        fmd_id: fmdId,
        version: bumpVersion(current.version),
        state: 'Draft',
        sheets: nextSheets,
        comment,
        created_by: who, created_at: now,
      });
      if (error) throw error;
    }

    // Folded into the version above, so the overlay must not replay them on top of it.
    if (hadPending) {
      const { error } = await supabase.from('fmds').update({ draft: null }).eq('id', fmdId);
      if (error) throw error;
    }
    await invalidateFmd(queryClient, fmdId);
  };

  return {
    /* No addField. A COLUMN is part of what an FMD is, and every FMD is generated from one
       template — adding one to a single document would make it a different shape from its
       siblings, and no export, diff or review would agree on what an FMD contains. Columns are
       added in the Golden FMD designer, where the change reaches every document that follows it. */


    /** Appends a whole structure — a new tab in the grid, with the document's columns and no rows.
     *
     * Rows are added by editing; a structure arrives empty because there is nothing to derive its
     * contents from. The ident is what the grid tabs and every export sheet name key on, so it is
     * uppercased and checked for collisions here rather than producing two tabs with one name. */
    /** Reorders this document's columns.
     *
     * Order is presentation, not definition — which is exactly why it belongs here while ADDING a
     * column does not. The Golden template decides what columns an FMD has; a Custom FMD, built for
     * one object in one subproject, can decide what order its own reader sees them in. Nothing about
     * what the document contains changes, so no other FMD is affected and no regeneration is due.
     *
     * The row objects are untouched: a row is keyed by field name, and JS object key order is not
     * what the grid or the export reads. `generatedColumns` IS the order, everywhere — grid, Excel
     * export, field-level view — so moving entries in that one array moves all three together.
     *
     * Still a draft version, like the other shape changes: a pending change is a cell edit and
     * cannot express "the columns moved". */
    async reorderColumns(fields: string[]): Promise<void> {
      const { current, sheets, tables, pending } = await openDraft();
      const columns = sheets.generatedColumns ?? [];

      const byField = new Map(columns.map((c) => [c.field, c]));
      const next = fields.flatMap((f) => byField.get(f) ?? []);
      // Anything the caller did not name keeps its place at the end rather than being dropped. A
      // reorder that silently loses a column would be a data change wearing a layout change's
      // clothes — and the caller is a UI list that can go stale mid-edit.
      for (const c of columns) if (!fields.includes(c.field)) next.push(c);
      if (next.length !== columns.length) throw new Error('That reorder would change which columns exist.');

      await write(
        current as any, sheets,
        { ...sheets, generatedColumns: next, generatedTables: tables },
        'Reordered columns',
        pending.length > 0,
      );
    },

    /** Moves one row within a structure.
     *
     * A row IS a field in an FMD — one source field mapped to one target — so this is what
     * "rearrange the fields" means: putting the mapping lines in the order somebody wants to read
     * and build them in, usually grouping related fields that generation emitted apart.
     *
     * ── Why the stored review has to be remapped ──────────────────────────────────────────────
     * A finding pins `structureId + rowIndex + field`. Move a row and every finding after it points
     * at the wrong line — silently, because an index is always a valid index. The review would keep
     * rendering, just against the wrong rows, which is worse than losing it. So the indices move
     * with the rows.
     *
     * Review POINTS need no such care: they are anchored to the content-based `row_key`, which is
     * exactly why that decision was made. Pending changes need none either — `openDraft` folds them
     * into the content first and the draft is cleared, so there are no index-bearing edits left to
     * invalidate.
     */
    async reorderRows(structureId: string, from: number, to: number): Promise<void> {
      if (from === to) return;
      const { current, sheets, tables, pending } = await openDraft();
      const target = tables.find((t) => t.structureId === structureId);
      if (!target) throw new Error('Could not locate that structure.');
      if (from < 0 || from >= target.rows.length || to < 0 || to >= target.rows.length) {
        throw new Error('That row is no longer where it was — reopen the FMD and try again.');
      }

      const rows = [...target.rows];
      rows.splice(to, 0, ...rows.splice(from, 1));

      /** oldIndex -> newIndex for this structure, derived from the same splice rather than from a
       * second piece of arithmetic that could disagree with it. */
      const moved = new Map<number, number>();
      const order = target.rows.map((_, i) => i);
      order.splice(to, 0, ...order.splice(from, 1));
      order.forEach((oldIndex, newIndex) => moved.set(oldIndex, newIndex));

      const remap = (review?: MappingReview): MappingReview | undefined => (review && {
        ...review,
        findings: review.findings.map((f) => (
          f.structureId === structureId && f.rowIndex >= 0
            // A finding at -1 belongs to the structure rather than to a row (see mappingReview.ts)
            // and must keep its sentinel, not be renumbered into row 0.
            ? { ...f, rowIndex: moved.get(f.rowIndex) ?? f.rowIndex }
            : f
        )),
      });

      await write(
        current as any, sheets,
        {
          ...sheets,
          generatedTables: tables.map((t) => (t.structureId === structureId ? { ...t, rows } : t)),
          mappingReview: remap(sheets.mappingReview),
          mappingReviews: sheets.mappingReviews?.map((r) => remap(r)!),
        },
        `Reordered rows in ${target.structureIdent}`,
        pending.length > 0,
      );
    },

    async addStructure(ident: string, description?: string): Promise<void> {
      const name = ident.trim().toUpperCase();
      if (!name) throw new Error('Give the structure a name.');

      const { current, sheets, tables, pending } = await openDraft();
      if (tables.some((t) => t.structureIdent.trim().toUpperCase() === name)) {
        throw new Error(`${name} already exists in this FMD.`);
      }

      const nextTables: GeneratedTable[] = [
        ...tables,
        { structureId: crypto.randomUUID(), structureIdent: name, structureDescription: description?.trim() || undefined, rows: [] },
      ];

      await write(
        current as any, sheets,
        { ...sheets, generatedTables: nextTables },
        `Added custom structure ${name}`,
        pending.length > 0,
      );
    },

    /** Appends an empty row to one structure, so a custom field has somewhere to be filled in. */
    async addRow(structureId: string): Promise<void> {
      const { current, sheets, tables, pending } = await openDraft();
      const target = tables.find((t) => t.structureId === structureId);
      if (!target) throw new Error('Could not locate that structure.');

      const blank: Record<string, string> = {};
      for (const c of sheets.generatedColumns ?? []) blank[c.field] = '';
      blank.FIELD_TYPE = CUSTOM_FIELD_TYPE;

      const nextTables: GeneratedTable[] = tables.map((t) => (
        t.structureId !== structureId ? t : { ...t, rows: [...t.rows, blank] }
      ));

      await write(
        current as any, sheets,
        { ...sheets, generatedTables: nextTables },
        `Added a custom field row to ${target.structureIdent}`,
        pending.length > 0,
      );
    },
  };
}

const invalidateFmd = (queryClient: ReturnType<typeof useQueryClient>, fmdId: string) => Promise.all([
  queryClient.invalidateQueries({ queryKey: ['fmd-versions', fmdId] }),
  queryClient.invalidateQueries({ queryKey: ['fmd-version-latest', fmdId] }),
  queryClient.invalidateQueries({ queryKey: ['fmds-library'] }),
]);

/** Publishes SELECTED changes out of a draft. Anything left unticked stays pending in a new draft,
 * so a long editing session can be released in slices — you don't have to publish two hundred edits
 * because you wanted to release three.
 *
 * The published version is built from the last published content plus the chosen changes, NOT from
 * the draft as it stands, which is what makes leaving changes behind actually work. Publishing
 * freezes the result: a DB trigger rejects later content edits.
 *
 * Two things arrive here as `draft`, and they publish differently:
 *  - the `draftOverlayVersion` of uncommitted edits (id `DRAFT_VERSION_ID`), which has no row yet
 *    and so INSERTS the new version — this is the only point at which editing creates one;
 *  - a real unpublished row (a generation nobody has released), which is UPDATED in place. */
export function usePublishFmdVersion() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return {
    async publish(params: {
      draft: FmdVersion; fmdId: string; selectedChangeIds: string[]; basePublished?: FmdVersion;
      state?: GovState;
    }): Promise<{ published: string; remaining: number }> {
      const { draft, fmdId, selectedChangeIds, basePublished, state = 'Approved' } = params;
      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();
      const pending = draft.sheets.pendingChanges ?? [];
      const selected = pending.filter((c) => selectedChangeIds.includes(c.id));
      const remaining = pending.filter((c) => !selectedChangeIds.includes(c.id));

      // Nothing left behind, or nothing published before — release the draft's content as it stands.
      const publishWholeDraft = remaining.length === 0 || !basePublished?.sheets.generatedTables?.length;
      const publishedTables = publishWholeDraft
        ? draft.sheets.generatedTables ?? []
        : applyPendingChanges(basePublished!.sheets.generatedTables!, selected);

      const { pendingChanges: _p, ...rest } = draft.sheets;

      /** A review describes the content it ran against. An INHERITED one (stamped `inheritedFrom`
       * by `draftOverlayVersion`) ran against the previous published version — carrying it onto the
       * version being released now asserts that this content was reviewed when it never was, and
       * its findings then highlight cells in a version they were never about. The reviewer's work
       * is not lost: it stays on the version it actually assessed, and the draft keeps showing it
       * while you fix things. It simply does not get promoted.
       *
       * A review with no `inheritedFrom` ran against this content and is published with it. */
      const draftSheets = {
        ...rest,
        mappingReview: rest.mappingReview?.inheritedFrom ? undefined : rest.mappingReview,
        mappingReviews: rest.mappingReviews?.filter((r) => !r.inheritedFrom),
      };

      // The number is allocated HERE, not when the draft was opened, so it always follows what is
      // actually published at this moment.
      // Every version of this FMD, so the new number can't land on one that already exists.
      const { data: allVersions, error: versionsError } = await supabase
        .from('fmd_versions').select('version').eq('fmd_id', fmdId);
      if (versionsError) throw versionsError;
      const releasedVersion = nextPublishedVersion(draft, allVersions ?? []);

      // The version's comment becomes the change log for what was actually released. The draft's
      // own comment ("Working draft from v1.0.0") describes how the draft started, which is useless
      // once it's a published version in the history — what people need there is what changed.
      // It does NOT list them. The comment used to spell out every change as a bullet, because at
      // the time nothing else recorded what a version contained. `changeLog` does now, structured
      // and with the author and timestamp per entry — so listing them here printed the same three
      // edits twice on one pane, once as prose and once as data. The comment summarises; the log is
      // the record.
      const heldBack = remaining.length && !publishWholeDraft
        ? ` ${remaining.length} change${remaining.length === 1 ? '' : 's'} held back in a new draft.`
        : '';
      const comment = selected.length
        ? `Published ${selected.length} change${selected.length === 1 ? '' : 's'}.${heldBack}`
        : draft.comment ?? `Published ${releasedVersion}`;

      const row = {
        sheets: {
          ...draftSheets,
          generatedTables: publishedTables,
          // What actually produced this version, kept with it. The comment summarises and truncates
          // at 20 lines; this is the full record, and it is what the Version details pane reads.
          // Appended to anything the version already logged — an unreleased row that was edited in
          // place before being published has its own log, and both halves belong to this version.
          changeLog: [...(draftSheets.changeLog ?? []), ...selected],
          // Pending changes are a publish selector and this version is now published: whatever was
          // held back has already been re-based into a fresh draft below.
          pendingChanges: undefined,
        },
        comment, version: releasedVersion,
        state, published_by: who, published_at: now,
      };

      if (draft.id === DRAFT_VERSION_ID) {
        // Uncommitted edits have no row of their own. This is where the version is created — the
        // only place editing ever adds one.
        const { error: pubError } = await supabase
          .from('fmd_versions')
          .insert({ ...row, fmd_id: fmdId, created_by: who, created_at: now });
        if (pubError) throw pubError;
      } else {
        const { error: pubError } = await supabase.from('fmd_versions').update(row).eq('id', draft.id);
        if (pubError) throw pubError;
      }

      // Whatever wasn't released stays in the FMD's draft, re-based onto what was just published so
      // its `from` values still describe what everyone else can now see.
      const heldOver = !publishWholeDraft && remaining.length > 0;
      if (heldOver || draft.id === DRAFT_VERSION_ID) {
        const { data: published, error: findError } = await supabase
          .from('fmd_versions').select('id').eq('fmd_id', fmdId).eq('version', releasedVersion).single();
        if (findError) throw findError;
        const { error: draftError } = await supabase
          .from('fmds')
          .update({ draft: heldOver ? { baseVersionId: published.id, pendingChanges: remaining } : null })
          .eq('id', fmdId);
        if (draftError) throw draftError;
      }

      await invalidateFmd(queryClient, fmdId);
      return { published: releasedVersion, remaining: publishWholeDraft ? 0 : remaining.length };
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

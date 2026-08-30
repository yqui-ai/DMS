import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { formatLibraryReference } from '../libraryReference';
import { DRAFT_VERSION, bumpVersion } from '../fmdDraft';
import type { GoldenFmdStructure, GovState, LibraryListing, Rule, XrefRow, XrefTable, XrefVersion } from '../../types/entities';

/* Version numbering and the draft sentinel come from `fmdDraft`. The XREF follows the same
   draft-then-publish rule as the FMD (migration 0059), so it has to follow the same numbering — a
   local copy of `bumpVersion` lived here, and that is the kind of duplicate that agrees right up
   until one of the two gets fixed. */

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
  /** The newest version row of any kind, derived from xref_versions — not the dead
   * xref_tables.version column, which no mutation has written to since versioning was introduced.
   * This can be an unpublished draft, so it is NOT what the catalogue should call "the" version. */
  latestVersion?: string; latestVersionId?: string;
  /** The newest PUBLISHED version — what everyone else should treat as the live template. */
  activeVersion?: string;
  /** The newest version is an unpublished draft. Independent of activeVersion: a table that has
   * been published once and is now being edited again has both, exactly as an FMD does. */
  hasDraft?: boolean;
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
        .select('*, subprojects(projects(code, program_id, programs(code))), xref_versions!xref_table_id(id, version, created_at, published_at)')
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
          // Same split the FMD list makes: the catalogue's Version column has to name the LIVE
          // template, and since 0059 the newest row may be a draft nobody has released.
          activeVersion: versions.find((v: any) => v.published_at)?.version as string | undefined,
          hasDraft: !!versions[0] && !versions[0].published_at,
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
  // published_at is what makes a version live and frozen — `state` is a word anyone can set.
  publishedBy: v.published_by ?? undefined, publishedAt: v.published_at ?? undefined,
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
    // The per-subproject list reads the same table and was the one cache a Golden XREF write never
    // cleared, so a newly created Golden XREF was absent from Rules > Value Mapping while being
    // present in the Library. This is the third key the library-section-design skill names for
    // `xref_tables`; it was the only one missing.
    queryClient.invalidateQueries({ queryKey: ['xref-tables'] }),
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
    /** Saves the working DRAFT — it does not release anything.
     *
     * This used to insert a new numbered version on every save, so editing the template published
     * it: open the designer, change one field, save, and the programme's live Golden XREF had
     * moved. The FMD has never worked that way, and two templates in one catalogue versioned by
     * opposite rules is a trap rather than a preference.
     *
     * Now it mirrors `fmds.ts`: mutate the newest unpublished row in place, or start one if the
     * newest is published. There is deliberately no merge for a second concurrent draft — the
     * unique (xref_table_id, version) index makes 'Draft' one-per-table, which is the intended
     * model rather than an accident of it. */
    async saveDraft(xrefTableId: string, structure: GoldenFmdStructure, comment: string): Promise<string> {
      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();

      const { data: newest, error: readError } = await supabase
        .from('xref_versions')
        .select('id, published_at')
        .eq('xref_table_id', xrefTableId)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle();
      if (readError) throw readError;

      if (newest && !newest.published_at) {
        const { error } = await supabase
          .from('xref_versions')
          .update({ structure, comment, created_by: who, created_at: now })
          .eq('id', newest.id);
        if (error) throw error;
        await invalidate();
        return newest.id as string;
      }

      // Numbered at publish, not here — nothing carries a version until somebody decides it is
      // finished, which is what the literal 'Draft' says out loud.
      const { data: created, error } = await supabase
        .from('xref_versions')
        .insert({
          xref_table_id: xrefTableId, version: DRAFT_VERSION, state: 'Draft',
          structure, comment, created_by: who, created_at: now,
        })
        .select('id').single();
      if (error) throw error;
      await invalidate();
      return created.id as string;
    },

    /** Releases the draft: assigns the next number and freezes it.
     *
     * The number comes from what is already PUBLISHED, not from the newest row — a draft carries
     * the literal 'Draft', which does not parse, and bumping from it would reset the count. */
    async publishDraft(xrefTableId: string, comment?: string): Promise<string> {
      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();

      const { data: rows, error: readError } = await supabase
        .from('xref_versions')
        .select('id, version, comment, published_at')
        .eq('xref_table_id', xrefTableId)
        .order('created_at', { ascending: false });
      if (readError) throw readError;

      const draft = (rows ?? []).find((r: any) => !r.published_at);
      if (!draft) throw new Error('There is no draft to publish.');
      const lastNumbered = (rows ?? []).find((r: any) => r.published_at && r.version !== DRAFT_VERSION);
      const next = lastNumbered ? bumpVersion(lastNumbered.version as string) : 'v1.0.0';

      const { error } = await supabase
        .from('xref_versions')
        .update({
          version: next, state: 'Approved',
          comment: comment?.trim() || (draft as any).comment || `Published ${next}`,
          published_by: who, published_at: now,
        })
        .eq('id', draft.id);
      if (error) throw error;
      await invalidate();
      return next;
    },
  };
}

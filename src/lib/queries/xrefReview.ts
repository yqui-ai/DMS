import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { DRAFT_VERSION, bumpVersion } from '../fmdDraft';
import { formatLibraryReference } from '../libraryReference';
import type { GoldenFmdStructure } from '../../types/entities';

/** A review point on an XREF template. The FMD's `FmdFieldNote` with a different anchor: a template
 * has no rows, so a point is about a field, a section, or the document as a whole. */
export interface XrefReviewPoint {
  id: string;
  xrefTableId: string;
  /** Both null for a point about the template as a whole. */
  sectionId?: string;
  field?: string;
  tag: string;
  parentId?: string;
  body: string;
  resolved: boolean;
  createdBy: string;
  createdAt: string;
}

const toPoint = (p: any): XrefReviewPoint => ({
  id: p.id, xrefTableId: p.xref_table_id,
  sectionId: p.section_id ?? undefined, field: p.field ?? undefined,
  tag: p.tag, parentId: p.parent_id ?? undefined,
  body: p.body, resolved: !!p.resolved,
  createdBy: p.created_by, createdAt: p.created_at,
});

/** Every review point on one XREF template, oldest first so a thread reads top to bottom.
 *
 * Fetched per table rather than per field, like the FMD's: the panes filter this down, and a query
 * per field click would be slower and would lose the counts every other surface wants. */
export function useXrefReviewPoints(xrefTableId?: string) {
  return useQuery({
    queryKey: ['xref-review-points', xrefTableId],
    enabled: !!xrefTableId,
    queryFn: async (): Promise<XrefReviewPoint[]> => {
      const { data, error } = await supabase
        .from('xref_review_points').select('*')
        .eq('xref_table_id', xrefTableId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toPoint);
    },
  });
}

export function useXrefReviewMutations(xrefTableId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['xref-review-points', xrefTableId] });

  return {
    /** `field`/`sectionId` pin the point; omit both for one about the whole template. */
    async add(tag: string, body: string, sectionId?: string, field?: string): Promise<void> {
      const { error } = await supabase.from('xref_review_points').insert({
        xref_table_id: xrefTableId, tag, body: body.trim(),
        section_id: sectionId ?? null, field: field ?? null,
        created_by: user?.email ?? 'Unknown',
      });
      if (error) throw error;
      await invalidate();
    },
    /** A reply inherits the parent's anchor, so a thread stays attached to the same field even
     * though only the parent is rendered against it. */
    async reply(parent: XrefReviewPoint, body: string): Promise<void> {
      const { error } = await supabase.from('xref_review_points').insert({
        xref_table_id: xrefTableId,
        section_id: parent.sectionId ?? null, field: parent.field ?? null,
        parent_id: parent.id, tag: 'remark', body: body.trim(),
        created_by: user?.email ?? 'Unknown',
      });
      if (error) throw error;
      await invalidate();
    },
    /** Resolving keeps the point as a record that the change was made; it just stops counting as
     * outstanding. Deleting it would erase the reason the template changed. */
    async setResolved(id: string, resolved: boolean): Promise<void> {
      const { error } = await supabase.from('xref_review_points').update({ resolved }).eq('id', id);
      if (error) throw error;
      await invalidate();
    },
    async remove(id: string): Promise<void> {
      const { error } = await supabase.from('xref_review_points').delete().eq('id', id);
      if (error) throw error;
      await invalidate();
    },
  };
}

/** One table generated from the Golden XREF, and whether it is still current. */
export interface XrefWhereUsedRow {
  id: string;
  name: string;
  displayId?: string;
  reference: string;
  /** The Golden version it was built from. Undefined means it never was. */
  basedOnVersion?: string;
  basedOnVersionId?: string;
  /** Built from a Golden version that is no longer the latest published one. */
  isOutdated: boolean;
  /** Never generated from the template at all — a different state from outdated, and the more
   * common one, since every table predating this lineage is in it. */
  neverBuilt: boolean;
}

/** Which XREF tables were built from the Golden template, and which have fallen behind.
 *
 * The FMD's `useGoldenWhereUsed`, keyed the same way: the answer changes when the Golden publishes,
 * so `latestVersionId` is part of the query key rather than something compared after the fact.
 *
 * Flat queries and an in-memory join, never a nested embed — `subprojects(projects(programs(...)))`
 * returns null whenever RLS filters any level of the chain, silently, which is how the FMD's
 * where-used once rendered a populated hierarchy as four dashes. */
export function useXrefWhereUsed(goldenXrefId?: string, latestVersionId?: string) {
  return useQuery({
    queryKey: ['xref-where-used', goldenXrefId, latestVersionId],
    enabled: !!goldenXrefId,
    queryFn: async (): Promise<XrefWhereUsedRow[]> => {
      const { data: tables, error } = await supabase
        .from('xref_tables')
        .select('id, name, display_id, class, subproject_id, based_on_golden_version_id')
        .neq('type', 'Golden')
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      const rows = tables ?? [];
      if (rows.length === 0) return [];

      // The version labels for whatever the rows point at, and the program/project codes for their
      // reference — two flat lookups rather than one embed.
      const versionIds = [...new Set(rows.map((t: any) => t.based_on_golden_version_id).filter(Boolean))];
      const versionLabel = new Map<string, string>();
      if (versionIds.length > 0) {
        const { data: versions, error: vErr } = await supabase
          .from('xref_versions').select('id, version').in('id', versionIds);
        if (vErr) throw vErr;
        for (const v of versions ?? []) versionLabel.set(v.id as string, v.version as string);
      }

      const subprojectIds = [...new Set(rows.map((t: any) => t.subproject_id).filter(Boolean))];
      const codes = new Map<string, { programCode?: string; projectCode?: string }>();
      if (subprojectIds.length > 0) {
        const { data: subs, error: sErr } = await supabase
          .from('subprojects').select('id, project_id').in('id', subprojectIds);
        if (sErr) throw sErr;
        const projectIds = [...new Set((subs ?? []).map((s: any) => s.project_id).filter(Boolean))];
        const { data: projects } = projectIds.length
          ? await supabase.from('projects').select('id, code, program_id').in('id', projectIds)
          : { data: [] as any[] };
        const programIds = [...new Set((projects ?? []).map((p: any) => p.program_id).filter(Boolean))];
        const { data: programs } = programIds.length
          ? await supabase.from('programs').select('id, code').in('id', programIds)
          : { data: [] as any[] };
        const programCode = new Map((programs ?? []).map((p: any) => [p.id, p.code as string]));
        const project = new Map((projects ?? []).map((p: any) => [p.id, p]));
        for (const s of subs ?? []) {
          const pj = project.get((s as any).project_id);
          codes.set((s as any).id, {
            projectCode: pj?.code, programCode: pj ? programCode.get(pj.program_id) : undefined,
          });
        }
      }

      return rows.map((t: any) => {
        const basedOnVersionId = t.based_on_golden_version_id as string | undefined;
        const place = t.subproject_id ? codes.get(t.subproject_id) : undefined;
        return {
          id: t.id, name: t.name, displayId: t.display_id ?? undefined,
          reference: formatLibraryReference(t.class, place?.programCode, place?.projectCode),
          basedOnVersionId,
          basedOnVersion: basedOnVersionId ? versionLabel.get(basedOnVersionId) : undefined,
          // "Outdated" needs a version to be outdated FROM. A table that was never built is not
          // behind the template; it has no relationship with it at all, and telling someone to
          // update something that was never generated sends them looking for a change that isn't
          // there.
          isOutdated: !!basedOnVersionId && !!latestVersionId && basedOnVersionId !== latestVersionId,
          neverBuilt: !basedOnVersionId,
        };
      });
    },
  });
}

/** Generates a table's structure from the current Golden template and records what it came from.
 *
 * This is what makes Where used answerable at all: before it, nothing wrote
 * `based_on_golden_version_id`, so every row read as "never built" forever.
 *
 * The generated version arrives PUBLISHED, matching FMD generation — a generated document is a
 * released fact about the template it came from, not somebody's working draft. The editable-draft
 * model in 0059 is for the Golden template itself, where a human is making the changes. */
export function useBuildXrefFromGolden() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return {
    async build(xrefTableId: string, goldenVersionId: string, goldenVersion: string, structure: GoldenFmdStructure): Promise<string> {
      const who = user?.email ?? 'Unknown';
      const now = new Date().toISOString();

      // Numbered from what this table has already published, not from the Golden's number — the two
      // histories are independent, and borrowing the template's number would make a table's own
      // version jump whenever the template moved.
      const { data: existing, error: readError } = await supabase
        .from('xref_versions')
        .select('version, published_at')
        .eq('xref_table_id', xrefTableId)
        .order('created_at', { ascending: false });
      if (readError) throw readError;

      const lastNumbered = (existing ?? []).find((v: any) => v.published_at && v.version !== DRAFT_VERSION);
      const next = lastNumbered ? bumpVersion(lastNumbered.version as string) : 'v1.0.0';

      const { error: insertError } = await supabase.from('xref_versions').insert({
        xref_table_id: xrefTableId, version: next, state: 'Approved',
        structure, comment: `Built from Golden XREF ${goldenVersion}`,
        created_by: who, created_at: now, published_by: who, published_at: now,
      });
      if (insertError) throw insertError;

      const { error: linkError } = await supabase
        .from('xref_tables')
        .update({ based_on_golden_version_id: goldenVersionId })
        .eq('id', xrefTableId);
      if (linkError) throw linkError;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['xref-where-used'] }),
        queryClient.invalidateQueries({ queryKey: ['xref-tables-library'] }),
        queryClient.invalidateQueries({ queryKey: ['xref-versions', xrefTableId] }),
      ]);
      return next;
    },
  };
}

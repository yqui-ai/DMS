import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeftRight, Database, Files, Layers, ListChecks, type LucideIcon } from 'lucide-react';
import { usePrograms, useProjectsForPrograms, useSubprojects } from './queries/programme';
import { useMigrationObjects } from './queries/scope';
import { useLibraryFmds } from './queries/fmds';
import { useLibraryRules, useLibraryXrefTables } from './queries/rules';
import { libraryPath } from './libraryNav';
import { fmtApproach } from './format';

export type CategoryKey = 'subprojects' | 'objects' | 'fmds' | 'rules' | 'xref';

/** Most-specific first. A search for "PROJECT" should surface the one subproject before three
 * hundred field mappings that merely mention it. */
export const CATEGORY_ORDER: CategoryKey[] = ['subprojects', 'objects', 'fmds', 'rules', 'xref'];

export interface SearchHit {
  id: string;
  /** What you typed at, in the record's own words. */
  title: string;
  /** Where it sits / what it is — never a repeat of the title. */
  subtitle?: string;
  to: string;
  /** Where the record lives, for the scope filters. Undefined means program-wide: a Golden FMD or
   * a Global XREF belongs to no single subproject, and filtering one out of its own programme
   * would be wrong. `resolveScope` is what turns these into a keep/drop decision. */
  subprojectId?: string;
  projectId?: string;
  programId?: string;
}

export interface ScopeFilter { programId?: string; projectId?: string; subprojectId?: string }

/** Whether a hit survives the scope filters.
 *
 * Program-wide records (no subproject of their own) pass a PROGRAM filter and fail the narrower
 * two. That asymmetry is deliberate: the Golden FMD is genuinely in scope for the whole programme,
 * but "show me what's in Wave 1A" should not return something that isn't in any wave. */
export const inScope = (hit: SearchHit, f: ScopeFilter): boolean => {
  if (f.subprojectId) return hit.subprojectId === f.subprojectId;
  if (f.projectId) return hit.projectId === f.projectId;
  if (f.programId) return !hit.programId || hit.programId === f.programId;
  return true;
};

export interface SearchGroup {
  key: CategoryKey;
  label: string;
  icon: LucideIcon;
  hits: SearchHit[];
  /** Matches beyond `limit`, so a capped list can be honest about what it's hiding. */
  overflow: number;
}

const LABELS: Record<CategoryKey, string> = {
  subprojects: 'Subprojects',
  objects: 'Migration objects',
  fmds: 'Field mappings',
  rules: 'Rules',
  xref: 'Cross references',
};

const ICONS: Record<CategoryKey, LucideIcon> = {
  subprojects: Layers,
  objects: Database,
  fmds: Files,
  rules: ListChecks,
  xref: ArrowLeftRight,
};

/** Two characters is the floor. One character matches most of the catalogue, which is slower to
 * render than it is useful to read. */
export const MIN_QUERY = 2;

const join = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ') || undefined;

/** Every record the user can reach, grouped by what kind of record it is.
 *
 * Shared by the header dropdown and the search page so the two can never disagree about what
 * matches — they differ only in `limit`. Matching runs over the TanStack caches the catalogues
 * already fill, so nothing appears here that RLS wouldn't have shown on the screen it links to.
 *
 * `enabled` gates the underlying queries: four catalogue reads are heavy enough that firing them on
 * every page, to power a box most visits never touch, would be a real cost. */
export function useSearchResults(query: string, { limit = 5, enabled = true }: { limit?: number; enabled?: boolean } = {}): SearchGroup[] {
  const { programId, subprojectId } = useParams();

  const { data: programs = [] } = usePrograms();
  const programIds = useMemo(() => (enabled ? programs.map((p) => p.id) : []), [enabled, programs]);
  const { data: projects = [] } = useProjectsForPrograms(programIds);
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const { data: subprojects = [] } = useSubprojects(projectIds);
  const { data: objects = [] } = useMigrationObjects(enabled);
  const { data: fmds = [] } = useLibraryFmds(enabled);
  const { data: rules = [] } = useLibraryRules(enabled);
  const { data: xrefs = [] } = useLibraryXrefTables(enabled);

  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < MIN_QUERY) return [];

    const hit = (...fields: (string | undefined)[]) => fields.some((f) => !!f && f.toLowerCase().includes(q));
    const to = (segment: string, id?: string) => libraryPath(segment, programId, subprojectId) + (id ? `/${id}` : '');
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const programById = new Map(programs.map((p) => [p.id, p]));
    /** subproject -> its project and programme, so a record that only knows its subproject can
     * still be filtered by either of the levels above it. */
    const scopeOf = (subprojectId?: string) => {
      const sub = subprojectId ? subprojects.find((s) => s.id === subprojectId) : undefined;
      const project = sub ? projectById.get(sub.projectId) : undefined;
      return { subprojectId: sub?.id, projectId: project?.id, programId: project?.programId };
    };
    const scopeLabel = (subprojectId?: string) => {
      const sub = subprojectId ? subprojects.find((s) => s.id === subprojectId) : undefined;
      return sub?.name;
    };

    const all: Record<CategoryKey, SearchHit[]> = {
      subprojects: subprojects
        .filter((s) => hit(s.name, s.code, s.description))
        .map((s) => {
          const project = projectById.get(s.projectId);
          const program = project ? programById.get(project.programId) : undefined;
          return {
            id: s.id,
            title: s.name,
            subtitle: [program?.name, project?.name].filter(Boolean).join(' › ') || undefined,
            to: project ? `/pg/${project.programId}/sp/${s.id}/dashboard` : '/',
            subprojectId: s.id, projectId: project?.id, programId: project?.programId,
          };
        }),

      objects: objects
        .filter((o) => hit(o.objectId, o.technicalName, o.description))
        .map((o) => ({
          id: o.id,
          title: o.objectId,
          subtitle: join(o.description, fmtApproach(o.approach ?? '') || undefined),
          to: to('objects', o.id),
          // The catalogue is programme-wide; an object belongs to no project or subproject.
          programId: o.programId,
        })),

      fmds: fmds
        .filter((f) => hit(f.name, f.displayId, f.reference))
        .map((f) => ({
          id: f.id,
          title: f.displayId ?? f.name,
          subtitle: join(f.displayId ? f.name : undefined, f.type, f.activeVersion, scopeLabel(f.subprojectId)),
          to: to('fmds', f.id),
          ...scopeOf(f.subprojectId),
        })),

      // Rule is the one Library screen with no detail view (see the library-section-design skill),
      // so a hit opens the catalogue already narrowed to it rather than an unfiltered list.
      rules: rules
        .filter((r) => hit(r.code, r.name, r.displayId))
        .map((r) => ({
          id: r.id,
          title: r.displayId ?? r.code,
          subtitle: join(r.name, r.type, r.severity, scopeLabel(r.subprojectId)),
          to: `${to('rules')}?q=${encodeURIComponent(r.code)}`,
          ...scopeOf(r.subprojectId),
        })),

      // Only Golden XREFs have a viewer; the rest are inert rows with nowhere to open.
      xref: xrefs
        .filter((x) => hit(x.name, x.displayId, x.purpose))
        .map((x) => ({
          id: x.id,
          title: x.displayId ?? x.name,
          subtitle: join(x.displayId ? x.name : undefined, x.type, scopeLabel(x.subprojectId) ?? x.reference),
          to: x.type === 'Golden' ? to('xref', x.id) : to('xref'),
          ...scopeOf(x.subprojectId),
        })),
    };

    return CATEGORY_ORDER
      .map((key) => ({
        key,
        label: LABELS[key],
        icon: ICONS[key],
        hits: all[key].slice(0, limit),
        overflow: Math.max(0, all[key].length - limit),
      }))
      .filter((g) => g.hits.length > 0);
  }, [query, limit, subprojects, projects, programs, objects, fmds, rules, xrefs, programId, subprojectId]);
}

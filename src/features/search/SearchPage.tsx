import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { Toolbar } from '../../components/Toolbar';
import { Segmented } from '../../components/Segmented';
import { Select } from '../../components/Select';
import { usePrograms, useProjectsForPrograms, useSubprojects } from '../../lib/queries/programme';
import { inScope, useSearchResults, type CategoryKey, type ScopeFilter } from '../../lib/search';

/** The whole result set, for when the header dropdown's five-per-category isn't enough.
 *
 * Same matcher and same records as the dropdown — it calls `useSearchResults` rather than
 * reimplementing it, so a hit can never appear in one and not the other. What differs is how much
 * is shown and what can be narrowed: the dropdown is a shortcut for the obvious hit, this is for
 * working through everything.
 *
 * Every control writes to the URL, so a narrowed search is a link someone can send. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const category = (params.get('in') ?? 'all') as CategoryKey | 'all';
  const scope: ScopeFilter = {
    programId: params.get('pg') ?? undefined,
    projectId: params.get('prj') ?? undefined,
    subprojectId: params.get('sp') ?? undefined,
  };

  const setParam = (patch: Record<string, string>) => {
    setParams((next) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value); else next.delete(key);
      }
      return next;
    }, { replace: true });
  };

  // Same query keys the search hook uses, so these are cache reads rather than extra round-trips.
  const { data: programs = [] } = usePrograms();
  const { data: projects = [] } = useProjectsForPrograms(useMemo(() => programs.map((p) => p.id), [programs]));
  const { data: subprojects = [] } = useSubprojects(useMemo(() => projects.map((p) => p.id), [projects]));

  // Each level offers only what the level above it allows — a project list spanning programmes you
  // have already filtered out is a list of dead options.
  const visibleProjects = useMemo(
    () => (scope.programId ? projects.filter((p) => p.programId === scope.programId) : projects),
    [projects, scope.programId],
  );
  const visibleSubprojects = useMemo(() => {
    const allowed = new Set(visibleProjects.map((p) => p.id));
    return subprojects.filter((s) => (scope.projectId ? s.projectId === scope.projectId : allowed.has(s.projectId)));
  }, [subprojects, visibleProjects, scope.projectId]);

  const groups = useSearchResults(query, { limit: Infinity, enabled: true });
  const scoped = useMemo(
    () => groups
      .map((g) => ({ ...g, hits: g.hits.filter((h) => inScope(h, scope)) }))
      .filter((g) => g.hits.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, scope.programId, scope.projectId, scope.subprojectId],
  );
  const shown = useMemo(
    () => (category === 'all' ? scoped : scoped.filter((g) => g.key === category)),
    [scoped, category],
  );
  const total = scoped.reduce((n, g) => n + g.hits.length, 0);
  const ready = query.trim().length >= 2;
  const filtered = !!(scope.programId || scope.projectId || scope.subprojectId);

  return (
    <div>
      <PageHeader
        title="Search"
        description={ready
          ? `${total.toLocaleString()} result${total === 1 ? '' : 's'} for “${query.trim()}”`
          : 'Find subprojects, migration objects, field mappings, rules and cross references.'}
      />
      <Toolbar
        search={{ value: query, onChange: (v) => setParam({ q: v }), placeholder: 'Search everything…' }}
        onClearFilters={filtered ? () => setParam({ pg: '', prj: '', sp: '' }) : undefined}
      >
        <Select
          size="sm" value={scope.programId ?? ''} aria-label="Program"
          // Narrowing the programme invalidates any project and subproject chosen under the old
          // one, so they clear with it rather than silently filtering to nothing.
          onChange={(e) => setParam({ pg: e.target.value, prj: '', sp: '' })}
        >
          <option value="">All programs</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select
          size="sm" value={scope.projectId ?? ''} aria-label="Project"
          onChange={(e) => setParam({ prj: e.target.value, sp: '' })}
        >
          <option value="">All projects</option>
          {visibleProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select
          size="sm" value={scope.subprojectId ?? ''} aria-label="Subproject"
          onChange={(e) => setParam({ sp: e.target.value })}
        >
          <option value="">All subprojects</option>
          {visibleSubprojects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {/* Only categories that actually matched — a filter that can only ever return nothing is a
            dead control. */}
        {scoped.length > 1 && (
          <Segmented
            value={category}
            onChange={(v) => setParam({ in: v === 'all' ? '' : v })}
            options={[
              { value: 'all' as const, label: `All (${total})` },
              ...scoped.map((g) => ({ value: g.key, label: `${g.label} (${g.hits.length})` })),
            ]}
          />
        )}
      </Toolbar>

      {!ready ? (
        <EmptyState
          title="Type at least two characters"
          description="Results appear as you type, grouped by what kind of record they are."
        />
      ) : total === 0 ? (
        <EmptyState
          title={`Nothing matches “${query.trim()}”`}
          description={filtered
            ? 'No record in the selected scope matches. Clear the filters to search everywhere.'
            : 'Check the spelling, or try part of an ID, name or description.'}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {shown.map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.key}>
                <div className="flex items-center gap-1.5 mb-1.5 px-1">
                  <Icon size={13} className="text-muted" />
                  <span className="text-2xs font-bold uppercase tracking-[.05em] text-muted">{g.label}</span>
                  <span className="text-2xs text-muted">· {g.hits.length}</span>
                </div>
                <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden bg-surface">
                  {g.hits.map((h) => (
                    <Link
                      key={h.id} to={h.to}
                      className="flex flex-col px-3.5 py-2.5 border-b border-line-soft last:border-b-0 hover:bg-blue-pale"
                    >
                      <span className="text-sm2 font-semibold truncate">{h.title}</span>
                      {h.subtitle && <span className="text-2xs text-muted truncate">{h.subtitle}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

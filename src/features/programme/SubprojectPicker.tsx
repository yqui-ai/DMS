import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Layers, ChevronRight } from 'lucide-react';
import { usePrograms, useProjectsForPrograms, useSubprojects, useCyclesForSubprojects } from '../../lib/queries/programme';
import { EmptyState } from '../../components/EmptyState';

export function SubprojectPicker() {
  const navigate = useNavigate();
  const { data: programs = [], isLoading: loadingPrograms } = usePrograms();
  const programIds = useMemo(() => programs.map((p) => p.id), [programs]);
  const { data: projects = [] } = useProjectsForPrograms(programIds);
  const projectIds = useMemo(() => projects.map((r) => r.id), [projects]);
  const { data: subprojects = [] } = useSubprojects(projectIds);
  const subprojectIds = useMemo(() => subprojects.map((s) => s.id), [subprojects]);
  const { data: cycles = [] } = useCyclesForSubprojects(subprojectIds);

  const cycleCountBySubproject = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cycles) m.set(c.subprojectId, (m.get(c.subprojectId) ?? 0) + 1);
    return m;
  }, [cycles]);

  if (loadingPrograms) {
    return <div className="max-w-[760px] mx-auto py-16 text-center text-muted text-sm2">Loading…</div>;
  }

  if (programs.length === 0) {
    return (
      <div className="max-w-[760px] mx-auto py-16">
        <EmptyState
          icon={<Package size={26} />}
          title="No programs yet"
          description="You don't have a membership on any program. Ask a Program Admin to add you."
        />
      </div>
    );
  }

  return (
    <div className="max-w-[760px] mx-auto">
      <h1 className="text-xl font-bold text-text mb-1.5">Select a subproject to open</h1>
      <p className="text-sm2 text-muted mb-8">Pick a subproject to work in — this sets the programme, project and subproject context for everything else.</p>

      {programs.map((program) => {
        const programProjects = projects.filter((r) => r.programId === program.id);
        return (
          <div key={program.id} className="mb-10">
            <div className="text-sm2 font-bold uppercase tracking-[.05em] text-muted mb-4">{program.name}</div>

            {programProjects.length === 0 && (
              <p className="text-sm2 text-muted">No projects yet — add one in program configuration.</p>
            )}

            {programProjects.map((project) => {
              const projectSubprojects = subprojects.filter((s) => s.projectId === project.id);
              return (
                <div key={project.id} className="mb-7">
                  <div className="flex items-center gap-2 mb-3">
                    <Package size={15} className="text-muted" />
                    <span className="text-md font-bold text-text">{project.name}</span>
                    <Link
                      to={`/pg/${program.id}/settings`}
                      className="ml-auto text-blue text-sm2 font-semibold px-2 py-1 rounded hover:bg-blue-light"
                    >
                      Configure programme
                    </Link>
                  </div>

                  {projectSubprojects.length === 0 ? (
                    <p className="text-sm2 text-muted">No subprojects yet — add one in program configuration.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {projectSubprojects.map((subproject) => {
                        const cycleCount = cycleCountBySubproject.get(subproject.id) ?? 0;
                        return (
                          <button
                            key={subproject.id}
                            onClick={() => navigate(`/pg/${program.id}/sp/${subproject.id}/dashboard`)}
                            className="flex items-center gap-3 bg-surface rounded-lg shadow-card hover:shadow-cardHover transition-shadow p-4 text-left"
                          >
                            <div className="shrink-0 w-9 h-9 rounded-[9px] bg-blue-light grid place-items-center">
                              <Layers size={16} className="text-blue" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-md font-bold text-text truncate">{subproject.name}</div>
                              <div className="text-sm2 text-muted truncate">
                                <span className="font-mono">{subproject.code}</span> · {cycleCount} {cycleCount === 1 ? 'cycle' : 'cycles'}
                              </div>
                            </div>
                            <ChevronRight size={16} className="text-muted shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Layers, ChevronRight } from 'lucide-react';
import { useProjects, useReleasesForProjects, useWaves, useCyclesForWaves } from '../../lib/queries/programme';
import { EmptyState } from '../../components/EmptyState';

export function SubprojectPicker() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading: loadingProjects } = useProjects();
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const { data: releases = [] } = useReleasesForProjects(projectIds);
  const releaseIds = useMemo(() => releases.map((r) => r.id), [releases]);
  const { data: waves = [] } = useWaves(releaseIds);
  const waveIds = useMemo(() => waves.map((w) => w.id), [waves]);
  const { data: cycles = [] } = useCyclesForWaves(waveIds);

  const cycleCountByWave = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cycles) m.set(c.waveId, (m.get(c.waveId) ?? 0) + 1);
    return m;
  }, [cycles]);

  if (loadingProjects) {
    return <div className="max-w-[760px] mx-auto py-16 text-center text-muted text-sm">Loading…</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="max-w-[760px] mx-auto py-16">
        <EmptyState
          icon={<Package size={26} />}
          title="No programmes yet"
          description="You don't have a membership on any project. Ask a Program Admin to add you."
        />
      </div>
    );
  }

  return (
    <div className="max-w-[760px] mx-auto">
      <h1 className="text-3xl font-bold text-text mb-1.5">Select a subproject to open</h1>
      <p className="text-sm text-muted mb-8">Pick a wave to work in — this sets the project, release and wave context for everything else.</p>

      {projects.map((project) => {
        const projectReleases = releases.filter((r) => r.projectId === project.id);
        return (
          <div key={project.id} className="mb-10">
            <div className="text-sm2 font-bold uppercase tracking-[.05em] text-muted mb-4">{project.name}</div>

            {projectReleases.length === 0 && (
              <p className="text-sm text-muted">No releases yet — add one in project configuration.</p>
            )}

            {projectReleases.map((release) => {
              const releaseWaves = waves.filter((w) => w.releaseId === release.id);
              return (
                <div key={release.id} className="mb-7">
                  <div className="flex items-center gap-2 mb-3">
                    <Package size={15} className="text-muted" />
                    <span className="text-lg font-bold text-text">{release.name}</span>
                    <Link
                      to={`/p/${project.id}/settings`}
                      className="ml-auto text-blue text-sm font-semibold px-2 py-1 rounded hover:bg-blue-light"
                    >
                      Configure project
                    </Link>
                  </div>

                  {releaseWaves.length === 0 ? (
                    <p className="text-sm text-muted">No subprojects yet — add one in project configuration.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {releaseWaves.map((wave) => {
                        const cycleCount = cycleCountByWave.get(wave.id) ?? 0;
                        return (
                          <button
                            key={wave.id}
                            onClick={() => navigate(`/p/${project.id}/w/${wave.id}/dashboard`)}
                            className="flex items-center gap-3 bg-surface rounded-lg shadow-card hover:shadow-cardHover transition-shadow p-4 text-left"
                          >
                            <div className="shrink-0 w-9 h-9 rounded-[9px] bg-blue-light grid place-items-center">
                              <Layers size={16} className="text-blue" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-md font-bold text-text truncate">{wave.name}</div>
                              <div className="text-sm2 text-muted truncate">
                                <span className="font-mono">{wave.code}</span> · {cycleCount} {cycleCount === 1 ? 'cycle' : 'cycles'}
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

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '../../lib/supabase';
import { useProgram, useProjects, useSubprojects, useCyclesForSubprojects } from '../../lib/queries/programme';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { isoToDmy, dmyToIso } from '../../lib/format';
import { UsersTab } from './UsersTab';
import { RolesTab } from './RolesTab';
import { ApprovalsTab } from './ApprovalsTab';
import { AiSettingsTab } from './AiSettingsTab';
import { TimelinesSettingsTab } from './TimelinesSettingsTab';
import { InternalDataDictionary } from './InternalDataDictionary';
import type { Cycle, Program, Project, Subproject } from '../../types/entities';

const TABS = [
  { key: 'configure', label: 'Configure' },
  { key: 'internal', label: 'Internal' },
  { key: 'ai', label: 'AI Usage & Billing' },
  { key: 'users', label: 'Users' },
  { key: 'timelines', label: 'Timelines' },
  { key: 'roles', label: 'Roles' },
  { key: 'approvals', label: 'Approvals' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

type DCycle = Cycle & { _new?: boolean };
type DSubproject = Subproject & { _new?: boolean; cycles: DCycle[] };
type DProject = Project & { _new?: boolean; subprojects: DSubproject[] };
type DProgram = Program;

const newId = () => 'new-' + Math.random().toString(36).slice(2);
const isNew = (id: string) => id.startsWith('new-');

export function ProgramSettingsPage() {
  const { programId } = useParams();
  const [tab, setTab] = useState<TabKey>('configure');

  return (
    <div>
      <PageHeader title="Program Settings" description="Programme, projects, subprojects and cycles for this program." />
      <div className="flex items-center gap-1 border-b border-line mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px',
              tab === t.key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'configure' && <ConfigureTab programId={programId!} />}
      {tab === 'internal' && <InternalDataDictionary />}
      {tab === 'ai' && <AiSettingsTab programId={programId!} />}
      {tab === 'users' && <UsersTab programId={programId!} />}
      {tab === 'timelines' && <TimelinesSettingsTab programId={programId!} />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'approvals' && <ApprovalsTab programId={programId!} />}
    </div>
  );
}

function ConfigureTab({ programId }: { programId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: program } = useProgram(programId);
  const { data: projects = [] } = useProjects(programId);
  const projectIds = useMemo(() => projects.map((r) => r.id), [projects]);
  const { data: subprojects = [] } = useSubprojects(projectIds);
  const subprojectIds = useMemo(() => subprojects.map((s) => s.id), [subprojects]);
  const { data: cycles = [] } = useCyclesForSubprojects(subprojectIds);

  const [editing, setEditing] = useState(false);
  const [draftProgram, setDraftProgram] = useState<DProgram | null>(null);
  const [draftProjects, setDraftProjects] = useState<DProject[]>([]);
  const [deleted, setDeleted] = useState<{ projects: Set<string>; subprojects: Set<string>; cycles: Set<string> }>({
    projects: new Set(), subprojects: new Set(), cycles: new Set(),
  });
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    if (!program) return;
    setDraftProgram({ ...program });
    setDraftProjects(
      projects.map((r) => ({
        ...r,
        subprojects: subprojects.filter((s) => s.projectId === r.id).map((s) => ({ ...s, cycles: cycles.filter((c) => c.subprojectId === s.id) })),
      })),
    );
    setDeleted({ projects: new Set(), subprojects: new Set(), cycles: new Set() });
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    if (!draftProgram) return;
    setSaving(true);
    try {
      await supabase.from('programs').update({
        code: draftProgram.code, name: draftProgram.name, description: draftProgram.description ?? null,
        start_date: dmyToIso(isoToDmy(draftProgram.startDate)) ?? draftProgram.startDate ?? null,
      }).eq('id', programId);

      for (const id of deleted.projects) await supabase.from('projects').delete().eq('id', id);
      for (const id of deleted.subprojects) await supabase.from('subprojects').delete().eq('id', id);
      for (const id of deleted.cycles) await supabase.from('cycles').delete().eq('id', id);

      for (const [ri, project] of draftProjects.entries()) {
        let projectId = project.id;
        const projectPayload = {
          program_id: programId, code: project.code, name: project.name, description: project.description ?? null,
          start_date: project.startDate ?? null, seq: ri + 1,
        };
        if (project._new) {
          const { data, error } = await supabase.from('projects').insert(projectPayload).select('id').single();
          if (error) throw error;
          projectId = data.id;
        } else {
          const { error } = await supabase.from('projects').update(projectPayload).eq('id', projectId);
          if (error) throw error;
        }

        for (const [si, subproject] of project.subprojects.entries()) {
          let subprojectId = subproject.id;
          const subprojectPayload = {
            project_id: projectId, code: subproject.code, name: subproject.name, description: subproject.description ?? null,
            freeze_date: subproject.freezeDate ?? null,
            scope_finalized: subproject.scopeFinalized, seq: si + 1,
          };
          if (subproject._new) {
            const { data, error } = await supabase.from('subprojects').insert(subprojectPayload).select('id').single();
            if (error) throw error;
            subprojectId = data.id;
          } else {
            const { error } = await supabase.from('subprojects').update(subprojectPayload).eq('id', subprojectId);
            if (error) throw error;
          }

          for (const [ci, cycle] of subproject.cycles.entries()) {
            const cyclePayload = {
              subproject_id: subprojectId, name: cycle.name, seq: ci + 1, description: cycle.description ?? null,
              mig_start: cycle.migStart ?? null, mig_end: cycle.migEnd ?? null, data_freeze: cycle.dataFreeze ?? null,
            };
            if (cycle._new) {
              const { error } = await supabase.from('cycles').insert(cyclePayload);
              if (error) throw error;
            } else {
              const { error } = await supabase.from('cycles').update(cyclePayload).eq('id', cycle.id);
              if (error) throw error;
            }
          }
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['program', programId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', programId] }),
        queryClient.invalidateQueries({ queryKey: ['projects-multi'] }),
        queryClient.invalidateQueries({ queryKey: ['subprojects'] }),
        queryClient.invalidateQueries({ queryKey: ['cycles-multi'] }),
      ]);
      toast.success('Programme configuration saved.');
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const updateProject = (id: string, patch: Partial<DProject>) =>
    setDraftProjects((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const updateSubproject = (projectId: string, subprojectId: string, patch: Partial<DSubproject>) =>
    setDraftProjects((rs) => rs.map((r) => (r.id !== projectId ? r : { ...r, subprojects: r.subprojects.map((s) => (s.id === subprojectId ? { ...s, ...patch } : s)) })));
  const updateCycle = (projectId: string, subprojectId: string, cycleId: string, patch: Partial<DCycle>) =>
    setDraftProjects((rs) => rs.map((r) => r.id !== projectId ? r : {
      ...r, subprojects: r.subprojects.map((s) => s.id !== subprojectId ? s : { ...s, cycles: s.cycles.map((c) => (c.id === cycleId ? { ...c, ...patch } : c)) }),
    }));

  const addProject = () => setDraftProjects((rs) => [...rs, {
    id: newId(), programId, code: '', name: 'New Project', description: '', seq: rs.length + 1, subprojects: [], _new: true,
  }]);
  const removeProject = (id: string) => {
    setDraftProjects((rs) => rs.filter((r) => r.id !== id));
    if (!isNew(id)) setDeleted((d) => ({ ...d, projects: new Set(d.projects).add(id) }));
  };
  const addSubproject = (projectId: string) => updateProject(projectId, {
    subprojects: [...(draftProjects.find((r) => r.id === projectId)?.subprojects ?? []),
      { id: newId(), projectId, code: '', name: 'New Subproject', description: '', scopeFinalized: false, seq: 0, cycles: [], _new: true }],
  });
  const removeSubproject = (projectId: string, subprojectId: string) => {
    updateProject(projectId, { subprojects: draftProjects.find((r) => r.id === projectId)?.subprojects.filter((s) => s.id !== subprojectId) ?? [] });
    if (!isNew(subprojectId)) setDeleted((d) => ({ ...d, subprojects: new Set(d.subprojects).add(subprojectId) }));
  };
  const addCycle = (projectId: string, subprojectId: string) => {
    const project = draftProjects.find((r) => r.id === projectId);
    const subproject = project?.subprojects.find((s) => s.id === subprojectId);
    if (!subproject) return;
    updateSubproject(projectId, subprojectId, { cycles: [...subproject.cycles, { id: newId(), subprojectId, name: 'New Cycle', seq: 0, _new: true }] });
  };
  const removeCycle = (projectId: string, subprojectId: string, cycleId: string) => {
    const project = draftProjects.find((r) => r.id === projectId);
    const subproject = project?.subprojects.find((s) => s.id === subprojectId);
    if (subproject) updateSubproject(projectId, subprojectId, { cycles: subproject.cycles.filter((c) => c.id !== cycleId) });
    if (!isNew(cycleId)) setDeleted((d) => ({ ...d, cycles: new Set(d.cycles).add(cycleId) }));
  };

  if (!program) return <p className="text-sm text-muted py-8 text-center">Loading…</p>;

  const displayProgram = editing ? draftProgram! : program;
  const displayProjects: (Project & { subprojects: (Subproject & { cycles: Cycle[] })[] })[] = editing
    ? (draftProjects as any)
    : projects.map((r) => ({ ...r, subprojects: subprojects.filter((s) => s.projectId === r.id).map((s) => ({ ...s, cycles: cycles.filter((c) => c.subprojectId === s.id) })) })) as any;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end gap-2">
        {editing ? (
          <>
            <Button variant="secondary" onClick={cancel} disabled={saving}><X size={14} /> Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}><Check size={14} /> {saving ? 'Saving…' : 'Save'}</Button>
          </>
        ) : (
          <Button variant="secondary" onClick={startEdit}><Pencil size={14} /> Edit</Button>
        )}
      </div>

      <div className="bg-surface rounded-lg shadow-card p-5">
        <div className="text-sm2 font-bold uppercase tracking-[.05em] text-muted mb-3">Programme</div>
        {editing ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code"><Input value={draftProgram!.code} onChange={(e) => setDraftProgram((p) => p && { ...p, code: e.target.value })} /></Field>
            <Field label="Name"><Input value={draftProgram!.name} onChange={(e) => setDraftProgram((p) => p && { ...p, name: e.target.value })} /></Field>
            <Field label="Description">
              <Input value={draftProgram!.description ?? ''} onChange={(e) => setDraftProgram((p) => p && { ...p, description: e.target.value })} />
            </Field>
            <Field label="Start date" hint="dd.mm.yyyy">
              <Input defaultValue={isoToDmy(draftProgram!.startDate)} onBlur={(e) => setDraftProgram((p) => p && { ...p, startDate: dmyToIso(e.target.value) ?? p.startDate })} />
            </Field>
          </div>
        ) : (
          <div>
            <div className="text-lg font-bold text-text">{displayProgram.name} <span className="text-muted font-mono text-sm2">{displayProgram.code}</span></div>
            {displayProgram.description && <p className="text-sm text-muted mt-1">{displayProgram.description}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm2 font-bold uppercase tracking-[.05em] text-muted">Projects, subprojects &amp; cycles</div>
        {editing && <Button variant="ghost" onClick={addProject}><Plus size={14} /> Add project</Button>}
      </div>

      {displayProjects.length === 0 && <p className="text-sm text-muted">No projects yet.</p>}

      {displayProjects.map((project: any) => (
        <div key={project.id} className="bg-surface rounded-lg shadow-card p-4">
          <div className="flex items-start gap-3 mb-3">
            {editing ? (
              <div className="grid grid-cols-2 gap-2 flex-1">
                <Input placeholder="Code" value={project.code} onChange={(e) => updateProject(project.id, { code: e.target.value })} />
                <Input placeholder="Name" value={project.name} onChange={(e) => updateProject(project.id, { name: e.target.value })} />
              </div>
            ) : (
              <div className="flex-1">
                <span className="font-bold text-text">{project.name}</span>{' '}
                <span className="font-mono text-sm2 text-muted">{project.code}</span>
              </div>
            )}
            {editing && (
              <button onClick={() => removeProject(project.id)} className="text-red hover:bg-red-light p-1.5 rounded" aria-label="Delete project">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="pl-4 border-l-2 border-line flex flex-col gap-2.5">
            {project.subprojects.map((subproject: any) => (
              <div key={subproject.id} className="bg-surface-2 rounded-[8px] p-3">
                <div className="flex items-start gap-2 mb-2">
                  {editing ? (
                    <div className="grid grid-cols-3 gap-2 flex-1">
                      <Input placeholder="Code" value={subproject.code} onChange={(e) => updateSubproject(project.id, subproject.id, { code: e.target.value })} />
                      <Input placeholder="Name" value={subproject.name} onChange={(e) => updateSubproject(project.id, subproject.id, { name: e.target.value })} />
                      <label className="flex items-center gap-1.5 text-sm2">
                        <input type="checkbox" checked={subproject.scopeFinalized} onChange={(e) => updateSubproject(project.id, subproject.id, { scopeFinalized: e.target.checked })} />
                        Scope finalized
                      </label>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-semibold text-text text-sm">{subproject.name}</span>
                      <span className="font-mono text-2xs text-muted">{subproject.code}</span>
                      {subproject.scopeFinalized && <span className="text-2xs font-bold text-blue">FINALIZED</span>}
                    </div>
                  )}
                  {editing && (
                    <button onClick={() => removeSubproject(project.id, subproject.id)} className="text-red hover:bg-red-light p-1 rounded" aria-label="Delete subproject">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="pl-3 border-l border-line flex flex-col gap-1.5">
                  {subproject.cycles.map((cycle: any) => (
                    <div key={cycle.id} className="flex items-center gap-2">
                      {editing ? (
                        <Input
                          className="text-sm2 py-1" value={cycle.name}
                          onChange={(e) => updateCycle(project.id, subproject.id, cycle.id, { name: e.target.value })}
                        />
                      ) : (
                        <span className="text-sm2 text-text">{cycle.name}</span>
                      )}
                      {editing && (
                        <button onClick={() => removeCycle(project.id, subproject.id, cycle.id)} className="text-red hover:bg-red-light p-1 rounded" aria-label="Delete cycle">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {editing && (
                    <button onClick={() => addCycle(project.id, subproject.id)} className="text-blue text-xs font-semibold self-start hover:bg-blue-pale rounded px-1.5 py-1">
                      <Plus size={11} className="inline -mt-0.5" /> Add cycle
                    </button>
                  )}
                  {!editing && subproject.cycles.length === 0 && <span className="text-2xs text-muted">No cycles.</span>}
                </div>
              </div>
            ))}
            {editing && (
              <button onClick={() => addSubproject(project.id)} className="text-blue text-sm font-semibold self-start hover:bg-blue-pale rounded px-2 py-1">
                <Plus size={13} className="inline -mt-0.5" /> Add subproject
              </button>
            )}
            {!editing && project.subprojects.length === 0 && <span className="text-sm text-muted">No subprojects.</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

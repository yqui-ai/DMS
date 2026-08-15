import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '../../lib/supabase';
import { useProject, useReleases, useWaves, useCyclesForWaves } from '../../lib/queries/programme';
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
import type { Cycle, Project, Release, Wave } from '../../types/entities';

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
type DWave = Wave & { _new?: boolean; cycles: DCycle[] };
type DRelease = Release & { _new?: boolean; waves: DWave[] };
type DProject = Project;

const newId = () => 'new-' + Math.random().toString(36).slice(2);
const isNew = (id: string) => id.startsWith('new-');

export function ProgramSettingsPage() {
  const { projectId } = useParams();
  const [tab, setTab] = useState<TabKey>('configure');

  return (
    <div>
      <PageHeader title="Program Settings" description="Programme, releases, waves and cycles for this project." />
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
      {tab === 'configure' && <ConfigureTab projectId={projectId!} />}
      {tab === 'internal' && <InternalDataDictionary />}
      {tab === 'ai' && <AiSettingsTab projectId={projectId!} />}
      {tab === 'users' && <UsersTab projectId={projectId!} />}
      {tab === 'timelines' && <TimelinesSettingsTab projectId={projectId!} />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'approvals' && <ApprovalsTab projectId={projectId!} />}
    </div>
  );
}

function ConfigureTab({ projectId }: { projectId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: project } = useProject(projectId);
  const { data: releases = [] } = useReleases(projectId);
  const releaseIds = useMemo(() => releases.map((r) => r.id), [releases]);
  const { data: waves = [] } = useWaves(releaseIds);
  const waveIds = useMemo(() => waves.map((w) => w.id), [waves]);
  const { data: cycles = [] } = useCyclesForWaves(waveIds);

  const [editing, setEditing] = useState(false);
  const [draftProject, setDraftProject] = useState<DProject | null>(null);
  const [draftReleases, setDraftReleases] = useState<DRelease[]>([]);
  const [deleted, setDeleted] = useState<{ releases: Set<string>; waves: Set<string>; cycles: Set<string> }>({
    releases: new Set(), waves: new Set(), cycles: new Set(),
  });
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    if (!project) return;
    setDraftProject({ ...project });
    setDraftReleases(
      releases.map((r) => ({
        ...r,
        waves: waves.filter((w) => w.releaseId === r.id).map((w) => ({ ...w, cycles: cycles.filter((c) => c.waveId === w.id) })),
      })),
    );
    setDeleted({ releases: new Set(), waves: new Set(), cycles: new Set() });
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    if (!draftProject) return;
    setSaving(true);
    try {
      await supabase.from('projects').update({
        code: draftProject.code, name: draftProject.name, description: draftProject.description ?? null,
        start_date: dmyToIso(isoToDmy(draftProject.startDate)) ?? draftProject.startDate ?? null,
      }).eq('id', projectId);

      for (const id of deleted.releases) await supabase.from('releases').delete().eq('id', id);
      for (const id of deleted.waves) await supabase.from('waves').delete().eq('id', id);
      for (const id of deleted.cycles) await supabase.from('cycles').delete().eq('id', id);

      for (const [ri, release] of draftReleases.entries()) {
        let releaseId = release.id;
        const releasePayload = {
          project_id: projectId, code: release.code, name: release.name, description: release.description ?? null,
          start_date: release.startDate ?? null, seq: ri + 1,
        };
        if (release._new) {
          const { data, error } = await supabase.from('releases').insert(releasePayload).select('id').single();
          if (error) throw error;
          releaseId = data.id;
        } else {
          const { error } = await supabase.from('releases').update(releasePayload).eq('id', releaseId);
          if (error) throw error;
        }

        for (const [wi, wave] of release.waves.entries()) {
          let waveId = wave.id;
          const wavePayload = {
            release_id: releaseId, code: wave.code, name: wave.name, description: wave.description ?? null,
            freeze_date: wave.freezeDate ?? null,
            scope_finalized: wave.scopeFinalized, seq: wi + 1,
          };
          if (wave._new) {
            const { data, error } = await supabase.from('waves').insert(wavePayload).select('id').single();
            if (error) throw error;
            waveId = data.id;
          } else {
            const { error } = await supabase.from('waves').update(wavePayload).eq('id', waveId);
            if (error) throw error;
          }

          for (const [ci, cycle] of wave.cycles.entries()) {
            const cyclePayload = {
              wave_id: waveId, name: cycle.name, seq: ci + 1, description: cycle.description ?? null,
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
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['releases', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['releases-multi'] }),
        queryClient.invalidateQueries({ queryKey: ['waves'] }),
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

  const updateRelease = (id: string, patch: Partial<DRelease>) =>
    setDraftReleases((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const updateWave = (releaseId: string, waveId: string, patch: Partial<DWave>) =>
    setDraftReleases((rs) => rs.map((r) => (r.id !== releaseId ? r : { ...r, waves: r.waves.map((w) => (w.id === waveId ? { ...w, ...patch } : w)) })));
  const updateCycle = (releaseId: string, waveId: string, cycleId: string, patch: Partial<DCycle>) =>
    setDraftReleases((rs) => rs.map((r) => r.id !== releaseId ? r : {
      ...r, waves: r.waves.map((w) => w.id !== waveId ? w : { ...w, cycles: w.cycles.map((c) => (c.id === cycleId ? { ...c, ...patch } : c)) }),
    }));

  const addRelease = () => setDraftReleases((rs) => [...rs, {
    id: newId(), projectId, code: '', name: 'New Release', description: '', seq: rs.length + 1, waves: [], _new: true,
  }]);
  const removeRelease = (id: string) => {
    setDraftReleases((rs) => rs.filter((r) => r.id !== id));
    if (!isNew(id)) setDeleted((d) => ({ ...d, releases: new Set(d.releases).add(id) }));
  };
  const addWave = (releaseId: string) => updateRelease(releaseId, {
    waves: [...(draftReleases.find((r) => r.id === releaseId)?.waves ?? []),
      { id: newId(), releaseId, code: '', name: 'New Wave', description: '', scopeFinalized: false, seq: 0, cycles: [], _new: true }],
  });
  const removeWave = (releaseId: string, waveId: string) => {
    updateRelease(releaseId, { waves: draftReleases.find((r) => r.id === releaseId)?.waves.filter((w) => w.id !== waveId) ?? [] });
    if (!isNew(waveId)) setDeleted((d) => ({ ...d, waves: new Set(d.waves).add(waveId) }));
  };
  const addCycle = (releaseId: string, waveId: string) => {
    const release = draftReleases.find((r) => r.id === releaseId);
    const wave = release?.waves.find((w) => w.id === waveId);
    if (!wave) return;
    updateWave(releaseId, waveId, { cycles: [...wave.cycles, { id: newId(), waveId, name: 'New Cycle', seq: 0, _new: true }] });
  };
  const removeCycle = (releaseId: string, waveId: string, cycleId: string) => {
    const release = draftReleases.find((r) => r.id === releaseId);
    const wave = release?.waves.find((w) => w.id === waveId);
    if (wave) updateWave(releaseId, waveId, { cycles: wave.cycles.filter((c) => c.id !== cycleId) });
    if (!isNew(cycleId)) setDeleted((d) => ({ ...d, cycles: new Set(d.cycles).add(cycleId) }));
  };

  if (!project) return <p className="text-sm text-muted py-8 text-center">Loading…</p>;

  const displayProject = editing ? draftProject! : project;
  const displayReleases: (Release | DRelease)[] = editing
    ? draftReleases
    : releases.map((r) => ({ ...r, waves: waves.filter((w) => w.releaseId === r.id).map((w) => ({ ...w, cycles: cycles.filter((c) => c.waveId === w.id) })) })) as any;

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
            <Field label="Code"><Input value={draftProject!.code} onChange={(e) => setDraftProject((p) => p && { ...p, code: e.target.value })} /></Field>
            <Field label="Name"><Input value={draftProject!.name} onChange={(e) => setDraftProject((p) => p && { ...p, name: e.target.value })} /></Field>
            <Field label="Description">
              <Input value={draftProject!.description ?? ''} onChange={(e) => setDraftProject((p) => p && { ...p, description: e.target.value })} />
            </Field>
            <Field label="Start date" hint="dd.mm.yyyy">
              <Input defaultValue={isoToDmy(draftProject!.startDate)} onBlur={(e) => setDraftProject((p) => p && { ...p, startDate: dmyToIso(e.target.value) ?? p.startDate })} />
            </Field>
          </div>
        ) : (
          <div>
            <div className="text-lg font-bold text-text">{displayProject.name} <span className="text-muted font-mono text-sm2">{displayProject.code}</span></div>
            {displayProject.description && <p className="text-sm text-muted mt-1">{displayProject.description}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm2 font-bold uppercase tracking-[.05em] text-muted">Releases, waves &amp; cycles</div>
        {editing && <Button variant="ghost" onClick={addRelease}><Plus size={14} /> Add release</Button>}
      </div>

      {displayReleases.length === 0 && <p className="text-sm text-muted">No releases yet.</p>}

      {displayReleases.map((release: any) => (
        <div key={release.id} className="bg-surface rounded-lg shadow-card p-4">
          <div className="flex items-start gap-3 mb-3">
            {editing ? (
              <div className="grid grid-cols-2 gap-2 flex-1">
                <Input placeholder="Code" value={release.code} onChange={(e) => updateRelease(release.id, { code: e.target.value })} />
                <Input placeholder="Name" value={release.name} onChange={(e) => updateRelease(release.id, { name: e.target.value })} />
              </div>
            ) : (
              <div className="flex-1">
                <span className="font-bold text-text">{release.name}</span>{' '}
                <span className="font-mono text-sm2 text-muted">{release.code}</span>
              </div>
            )}
            {editing && (
              <button onClick={() => removeRelease(release.id)} className="text-red hover:bg-red-light p-1.5 rounded" aria-label="Delete release">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="pl-4 border-l-2 border-line flex flex-col gap-2.5">
            {release.waves.map((wave: any) => (
              <div key={wave.id} className="bg-surface-2 rounded-[8px] p-3">
                <div className="flex items-start gap-2 mb-2">
                  {editing ? (
                    <div className="grid grid-cols-3 gap-2 flex-1">
                      <Input placeholder="Code" value={wave.code} onChange={(e) => updateWave(release.id, wave.id, { code: e.target.value })} />
                      <Input placeholder="Name" value={wave.name} onChange={(e) => updateWave(release.id, wave.id, { name: e.target.value })} />
                      <label className="flex items-center gap-1.5 text-sm2">
                        <input type="checkbox" checked={wave.scopeFinalized} onChange={(e) => updateWave(release.id, wave.id, { scopeFinalized: e.target.checked })} />
                        Scope finalized
                      </label>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-semibold text-text text-sm">{wave.name}</span>
                      <span className="font-mono text-2xs text-muted">{wave.code}</span>
                      {wave.scopeFinalized && <span className="text-2xs font-bold text-blue">FINALIZED</span>}
                    </div>
                  )}
                  {editing && (
                    <button onClick={() => removeWave(release.id, wave.id)} className="text-red hover:bg-red-light p-1 rounded" aria-label="Delete wave">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="pl-3 border-l border-line flex flex-col gap-1.5">
                  {wave.cycles.map((cycle: any) => (
                    <div key={cycle.id} className="flex items-center gap-2">
                      {editing ? (
                        <Input
                          className="text-sm2 py-1" value={cycle.name}
                          onChange={(e) => updateCycle(release.id, wave.id, cycle.id, { name: e.target.value })}
                        />
                      ) : (
                        <span className="text-sm2 text-text">{cycle.name}</span>
                      )}
                      {editing && (
                        <button onClick={() => removeCycle(release.id, wave.id, cycle.id)} className="text-red hover:bg-red-light p-1 rounded" aria-label="Delete cycle">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {editing && (
                    <button onClick={() => addCycle(release.id, wave.id)} className="text-blue text-xs font-semibold self-start hover:bg-blue-pale rounded px-1.5 py-1">
                      <Plus size={11} className="inline -mt-0.5" /> Add cycle
                    </button>
                  )}
                  {!editing && wave.cycles.length === 0 && <span className="text-2xs text-muted">No cycles.</span>}
                </div>
              </div>
            ))}
            {editing && (
              <button onClick={() => addWave(release.id)} className="text-blue text-sm font-semibold self-start hover:bg-blue-pale rounded px-2 py-1">
                <Plus size={13} className="inline -mt-0.5" /> Add wave
              </button>
            )}
            {!editing && release.waves.length === 0 && <span className="text-sm text-muted">No waves.</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

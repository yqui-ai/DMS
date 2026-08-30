import { useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { PersonSelect } from '../../components/PersonSelect';
import { Select } from '../../components/Select';
import { Tag } from '../../components/Tag';
import { useToast } from '../../components/Toast';
import { fmtDateTime } from '../../lib/format';
import { dateForInput, LEVELS, useHierarchyMutations, useRefStatus, type HierarchyForm } from '../../lib/queries/hierarchy';
import { useAssignablePeople } from '../../lib/queries/people';
import { usePlants, usePlantMutations, useSubprojectPlants } from '../../lib/queries/plants';
import { PlantPicker } from './PlantPicker';
import type { HierarchyLevel, HierarchyRecord } from '../../types/entities';

/** What each level asks for beyond the shared code/name/status/dates. */
const EXTRA_DATES: Record<HierarchyLevel, { key: keyof HierarchyForm; label: string }[]> = {
  PRGM: [],
  PRJT: [],
  SPRJ: [
    { key: 'prepStartDate', label: 'Preparation Start Date' },
    { key: 'prepEndDate', label: 'Preparation End Date' },
    { key: 'freezeDate', label: 'Field Mapping Freeze Date' },
  ],
  CYCL: [
    { key: 'migStart', label: 'Migration Start Date' },
    { key: 'migEnd', label: 'Migration End Date' },
    { key: 'dataFreeze', label: 'Source Data Freeze Date' },
  ],
};

export interface HierarchyTarget {
  level: HierarchyLevel;
  /** Present when editing; absent when creating. `code` is optional because a cycle's is — it was
   * added in 0037 and backfilled, but the type stays honest about rows that predate it. */
  record?: HierarchyRecord & { id: string; code?: string; name: string; description?: string;
    startDate?: string; endDate?: string; owner?: string; coLead?: string;
    prepStartDate?: string; prepEndDate?: string; freezeDate?: string;
    migStart?: string; migEnd?: string; dataFreeze?: string };
  /** The parent's uuid — required when creating anything below a program. */
  parentId?: string;
  /** Shown in the dialog subtitle so it is obvious what this is being created under. */
  parentLabel?: string;
  /** The programme this record belongs to. Only used at SPRJ, to offer that programme's plants —
   * a plant is programme master data, and another engagement's sites must not be selectable here. */
  programId?: string;
}

const EMPTY: HierarchyForm = { code: '', name: '' };

/** Create or edit one node of the hierarchy.
 *
 * One dialog for all four levels: they share code, name, status and dates, and differ only in a
 * handful of extra date fields plus the program's two leads. Four dialogs would be four places to
 * forget a field.
 *
 * GUID, Created By/On and Changed By/On are shown but never editable — the database mints and stamps
 * them (migration 0037). An identity you can type is not an identity. */
export function HierarchyDialog({ target, onClose }: { target: HierarchyTarget | null; onClose: () => void }) {
  const toast = useToast();
  const { create, update } = useHierarchyMutations();
  const { data: statuses = [] } = useRefStatus(target?.level);
  const [form, setForm] = useState<HierarchyForm>(EMPTY);

  const level = target?.level;
  const editing = !!target?.record;
  const label = level ? LEVELS[level].label : '';

  /** Program Lead and Co-Lead come from the Program Admins of THIS program. A program being created
   * has none yet, so the list falls back to every Program Admin the caller can see — otherwise the
   * only mandatory field on the form would be impossible to fill. */
  const { data: people = [], isLoading: loadingPeople } = useAssignablePeople({
    programId: editing ? target?.record?.id : undefined,
    roles: ['program_admin'],
    enabled: level === 'PRGM',
  });

  /* Plants are part of the subproject form rather than a separate action: which sites a wave covers
     is part of what the wave IS, so it is decided when the wave is created. A second dialog meant a
     subproject could exist for days with no site attached and nothing ever asking for one. */
  const { data: allPlants = [] } = usePlants(target?.programId, false, level === 'SPRJ');
  const { data: plantIdsBySubproject } = useSubprojectPlants(level === 'SPRJ');
  const [plantIds, setPlantIds] = useState<string[]>([]);
  const { setSubprojectPlants } = usePlantMutations(target?.programId);

  useEffect(() => {
    if (!target) return;
    // Seeded from the saved assignment when editing, empty when creating. Runs in the same effect
    // as the rest of the form so a reopened dialog never shows the previous record's plants.
    setPlantIds(target.record ? (plantIdsBySubproject?.get(target.record.id) ?? []) : []);
  }, [target, plantIdsBySubproject]);

  useEffect(() => {
    if (!target) return;
    const r = target.record;
    setForm(r
      ? {
        code: r.code ?? '', name: r.name, description: r.description,
        status: r.status, startDate: r.startDate, endDate: dateForInput(r.endDate),
        owner: r.owner, coLead: r.coLead,
        prepStartDate: r.prepStartDate, prepEndDate: r.prepEndDate, freezeDate: r.freezeDate,
        migStart: r.migStart, migEnd: r.migEnd, dataFreeze: r.dataFreeze,
      }
      : EMPTY);
  }, [target]);

  const set = <K extends keyof HierarchyForm>(key: K, value: HierarchyForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Mandatory per the field spec: ID, Name, and — for a program — the Program Lead.
  const missing = !form.code.trim() || !form.name.trim() || (level === 'PRGM' && !form.owner?.trim());
  const tooLong = form.code.trim().length > 10;
  const busy = create.isPending || update.isPending;

  const save = async () => {
    if (!target || !level) return;
    try {
      let newId: string | undefined;
      if (editing) await update.mutateAsync({ level, id: target.record!.id, form });
      else newId = await create.mutateAsync({ level, parentId: target.parentId, form });

      // Second write, deliberately: plants live in their own table, and there is no transaction
      // across two PostgREST calls. Ordered so the subproject exists first — a failure here leaves
      // a saved subproject with no plants, which reopening this same form fixes, rather than links
      // pointing at a row that was never created.
      const subprojectId = target.record?.id ?? newId;
      if (level === 'SPRJ' && subprojectId) {
        await setSubprojectPlants(subprojectId, plantIds);
      }
      toast.success(`${label} ${editing ? 'saved' : 'created'}.`);
      onClose();
    } catch (err: any) {
      // A duplicate ID is the one failure people hit repeatedly, and Postgres reports it as an
      // opaque constraint name.
      toast.error(err?.code === '23505'
        ? `That ${label} ID is already used. IDs must be unique.`
        : err?.message ?? `Could not save the ${label.toLowerCase()}.`);
    }
  };

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={editing ? `Edit ${label}` : `New ${label}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={missing || tooLong || busy}>
            {busy ? 'Saving…' : editing ? 'Save' : `Create ${label.toLowerCase()}`}
          </Button>
        </>
      }
    >
      {!target ? null : (
        <div className="flex flex-col gap-3.5">
          {target.parentLabel && !editing && (
            <p className="text-2xs text-muted">
              Creating under <span className="font-semibold text-text">{target.parentLabel}</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-3.5">
            <Field label={`${label} ID`} htmlFor="h-code" hint="Up to 10 characters. Must be unique.">
              <Input
                id="h-code" value={form.code} maxLength={10} autoFocus={!editing}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                placeholder="e.g. S4EMEA"
              />
            </Field>
            <Field label="Status" htmlFor="h-status">
              <Select id="h-status" value={form.status ?? ''} onChange={(e) => set('status', e.target.value)}>
                <option value="">Default</option>
                {statuses.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </Select>
            </Field>
          </div>

          <Field label={`${label} Name`} htmlFor="h-name">
            <Input id="h-name" value={form.name} maxLength={50} onChange={(e) => set('name', e.target.value)} />
          </Field>

          {/* Chosen from the people who administer this program, not typed. Free text is how the
              same colleague ended up recorded three different ways. */}
          {level === 'PRGM' && (
            <div className="grid grid-cols-2 gap-3.5">
              <Field label="Program Lead" htmlFor="h-owner" hint="Required.">
                <PersonSelect
                  id="h-owner" value={form.owner} onChange={(v) => set('owner', v)}
                  people={people} loading={loadingPeople}
                  emptyHint={editing
                    ? 'Nobody holds Program Admin on this program yet. Add one in Administration.'
                    : 'A new program has no members yet, so this lists the Program Admins you can see.'}
                />
              </Field>
              <Field label="Program Co-Lead" htmlFor="h-colead">
                <PersonSelect
                  id="h-colead" value={form.coLead} onChange={(v) => set('coLead', v)}
                  people={people} loading={loadingPeople} placeholder="None"
                />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Start Date" htmlFor="h-start">
              <Input id="h-start" type="date" value={form.startDate ?? ''} onChange={(e) => set('startDate', e.target.value)} />
            </Field>
            <Field label="End Date" htmlFor="h-end">
              <Input id="h-end" type="date" value={form.endDate ?? ''} onChange={(e) => set('endDate', e.target.value)} />
            </Field>
          </div>

          {EXTRA_DATES[target.level].length > 0 && (
            <div className="grid grid-cols-2 gap-3.5">
              {EXTRA_DATES[target.level].map((f) => (
                <Field key={String(f.key)} label={f.label} htmlFor={`h-${String(f.key)}`}>
                  <Input
                    id={`h-${String(f.key)}`} type="date"
                    value={(form[f.key] as string) ?? ''}
                    onChange={(e) => set(f.key, e.target.value as never)}
                  />
                </Field>
              ))}
            </div>
          )}

          {level === 'SPRJ' && (
            <Field
              label="Plants covered"
              hint="Scope and Field Mappings are shared across every plant on this subproject."
            >
              <PlantPicker plants={allPlants} selected={plantIds} onChange={setPlantIds} disabled={busy} />
            </Field>
          )}

          {/* Read-only, and shown rather than hidden: the GUID is what other systems key on, and the
              audit stamps are the answer to "who changed this". */}
          {editing && (
            <div className="rounded bg-surface-2 px-3 py-2.5 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted w-[86px] shrink-0">GUID</span>
                <Tag variant="table" size="sm">{target.record!.guid ?? '—'}</Tag>
              </div>
              <Stamp label="Created by" who={target.record!.createdBy} when={target.record!.createdAt} />
              <Stamp label="Changed by" who={target.record!.changedBy} when={target.record!.changedAt} />
            </div>
          )}

          {tooLong && <p className="text-2xs text-red-ink">The ID must be 10 characters or fewer.</p>}
        </div>
      )}
    </Dialog>
  );
}

function Stamp({ label, who, when }: { label: string; who?: string; when?: string }) {
  if (!who && !when) return null;
  return (
    <div className="flex items-center gap-2 text-2xs">
      <span className="text-muted w-[86px] shrink-0">{label}</span>
      <span className="text-text font-semibold truncate">{who ?? '—'}</span>
      {when && <span className="text-muted">· {fmtDateTime(when)}</span>}
    </div>
  );
}

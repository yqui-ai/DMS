import { useMemo, useState } from 'react';
import { Factory, Pencil, Plus, RotateCcw, Archive as ArchiveIcon } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { Dialog } from '../../components/Dialog';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field, Input } from '../../components/Field';
import { ToolbarSearch } from '../../components/ToolbarSearch';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { ListEmptyState } from '../../components/ListEmptyState';
import { useToast } from '../../components/Toast';
import { useHierarchy } from '../../lib/queries/hierarchy';
import { usePlants, usePlantMutations, type PlantForm, type PlantRow } from '../../lib/queries/plants';

const EMPTY_FORM: PlantForm = { code: '', name: '', country: '', city: '' };

/** Plant master data — the sites a programme migrates.
 *
 * Reached from Migration Project rather than from inside a subproject, because a plant belongs to
 * the programme and is shared by every wave that covers it. Creating one inside a subproject would
 * imply it belonged there, which is exactly the confusion this table exists to remove: two waves
 * covering plant 1010 must be talking about the same 1010.
 *
 * Assignment is the other half and lives where the decision is made — on the subproject, in the
 * hierarchy dialog. This screen answers "which sites exist and where are they used"; that one
 * answers "which sites does this wave cover". */
export function PlantsPage() {
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const { data: plants = [], isLoading } = usePlants(undefined, showArchived);
  const { data: programs = [] } = useHierarchy();

  const [query, setQuery] = useState('');
  const [programFilter, setProgramFilter] = useState<string[]>([]);
  const [editing, setEditing] = useState<PlantRow | 'new' | null>(null);
  const [retiring, setRetiring] = useState<PlantRow | null>(null);
  const [busy, setBusy] = useState(false);

  const programName = useMemo(
    () => new Map(programs.map((p) => [p.id, `${p.code} · ${p.name}`])),
    [programs],
  );

  /** Subproject id → its readable path, so "used by" names the wave rather than a uuid. */
  const subprojectPath = useMemo(() => {
    const out = new Map<string, string>();
    for (const pg of programs) {
      for (const pj of pg.projects) {
        for (const sp of pj.subprojects) out.set(sp.id, `${pj.code} › ${sp.name}`);
      }
    }
    return out;
  }, [programs]);

  const mutations = usePlantMutations(
    editing && editing !== 'new' ? editing.programId : undefined,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plants.filter((p) => (
      (!q
        || p.code.toLowerCase().includes(q)
        || p.name.toLowerCase().includes(q)
        || (p.city ?? '').toLowerCase().includes(q)
        || (p.country ?? '').toLowerCase().includes(q))
      && (programFilter.length === 0 || programFilter.includes(p.programId))
    ));
  }, [plants, query, programFilter]);

  const hasActiveFilters = query !== '' || programFilter.length > 0;
  const clearFilters = () => { setQuery(''); setProgramFilter([]); };

  const retire = async () => {
    if (!retiring) return;
    setBusy(true);
    try {
      await mutations.archive(retiring.id);
      toast.success(`${retiring.code} retired.`);
      setRetiring(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not retire the plant.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (plant: PlantRow) => {
    try {
      await mutations.restore(plant.id);
      toast.success(`${plant.code} restored.`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not restore the plant.');
    }
  };

  const columns: Column<PlantRow>[] = [
    {
      key: 'code', header: 'Plant', width: 110,
      sortValue: (p) => p.code,
      render: (p) => <span className="font-mono font-bold">{p.code}</span>,
    },
    {
      key: 'name', header: 'Name', width: 240,
      sortValue: (p) => p.name,
      render: (p) => (
        <span className="flex items-center gap-2 min-w-0">
          <span className="truncate">{p.name}</span>
          {p.archivedAt && <Tag variant="neutral" size="sm" className="shrink-0">Retired</Tag>}
        </span>
      ),
    },
    {
      key: 'location', header: 'Location', width: 170,
      sortValue: (p) => `${p.country ?? ''}${p.city ?? ''}`,
      render: (p) => (
        [p.city, p.country].filter(Boolean).join(', ')
        || <span className="text-muted">—</span>
      ),
    },
    {
      key: 'program', header: 'Program', width: 200,
      sortValue: (p) => programName.get(p.programId) ?? '',
      render: (p) => <span className="truncate">{programName.get(p.programId) ?? '—'}</span>,
    },
    {
      /* The reuse signal, and the reason retiring is gated. A plant covered by three waves is not
         a candidate for retirement, and a plant covered by none is probably a typo nobody has
         noticed — both are worth seeing without opening anything. */
      key: 'used', header: 'Used by', width: 220,
      sortValue: (p) => p.subprojectIds.length,
      render: (p) => (p.subprojectIds.length === 0 ? (
        <span className="text-muted">Not assigned</span>
      ) : (
        <span
          className="truncate inline-block max-w-full"
          title={p.subprojectIds.map((id) => subprojectPath.get(id) ?? id).join('\n')}
        >
          {p.subprojectIds.length === 1
            ? (subprojectPath.get(p.subprojectIds[0]) ?? '1 subproject')
            : `${p.subprojectIds.length} subprojects`}
        </span>
      )),
    },
    {
      key: 'actions', header: '', width: 84,
      render: (p) => (
        <span className="flex items-center gap-0.5 justify-end">
          {p.archivedAt ? (
            <button
              type="button"
              onClick={() => restore(p)}
              title={`Restore ${p.code}`}
              aria-label="Restore plant"
              className="w-7 h-7 grid place-items-center rounded text-muted hover:text-text hover:bg-surface-2 transition-colors"
            >
              <RotateCcw size={14} />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(p)}
                title={`Edit ${p.code}`}
                aria-label="Edit plant"
                className="w-7 h-7 grid place-items-center rounded text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => setRetiring(p)}
                title={`Retire ${p.code}`}
                aria-label="Retire plant"
                className="w-7 h-7 grid place-items-center rounded text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                <ArchiveIcon size={14} />
              </button>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-[1120px] mx-auto w-full">
      <PageHeader
        title="Plant Maintenance"
        description="The SAP plants your programmes migrate. A subproject can cover several plants, and a plant can appear in several subprojects."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={14} /> New plant
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ToolbarSearch value={query} onChange={setQuery} placeholder="Search by code, name or location…" />
        {programs.length > 1 && (
          <MultiSelectFilter
            label="Program"
            options={programs.map((p) => p.id)}
            selected={programFilter}
            onChange={setProgramFilter}
            formatOption={(id) => programName.get(id) ?? id}
          />
        )}
        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-2xs text-blue font-semibold">Clear filters</button>
        )}
        <span className="text-2xs text-muted">{filtered.length.toLocaleString()} plants</span>
        <label className="ml-auto flex items-center gap-1.5 text-2xs text-muted cursor-pointer">
          <input
            type="checkbox" checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="w-3.5 h-3.5 accent-[var(--blue)]"
          />
          Show retired
        </label>
      </div>

      {!isLoading && filtered.length === 0 ? (
        <ListEmptyState
          noun="plants"
          filtered={hasActiveFilters}
          description="Plants are the sites a programme migrates. Add one here, then assign it to the subprojects that cover it."
          onClearFilters={clearFilters}
        />
      ) : (
        <Table columns={columns} rows={filtered} rowKey={(p) => p.id} />
      )}

      <PlantDialog
        target={editing}
        /* When the user reaches more than one programme, the filter above decides which one a new
           plant lands in — the form does not ask. Adding a plant is a four-field job and a select
           that is a foregone conclusion for almost everyone is three of those fields' worth of
           friction. Falls back to the only programme they can see. */
        defaultProgramId={programFilter[0] ?? programs[0]?.id}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={!!retiring}
        title={`Retire ${retiring?.code ?? ''}?`}
        destructive
        busy={busy}
        confirmLabel="Retire"
        message={
          retiring && retiring.subprojectIds.length > 0 ? (
            <>
              <strong>{retiring.name}</strong> is still assigned to {retiring.subprojectIds.length}{' '}
              subproject{retiring.subprojectIds.length === 1 ? '' : 's'}. Retiring it leaves those
              assignments in place and keeps the record of what was migrated — it only stops the
              plant being assigned to anything new.
            </>
          ) : (
            <>
              <strong>{retiring?.name}</strong> is not assigned to any subproject. It will be hidden
              from the list and its code freed for reuse. Nothing is deleted.
            </>
          )
        }
        onConfirm={retire}
        onCancel={() => setRetiring(null)}
      />
    </div>
  );
}

/** Create or edit one plant. Four fields: code, name, city, country.
 *
 * The programme is not asked for. It is decided by context — the filter, or the only programme the
 * user can reach — because a plant belongs to whichever programme you are looking at and a select
 * whose answer is a foregone conclusion is just another field to tab past. It is also immutable
 * once set: moving a site between programmes would silently detach every subproject assignment
 * pointing at it. */
function PlantDialog({ target, defaultProgramId, onClose }: {
  target: PlantRow | 'new' | null;
  defaultProgramId?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const isNew = target === 'new';
  const plant = target && target !== 'new' ? target : null;

  const [form, setForm] = useState<PlantForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  // Re-seeded from whichever record the dialog was opened for. Keyed on the target so reopening on
  // a different plant does not show the previous one's values for a frame.
  const [seeded, setSeeded] = useState<string | null>(null);
  const key = plant?.id ?? (isNew ? 'new' : null);
  if (key !== seeded) {
    setSeeded(key);
    setForm(plant
      ? { code: plant.code, name: plant.name, country: plant.country ?? '', city: plant.city ?? '' }
      : EMPTY_FORM);
  }

  const programId = plant?.programId ?? defaultProgramId;
  const mutations = usePlantMutations(programId);

  const codeError = form.code.trim() === '' ? 'Required' : undefined;
  const nameError = form.name.trim() === '' ? 'Required' : undefined;
  const canSave = !codeError && !nameError && !!programId;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (plant) await mutations.update(plant.id, form);
      else await mutations.create(form);
      toast.success(plant ? `${form.code.toUpperCase()} saved.` : `${form.code.toUpperCase()} added.`);
      onClose();
    } catch (err: any) {
      // The partial unique index is the authority on duplicates, so this is where a second '1010'
      // is caught — not by a check in the form that a second browser tab could race past.
      const message = /plants_program_code_key|duplicate key/i.test(err?.message ?? '')
        ? `Plant ${form.code.trim().toUpperCase()} already exists in this program.`
        : err?.message ?? 'Could not save the plant.';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={plant ? `Edit ${plant.code}` : 'New plant'}
      subtitle={plant?.changedBy ? `Last changed by ${plant.changedBy}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!canSave || busy}>
            {busy ? 'Saving…' : plant ? 'Save' : 'Add plant'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Field label="Plant code" htmlFor="plant-code" error={codeError} hint={codeError ? undefined : 'SAP code'}>
            <Input
              id="plant-code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="1010"
              className="font-mono uppercase"
              maxLength={8}
            />
          </Field>
          <Field label="Name" htmlFor="plant-name" error={nameError}>
            <Input
              id="plant-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Stuttgart Works"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="City" htmlFor="plant-city">
            <Input
              id="plant-city"
              value={form.city ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </Field>
          <Field label="Country" htmlFor="plant-country">
            <Input
              id="plant-country"
              value={form.country ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            />
          </Field>
        </div>

        <p className="text-2xs text-muted flex items-start gap-1.5">
          <Factory size={13} className="shrink-0 mt-px" />
          Attach this plant to the subprojects that cover it when you create or edit them — a
          subproject can carry several, and they then share its scope and Field Mappings.
        </p>
      </div>
    </Dialog>
  );
}

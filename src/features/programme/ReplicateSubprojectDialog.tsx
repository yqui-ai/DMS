import { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { usePlants, useSubprojectPlants } from '../../lib/queries/plants';
import { useHierarchy } from '../../lib/queries/hierarchy';
import { useSubprojectObjects } from '../../lib/queries/scope';
import { useReplicateSubproject } from '../../lib/queries/replicateSubproject';
import { PlantPicker } from './PlantPicker';

/** Copy a subproject's scope onto a new wave covering different plants.
 *
 * The whole point is that the scope is identical and only the sites differ, so the form asks for
 * exactly three things — a code, a name, and the plants — and states plainly what it will carry
 * across. A dialog that re-asked for dates and status would be a create form with extra steps.
 *
 * The plant picker excludes plants already held by a sibling: a plant belongs to one subproject per
 * project (0062), and a replica exists precisely to cover the ones the source does not. The source's
 * own plants are therefore never selectable here, which is the rule doing exactly what it is for. */
export function ReplicateSubprojectDialog({ subproject, onClose, onReplicated }: {
  subproject: { id: string; code?: string; name: string } | null;
  onClose: () => void;
  onReplicated?: (newSubprojectId: string) => void;
}) {
  const toast = useToast();
  const { replicate } = useReplicateSubproject();
  const { data: allPlants = [] } = usePlants(false, !!subproject);
  const { data: plantIdsBySubproject } = useSubprojectPlants(!!subproject);
  const { data: hierarchy = [] } = useHierarchy();
  const { data: sourceObjects = [] } = useSubprojectObjects(subproject?.id);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [plantIds, setPlantIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!subproject) return;
    // Seeded as a visibly-unfinished copy rather than blank: the code and name are almost always a
    // variation on the source's, and an empty form makes you retype something you are copying.
    setCode(subproject.code ? `${subproject.code}-COPY` : '');
    setName(`${subproject.name} (copy)`);
    setPlantIds([]);
  }, [subproject]);

  /** Every plant already claimed inside this project, including the source's own. */
  const takenInProject = useMemo(() => {
    if (!subproject) return undefined;
    const project = hierarchy
      .flatMap((p) => p.projects)
      .find((pj) => pj.subprojects.some((s) => s.id === subproject.id));
    const out = new Map<string, string>();
    for (const sibling of project?.subprojects ?? []) {
      for (const plantId of plantIdsBySubproject?.get(sibling.id) ?? []) {
        out.set(plantId, sibling.code || sibling.name);
      }
    }
    return out;
  }, [subproject, hierarchy, plantIdsBySubproject]);

  const inScopeCount = sourceObjects.filter((o) => o.inScope).length;
  const fmdCount = sourceObjects.filter((o) => o.inScope && o.fmdId).length;

  const submit = async () => {
    if (!subproject) return;
    setBusy(true);
    try {
      const result = await replicate({ sourceSubprojectId: subproject.id, code, name, plantIds });
      toast.success(
        `${name} created — ${result.objectsCopied} scope row${result.objectsCopied === 1 ? '' : 's'} copied, ${result.fmdsReused} FMD${result.fmdsReused === 1 ? '' : 's'} reused.`,
      );
      onReplicated?.(result.subprojectId);
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Could not replicate the subproject.');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !busy && code.trim().length > 0 && name.trim().length > 0 && plantIds.length > 0;

  return (
    <Dialog
      open={!!subproject}
      onClose={onClose}
      title="Replicate subproject"
      subtitle={subproject ? `Copying ${subproject.code ? `${subproject.code} · ` : ''}${subproject.name}` : undefined}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>
            <Copy size={14} /> {busy ? 'Replicating…' : 'Replicate'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* What will happen, before the fields that make it happen. The value of this action is
            entirely in what it saves you re-doing, and that is a number worth showing. */}
        <div className="rounded-lg bg-blue-pale shadow-[inset_0_0_0_1px_var(--blue-light)] px-3.5 py-3 text-2xs text-text">
          <div className="font-semibold text-blue-deep mb-1">What gets copied</div>
          <ul className="flex flex-col gap-0.5 text-muted">
            <li>
              <span className="font-semibold text-text tabular-nums">{inScopeCount}</span> in-scope object
              {inScopeCount === 1 ? '' : 's'}, with their approach, load order and assigned people
            </li>
            <li>
              <span className="font-semibold text-text tabular-nums">{fmdCount}</span> Field Mapping
              {fmdCount === 1 ? '' : 's'} — <span className="font-semibold text-text">reused, not duplicated</span>:
              the copy points at the same document
            </li>
            <li>Prerequisite waivers, which are decisions about the same objects</li>
            <li className="pt-0.5">
              Not copied: cycles (their dates belong to a real load run) and plants, which you choose below
            </li>
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Code" hint="Must be unique. Up to 10 characters.">
            <Input value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>

        <Field
          label="Plants covered"
          hint="A plant belongs to one subproject per project, so those already covered elsewhere — including by the subproject you are copying — cannot be chosen."
        >
          <PlantPicker
            plants={allPlants}
            selected={plantIds}
            onChange={setPlantIds}
            disabled={busy}
            takenInProject={takenInProject}
          />
        </Field>
      </div>
    </Dialog>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '../../components/Button';
import { StepFlow } from '../../components/StepFlow';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { useSubproject } from '../../lib/queries/programme';
import {
  useMigrationObjects, useSubprojectObjects, useScopeMutations,
  useScopeDependencies, useDependencyCheck,
} from '../../lib/queries/scope';
import { buildScopeGraph, findCycles } from '../../lib/scopeGraph';
import {
  isSettled, useScopeCandidates, useScopeCandidateMutations,
} from '../../lib/queries/scopeCandidates';
import { SelectStep, type ScopeSource } from './wizard/SelectStep';
import { MappingStep } from './wizard/MappingStep';
import { DependencyCheckStep } from './wizard/DependencyCheckStep';
import { LoadSequenceStep } from './wizard/LoadSequenceStep';
import { FinalizeStep, type ReadinessCheck } from './wizard/FinalizeStep';

/** The steps of the sap-dependency-analyzer reference, plus a Finalize the reference does not need
 * because it is not tied to a project.
 *
 * **Source is not a step.** It briefly was, and it was the clearest thing wrong with this screen: a
 * whole page and a click to answer a question that is already answered the moment a list exists —
 * "This subproject's list was built by picking from the SAP catalogue. Continue in the next step."
 * A step that reports a decision rather than taking one is ceremony. The choice now lives where the
 * decision actually is: the empty state of Select Objects, which is the only time it is open.
 *
 * Dependency Check and Load Sequence stay two steps. They answer different questions — "is anything
 * missing" and "in what order does this run" — and the second is only meaningful once the first is
 * settled. The old Dependency Diagram step is gone: it is the same graph as Load Sequence, and it
 * still lives as the standalone ERD Diagram tab, which is where people go back to it. */
const STEPS = [
  { key: 'objects', label: 'Select Objects' },
  { key: 'mapping', label: 'Object Mapping' },
  { key: 'check', label: 'Dependency Check' },
  { key: 'sequence', label: 'Load Sequence' },
  { key: 'finalize', label: 'Finalize' },
];

/** Scope, as a walk-through.
 *
 * Each step only makes sense once the one before it is settled: you cannot confirm a source for an
 * object you have not selected, cannot check prerequisites of a scope that is still changing, and
 * cannot sequence a load whose gaps are unresolved. Tabs would let you do all five in any order and
 * find out at the end that none of them agreed.
 *
 * The wizard writes as it goes rather than at the end — every step's state is a real column on
 * `subproject_objects`, so closing it halfway loses nothing and re-opening it resumes. */
export function ScopeWizard() {
  const { programId, subprojectId, step } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const base = `/pg/${programId}/sp/${subprojectId}/scope`;

  const { data: subproject } = useSubproject(subprojectId);
  const { data: objects = [] } = useMigrationObjects();
  const { data: subprojectObjects = [] } = useSubprojectObjects(subprojectId);
  const { data: dependencies = [] } = useScopeDependencies(subprojectId);
  const { data: checkRows = [] } = useDependencyCheck(subprojectId);
  const { data: candidates = [] } = useScopeCandidates(subprojectId);
  const mutations = useScopeMutations(subprojectId!);
  const candidateMutations = useScopeCandidateMutations(subprojectId!);

  const [busy, setBusy] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [pickedSource, setPickedSource] = useState<ScopeSource | null>(null);

  /** Once a list exists, the source is settled by the data, not by a click — so the candidates win
   * over the local pick. That also means re-opening a half-finished scope resumes on the right
   * path without storing the choice anywhere of its own. */
  const source: ScopeSource | null = candidates[0]?.origin ?? pickedSource;
  const sourceLocked = candidates.length > 0;

  const current = Math.max(0, STEPS.findIndex((s) => s.key === step));
  const go = (index: number) => navigate(`${base}/build/${STEPS[index].key}`);

  const inScope = useMemo(() => subprojectObjects.filter((w) => w.inScope), [subprojectObjects]);
  const savedOrder = useMemo(
    () => [...inScope]
      .sort((a, b) => (a.loadSeq ?? Number.MAX_SAFE_INTEGER) - (b.loadSeq ?? Number.MAX_SAFE_INTEGER))
      .map((w) => w.migrationObjectId),
    [inScope],
  );

  /** Named cycles, computed once for every step that reports them. */
  const cycles = useMemo(
    () => findCycles(inScope.map((w) => w.migrationObjectId), dependencies),
    [inScope, dependencies],
  );

  const { nodes, edges } = useMemo(
    () => buildScopeGraph(objects, inScope, dependencies),
    [objects, inScope, dependencies],
  );

  /** Why Next is refused from the step you are on, or undefined when it is allowed.
   *
   * Object Mapping is a hard gate rather than a warning: everything after it — the dependency
   * check and the load sequence — is derived from the SAP idents these objects map to. Walking past
   * it unmapped does not produce a partial answer, it produces a confident empty one. */
  const blockedReason = useMemo((): string | undefined => {
    if (current === 0 && candidates.length === 0) {
      return source
        ? 'Import a list or pick from the SAP catalogue first.'
        : 'Choose how this subproject’s object list is built.';
    }
    if (current === 1) {
      const unsettled = candidates.filter((c) => !isSettled(c)).length;
      if (unsettled > 0) {
        return `${unsettled} object${unsettled === 1 ? ' still needs' : 's still need'} to be mapped and confirmed.`;
      }
    }
    return undefined;
  }, [current, candidates, source]);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
    } catch (err: any) {
      toast.error(err?.message ?? failure);
    } finally {
      setBusy(false);
    }
  };

  const finalize = () => run(async () => {
    await mutations.setScopeFinalized(true);
    toast.success('Scope finalized — ERD Diagram and FMD Mapping are now open.');
    setConfirmFinalize(false);
    // Not `base` — that redirects into the wizard, which is where you have just come from.
    // Finalizing unlocks the ERD Diagram, so that is what finishing should show you.
    navigate(`${base}/erd`);
  }, 'Could not finalize the scope.');

  /** What finalizing would be signing off. Each entry names the step that fixes it. */
  const checks = useMemo((): ReadinessCheck[] => {
    const unsettled = candidates.filter((c) => !isSettled(c)).length;
    const parked = candidates.filter((c) => c.inScope && c.custom).length;
    const missingPrereqs = checkRows.filter((r) => r.status === 'Missing');
    // Pair-grain: `waived` is the waiver on this exact (object, prerequisite). The object-level
    // `waiverReason` is the pre-0044 shape and is accepted as cover so scopes recorded before the
    // split do not suddenly read as unresolved.
    const unwaived = missingPrereqs.filter((r) => !r.waived && !r.waiverReason);
    const cyclic = nodes.filter((n) => n.cyclic).length;
    const unsequenced = inScope.filter((w) => w.loadSeq === undefined || w.loadSeq === null).length;

    return [
      {
        key: 'selection',
        label: `${candidates.length} object${candidates.length === 1 ? '' : 's'} in the list`,
        level: candidates.length === 0 ? 'block' : 'pass',
        detail: candidates.length === 0
          ? 'A scope with no objects cannot be finalized. Import a list or pick from the SAP catalogue.'
          : `Imported or selected in Select Objects. ${inScope.length} confirmed into scope so far.`,
        step: 0,
      },
      {
        key: 'mapping',
        label: unsettled === 0
          ? 'Every object is mapped and confirmed'
          : `${unsettled} object${unsettled === 1 ? '' : 's'} not mapped and confirmed`,
        level: unsettled > 0 ? 'block' : 'pass',
        detail: unsettled > 0
          ? 'Until an object is mapped to an SAP standard object, its dependencies cannot be found.'
          : parked > 0
            ? `${parked} custom object${parked === 1 ? '' : 's'} parked — they carry no SAP dependencies.`
            : 'Every object is tied to an SAP standard migration object.',
        step: 1,
      },
      {
        key: 'dependencies',
        label: unwaived.length === 0
          ? 'Prerequisites accounted for'
          : `${unwaived.length} prerequisite${unwaived.length === 1 ? '' : 's'} missing without a reason`,
        level: unwaived.length > 0 ? 'warn' : 'pass',
        detail: unwaived.length > 0
          ? 'Pull them into scope, or record why the gap is deliberate.'
          : missingPrereqs.length > 0
            ? `${missingPrereqs.length} prerequisite${missingPrereqs.length === 1 ? ' is' : 's are'} out of scope on purpose, with a reason recorded.`
            : 'Every prerequisite of an in-scope object is also in scope.',
        step: 2,
      },
      {
        key: 'sequence',
        label: cyclic > 0
          ? `${cyclic} object${cyclic === 1 ? '' : 's'} in a dependency cycle`
          : unsequenced > 0
            ? 'Load sequence not saved'
            : 'Load sequence saved',
        level: cyclic > 0 || unsequenced > 0 ? 'warn' : 'pass',
        detail: cyclic > 0
          ? 'A cycle has no valid load order. Break it by taking a dependency out of scope or marking it optional.'
          : unsequenced > 0
            ? `${unsequenced} object${unsequenced === 1 ? ' has' : 's have'} no load position yet — save it from the Load Sequence step.`
            : 'Every object has a load position that respects its prerequisites.',
        step: 3,
      },
    ];
  }, [inScope, checkRows, nodes, candidates]);

  return (
    // Held to a readable measure. The catalogue table has six columns and 300 rows; full-bleed
    // on a wide monitor it stretched every column to fit the screen rather than the content.
    // Every level from here down is flex-1/min-h-0 so the table at the bottom scrolls inside the
    // viewport instead of the page growing past it. One auto-height wrapper anywhere in this
    // chain and the whole thing falls back to a page scrollbar.
    <div className="max-w-[1400px] flex-1 min-h-0 flex flex-col">
      {/* The builder's own header. It replaces the section header and the tab strip rather than
          sitting under them — one navigation on screen at a time is the whole point of moving this
          route out of `TabbedSection`. "Close" is explicit because a focused flow you cannot see
          the way out of is a trap. */}
      <div className="shrink-0 flex items-center gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-text truncate">Build scope</h1>
          <p className="text-2xs text-muted truncate">
            {subproject?.name ?? 'This subproject'} · what to migrate, mapped to SAP, in load order
          </p>
        </div>
        <Button variant="quiet" size="sm" className="ml-auto shrink-0" onClick={() => navigate(`${base}/register`)}>
          <X size={14} /> Close
        </Button>
      </div>

      <div className="shrink-0"><StepFlow steps={STEPS} current={current} onSelect={go} /></div>

      <div className="flex-1 min-h-0 flex flex-col">

      {current === 0 && (
        <SelectStep
          source={source}
          objects={objects}
          candidates={candidates}
          subprojectId={subprojectId!}
          subprojectName={subproject?.name}
          sourceLocked={sourceLocked}
          onChooseSource={setPickedSource}
        />
      )}

      {current === 1 && (
        <MappingStep objects={objects} candidates={candidates} subprojectId={subprojectId!} />
      )}

      {current === 2 && (
        <DependencyCheckStep
          rows={checkRows}
          nodes={nodes}
          busy={busy}
          // Through the candidate list, not straight into `subproject_objects`: a prerequisite that
          // exists only as a scope row is invisible in Select Objects and Object Mapping, makes the
          // Finalize count disagree with what actually loads, and gets reconciled straight back out.
          onAddToScope={(ids) => run(async () => {
            const picked = ids
              .map((id) => objects.find((o) => o.id === id))
              .filter((o): o is NonNullable<typeof o> => !!o)
              .map((o) => ({ id: o.id, objectId: o.objectId, description: o.description }));
            await candidateMutations.adoptPrerequisites.mutateAsync(picked);
            toast.success(`${picked.length} object${picked.length === 1 ? '' : 's'} added to scope.`);
          }, 'Could not add to scope.')}
          onWaive={(pairs) => run(async () => {
            for (const p of pairs) {
              await mutations.waivePrerequisite(p.objectId, p.requiresId, '');
            }
            toast.success(`${pairs.length} prerequisite${pairs.length === 1 ? '' : 's'} marked waived.`);
          }, 'Could not record the waiver.')}
          onUnwaive={(objectId, requiresId) => run(
            () => mutations.unwaivePrerequisite(objectId, requiresId),
            'Could not remove the waiver.',
          )}
        />
      )}

      {current === 3 && (
        <LoadSequenceStep
          nodes={nodes}
          edges={edges}
          cycles={cycles}
          savedOrder={savedOrder}
          busy={busy}
          onSave={(order) => run(async () => {
            await mutations.setLoadSeqBulk(order.map((id, i) => ({ migrationObjectId: id, loadSeq: i + 1 })));
            toast.success('Load sequence saved.');
          }, 'Could not save the sequence.')}
        />
      )}

      {current === 4 && (
        <FinalizeStep
          checks={checks}
          finalized={!!subproject?.scopeFinalized}
          // A `block` check means finalizing would produce a scope that cannot be worked — an
          // unmapped object has no dependencies, no load position and no Golden FMD. The button was
          // gated only on the scope being non-empty, so it stayed enabled while the checklist said
          // "blocked", which teaches people the checklist is decorative.
          canFinalize={inScope.length > 0 && checks.every((c) => c.level !== 'block')}
          busy={busy}
          onGoToStep={go}
          onFinalize={() => setConfirmFinalize(true)}
        />
      )}

      </div>

      {/* Opaque and ruled off. The step bodies scroll behind it, and a transparent footer let the
          last rows show through as if they were part of the controls. */}
      <div className="flex items-center gap-2 pt-4 mt-1 shrink-0 border-t border-line bg-bg">
        <Button variant="secondary" size="sm" onClick={() => go(current - 1)} disabled={current === 0}>
          <ArrowLeft size={14} /> Back
        </Button>
        <span title={blockedReason}>
          <Button
            variant="primary" size="sm" onClick={() => go(current + 1)}
            disabled={current === STEPS.length - 1 || !!blockedReason}
          >
            Next <ArrowRight size={14} />
          </Button>
        </span>
        {/* The reason is spelled out, not just a greyed button. A disabled Next with no
            explanation reads as the app being broken. */}
        {blockedReason
          ? <span className="text-2xs text-amber-ink ml-1">{blockedReason}</span>
          : <span className="text-2xs text-muted ml-2">Step {current + 1} of {STEPS.length}</span>}
      </div>

      <ConfirmDialog
        open={confirmFinalize} title="Finalize scope" busy={busy}
        confirmLabel="Finalize" onCancel={() => setConfirmFinalize(false)} onConfirm={finalize}
        message={
          <>
            <p className="mb-2">
              This opens ERD Diagram and FMD Mapping, plus the sections downstream, and records the
              object list as agreed.
            </p>
            {checks.filter((c) => c.level === 'warn').map((c) => (
              <p key={c.key} className="mb-1.5 text-amber-ink">{c.label} — finalizing accepts that as deliberate.</p>
            ))}
            <p className="text-muted mt-2">Scope can be re-opened afterwards from Migration Object.</p>
          </>
        }
      />
    </div>
  );
}

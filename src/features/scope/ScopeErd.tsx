import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import {
  useMigrationObjects, useSubprojectObjects, useScopeDependencies, useScopeMutations,
} from '../../lib/queries/scope';
import { DependencyDiagram } from './diagram/DependencyDiagram';
import { LibraryObjectDialog } from '../library/LibraryObjectDialog';
import type { MigrationObject } from '../../types/entities';

/** The in-scope objects and their relationships, as a picture — the standalone tab.
 *
 * Draws the same graph the wizard's Load Sequence step stages, so the dependencies you signed off
 * while setting the scope are the ones you come back to afterwards. It opens on Execution rather than
 * Graph: once the scope is agreed, the question people bring to this screen is "what loads when",
 * not "what does this look like". */
export function ScopeErd() {
  const { subprojectId } = useParams();
  const toast = useToast();
  const { data: objects = [] } = useMigrationObjects();
  const { data: subprojectObjects = [] } = useSubprojectObjects(subprojectId);
  const { data: dependencies = [] } = useScopeDependencies(subprojectId);
  const mutations = useScopeMutations(subprojectId!);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<MigrationObject | null>(null);
  const [trail, setTrail] = useState<MigrationObject[]>([]);

  const inScope = useMemo(() => subprojectObjects.filter((w) => w.inScope), [subprojectObjects]);
  const inScopeIds = useMemo(() => new Set(inScope.map((w) => w.migrationObjectId)), [inScope]);
  const savedOrder = useMemo(
    () => [...inScope]
      .sort((a, b) => (a.loadSeq ?? Number.MAX_SAFE_INTEGER) - (b.loadSeq ?? Number.MAX_SAFE_INTEGER))
      .map((w) => w.migrationObjectId),
    [inScope],
  );

  const saveSequence = async (order: string[]) => {
    setBusy(true);
    try {
      await mutations.setLoadSeqBulk(order.map((id, i) => ({ migrationObjectId: id, loadSeq: i + 1 })));
      toast.success('Load sequence saved.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not save the sequence.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DependencyDiagram
        objects={objects}
        inScope={inScope}
        dependencies={dependencies}
        savedOrder={savedOrder}
        onSaveSequence={saveSequence}
        busy={busy}
        defaultView="execution"
        onOpenObject={(id) => setDetail(objects.find((o) => o.id === id) ?? null)}
      />
      {/* The same dialog as Library > Migration Object, the scope catalogue and the register —
          clicking an ident in the graph should reach the same record it reaches everywhere else. */}
      <LibraryObjectDialog
        object={detail}
        onClose={() => { setDetail(null); setTrail([]); }}
        onSelectObject={(id) => {
          const next = objects.find((o) => o.id === id);
          if (!next || !detail) return;
          setTrail((t) => [...t, detail]);
          setDetail(next);
        }}
        onBack={() => {
          const previous = trail[trail.length - 1];
          if (!previous) return;
          setDetail(previous);
          setTrail((t) => t.slice(0, -1));
        }}
        // Reading the object to understand the diagram, not authoring a document from it.
        allowGenerateFmd={false}
        // Consistent with the graph it was opened from: that graph draws the scope, so the
        // per-object diagram inside the dialog must not silently widen to the whole catalogue.
        scopeObjectIds={inScopeIds}
      />
    </>
  );
}

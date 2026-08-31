import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  useMigrationObjects, useSubprojectObjects, useScopeDependencies,
} from '../../lib/queries/scope';
import { DependencyDiagram } from './diagram/DependencyDiagram';
import { LibraryObjectDialog } from '../library/LibraryObjectDialog';
import type { MigrationObject } from '../../types/entities';

/** The in-scope objects and their relationships — the standalone ERD tab.
 *
 * Draws the same graph the wizard's Load Sequence step stages, so the dependencies you signed off
 * while setting the scope are the ones you come back to afterwards. It opens on Execution, which is
 * also the first view: once the scope is agreed, the question people bring to this screen is "what
 * loads when", not "what does this look like".
 *
 * **A reading screen.** It used to save a reordered `load_seq` straight from the Execution list,
 * which put the programme's load order one drag away on a tab nobody opens expecting to change
 * anything. Changing it belongs to Scope > Load Sequence (`scope/build/sequence`), where it sits
 * behind the dependency check and in front of the finalize gate. */
export function ScopeErd() {
  const { subprojectId } = useParams();
  const { data: objects = [] } = useMigrationObjects();
  const { data: subprojectObjects = [] } = useSubprojectObjects(subprojectId);
  const { data: dependencies = [] } = useScopeDependencies(subprojectId);
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

  return (
    <>
      <DependencyDiagram
        objects={objects}
        inScope={inScope}
        dependencies={dependencies}
        savedOrder={savedOrder}
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

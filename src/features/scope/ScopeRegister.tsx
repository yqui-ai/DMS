import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Info, Link2, Pencil, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Toolbar } from '../../components/Toolbar';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { ListEmptyState } from '../../components/ListEmptyState';
import { PersonSelect } from '../../components/PersonSelect';
import { EditToggle } from '../../components/EditToggle';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { getLayerTheme } from '../../lib/layerTheme';
import { buildScopeGraph } from '../../lib/scopeGraph';
import { useAssignablePeople } from '../../lib/queries/people';
import { useScopeCandidates } from '../../lib/queries/scopeCandidates';
import { useLibraryFmds, type LibraryFmdRow } from '../../lib/queries/fmds';
import { FmdStatusTags, fmdStatusRank } from '../../components/FmdStatusTags';
import { libraryPath } from '../../lib/libraryNav';
import { GenerateFmdDialog } from '../library/GenerateFmdDialog';
import { AssignFmdDialog } from './AssignFmdDialog';
import {
  useMigrationObjects, useScopeDependencies, useScopeMutations, useSubprojectObjects,
} from '../../lib/queries/scope';
import { LibraryObjectDialog } from '../library/LibraryObjectDialog';
import type { MigrationObject, SubprojectObject } from '../../types/entities';

/** One in-scope object with everything this list shows about it: the scope row, the catalogue
 * record, and the Field Mapping the subproject has assigned to it. */
interface RegisterRow { scope: SubprojectObject; object: MigrationObject; fmd?: LibraryFmdRow }

/** The agreed scope, as a list — what the wizard produces, read back.
 *
 * The wizard is how you DECIDE the scope; this is how you look it up afterwards, which is a
 * different job and was missing entirely. Once a scope was finalized the section offered a graph
 * (ERD Diagram) and a set of documents (FMD Mapping), and no plain answer to "which objects are we
 * migrating" — the only way to read the list back was to re-enter the wizard you had just closed.
 *
 * It is also where the two assignment roles live. `consultant` and `etl_developer` have been real
 * columns since migration 0034 with no UI anywhere, which mattered more than it sounds: publishing
 * an FMD is gated on the object's consultant, so with nowhere to set one the gate could not be
 * satisfied from inside the app at all. */
export function ScopeRegister() {
  const { programId, subprojectId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const build = `/pg/${programId}/sp/${subprojectId}/scope/build`;

  const { data: objects = [] } = useMigrationObjects();
  const { data: subprojectObjects = [], isLoading } = useSubprojectObjects(subprojectId);
  const { data: dependencies = [] } = useScopeDependencies(subprojectId);
  const { data: candidates = [] } = useScopeCandidates(subprojectId);
  const { data: people = [], isLoading: peopleLoading } = useAssignablePeople({ programId, subprojectId });
  const mutations = useScopeMutations(subprojectId!);

  const [query, setQuery] = useState('');
  const [components, setComponents] = useState<string[]>([]);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [detail, setDetail] = useState<MigrationObject | null>(null);
  const [detailTrail, setDetailTrail] = useState<MigrationObject[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignFor, setAssignFor] = useState<MigrationObject | null>(null);
  const [generateFor, setGenerateFor] = useState<MigrationObject[] | null>(null);

  const inScope = useMemo(() => subprojectObjects.filter((w) => w.inScope), [subprojectObjects]);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  /** What this subproject migrates, as a lookup — used to restrict the object dialog's dependency
   * diagram to the scope rather than the whole catalogue. Memoised because it is a prop: a fresh
   * Set every render would re-run the filter inside the dialog on every keystroke in this screen. */
  const inScopeIds = useMemo(() => new Set(inScope.map((w) => w.migrationObjectId)), [inScope]);

  // The ENRICHED row: this list shows the live version and draft state, which the narrow
  // `useAllFmds` mapper does not carry. See the library-section-design skill.
  const { data: allFmds = [] } = useLibraryFmds();
  const fmdById = useMemo(() => new Map(allFmds.map((f) => [f.id, f])), [allFmds]);

  const assignFmd = async (migrationObjectId: string, fmdId: string | null) => {
    setBusy(true);
    try {
      await mutations.assignFmd(migrationObjectId, fmdId);
      toast.success(fmdId ? 'Field Mapping assigned.' : 'Field Mapping un-assigned.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not save the assignment.');
    } finally {
      setBusy(false);
    }
  };

  /** The load stage each object sits in — the one thing this list can say that the wizard's own
   * screens say better, and the reason the rows are ordered the way they are. */
  const { nodes } = useMemo(
    () => buildScopeGraph(objects, inScope, dependencies),
    [objects, inScope, dependencies],
  );
  const layerOf = useMemo(() => new Map(nodes.map((n) => [n.id, n.layer])), [nodes]);

  /** What each object was called in the source list, when it came from an import. Their name for it
   * is what they will keep recognising it by, so it stays visible next to the SAP ident. */
  const sourceIdentOf = useMemo(() => {
    const out = new Map<string, string>();
    for (const c of candidates) {
      if (c.mappedObjectId && c.origin === 'import') out.set(c.mappedObjectId, c.sourceIdent);
    }
    return out;
  }, [candidates]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    // flatMap rather than map + a type predicate: the predicate stopped narrowing once the row
    // grew a third property, and an "impossible" undefined that only TypeScript knows about is a
    // runtime crash waiting for the first object the catalogue has not loaded yet.
    return inScope
      .flatMap((w): RegisterRow[] => {
        const object = byId.get(w.migrationObjectId);
        if (!object) return [];
        // Read the ASSIGNMENT, never `fmds.subproject_id` — that column records where a document
        // was authored, not where it is used. See the library-section-design skill.
        return [{ scope: w, object, fmd: w.fmdId ? fmdById.get(w.fmdId) : undefined }];
      })
      .filter(({ scope, object, fmd }) => (
        (!q
          || object.objectId.toLowerCase().includes(q)
          || (object.description ?? '').toLowerCase().includes(q)
          || (fmd?.name ?? '').toLowerCase().includes(q)
          || (sourceIdentOf.get(object.id) ?? '').toLowerCase().includes(q))
        && (components.length === 0 || (!!object.component && components.includes(object.component)))
        && (!unassignedOnly || !scope.consultant || !scope.etlDeveloper)
      ))
      .sort((a, b) => (
        (layerOf.get(a.object.id) ?? 0) - (layerOf.get(b.object.id) ?? 0)
        || a.object.objectId.localeCompare(b.object.objectId)
      ));
  }, [inScope, byId, fmdById, query, components, unassignedOnly, layerOf, sourceIdentOf]);

  const componentOptions = useMemo(
    () => [...new Set(inScope.map((w) => byId.get(w.migrationObjectId)?.component).filter((c): c is string => !!c))].sort(),
    [inScope, byId],
  );

  const unassigned = inScope.filter((w) => !w.consultant || !w.etlDeveloper).length;
  /** In-scope objects with no Field Mapping. Carried in from the old FMD Mapping tab, which was
   * this same list with a different subset of columns. */
  const noFmd = useMemo(
    () => inScope.filter((w) => !w.fmdId).flatMap((w) => byId.get(w.migrationObjectId) ?? []),
    [inScope, byId],
  );
  const hasFilters = !!query || components.length > 0 || unassignedOnly;
  const clear = () => { setQuery(''); setComponents([]); setUnassignedOnly(false); };

  const assign = async (migrationObjectId: string, role: 'consultant' | 'etlDeveloper', who: string) => {
    setBusy(true);
    try {
      await mutations.setAssignee(migrationObjectId, role, who);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not save the assignment.');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<typeof rows[number]>[] = [
    {
      key: 'stage', header: 'Stage', width: 62,
      sortValue: ({ object }) => layerOf.get(object.id) ?? 0,
      render: ({ object }) => {
        const layer = layerOf.get(object.id) ?? 0;
        const theme = getLayerTheme(layer);
        return (
          <span
            className="text-2xs font-bold rounded-pill px-2 py-0.5 tabular-nums"
            style={{ background: theme.wash, color: theme.ink }}
            title={layer === 0 ? 'Loads first — needs nothing else in scope' : `Waits for stage ${layer - 1}`}
          >
            L{layer}
          </span>
        );
      },
    },
    {
      key: 'objectId', header: 'Object ID', width: 190,
      sortValue: ({ object }) => object.objectId,
      render: ({ object }) => {
        const source = sourceIdentOf.get(object.id);
        return (
          <span className="min-w-0 block">
            <span className="font-mono block truncate">{object.objectId}</span>
            {source && source !== object.objectId && (
              <span className="text-2xs text-muted block truncate" title="What this was called in the imported list">
                from {source}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'description', header: 'Description',
      sortValue: ({ object }) => object.description,
      render: ({ object }) => object.description ?? '—',
    },
    {
      key: 'component', header: 'Component', width: 110,
      sortValue: ({ object }) => object.component,
      render: ({ object }) => object.component ?? '—',
    },
    {
      key: 'consultant', header: 'Consultant', width: 170,
      sortValue: ({ scope }) => scope.consultant,
      render: ({ scope, object }) => (
        editing === object.id ? (
          <PersonSelect
            value={scope.consultant} people={people} loading={peopleLoading || busy}
            onChange={(who) => assign(object.id, 'consultant', who)}
            emptyHint="Nobody is assigned to this subproject yet."
          />
        ) : (
          <Assignee name={scope.consultant} />
        )
      ),
    },
    {
      key: 'etl', header: 'ETL Developer', width: 170,
      sortValue: ({ scope }) => scope.etlDeveloper,
      render: ({ scope, object }) => (
        editing === object.id ? (
          <PersonSelect
            value={scope.etlDeveloper} people={people} loading={peopleLoading || busy}
            onChange={(who) => assign(object.id, 'etlDeveloper', who)}
            emptyHint="Nobody is assigned to this subproject yet."
          />
        ) : (
          <Assignee name={scope.etlDeveloper} />
        )
      ),
    },
    {
      /* Merged in from the old FMD Mapping tab. They listed the same twelve objects with two
         different subsets of their columns, so answering "who owns this and does it have a mapping"
         meant switching tabs and re-finding the row. One list, one row per object. */
      key: 'fmd', header: 'Field Mapping', width: 250,
      sortValue: ({ fmd }) => fmd?.name ?? '',
      // The column reports; it does not act. The assign/change action is an icon in the row's
      // action cluster, so eleven unmapped objects no longer put eleven bordered buttons down the
      // middle of the table.
      render: ({ fmd }) => (fmd ? (
        <span className="flex items-center gap-2 min-w-0">
          <FileText size={13} className="text-muted shrink-0" />
          <button
            type="button"
            onClick={() => navigate(`${libraryPath('fmds', programId, subprojectId)}/${fmd.id}`)}
            className="font-mono text-blue hover:underline truncate min-w-0"
            title={`Open ${fmd.name}`}
          >
            {fmd.name}
          </button>
        </span>
      ) : (
        <span className="text-muted">Not assigned</span>
      )),
    },
    {
      /* Status is its own column rather than tags trailing the name. Sharing a cell, the badges
         were whatever width was left after a 24-character monospace filename and truncated first —
         which loses exactly the part you were scanning for. Given a column they line up down the
         list, so "which of these needs work" is one glance instead of twelve.
         Sorted by urgency, not alphabetically: see fmdStatusRank. */
      key: 'fmdStatus', header: 'Status', width: 190,
      sortValue: ({ fmd }) => fmdStatusRank(fmd),
      render: ({ fmd }) => (fmd
        ? <FmdStatusTags fmd={fmd} />
        : <span className="text-muted">—</span>),
    },
    {
      key: 'actions', header: '', width: 104,
      render: ({ object, fmd }) => (
        <span className="flex items-center gap-0.5 justify-end">
          {/* Always present, both states. Merging FMD Mapping in dropped the "Change" button that
              screen had, so an object with an FMD had no way to swap it — the assignment became a
              one-way door, which is exactly what reuse is not. */}
          <button
            type="button"
            onClick={() => setAssignFor(object)}
            title={fmd ? `Change the Field Mapping for ${object.objectId}` : 'Assign a Field Mapping, or generate one'}
            aria-label={fmd ? 'Change Field Mapping' : 'Assign Field Mapping'}
            className={clsx(
              'w-7 h-7 grid place-items-center rounded transition-colors hover:bg-surface-2',
              fmd ? 'text-muted hover:text-text' : 'text-blue hover:text-blue-deep',
            )}
          >
            <Link2 size={14} />
          </button>
          {/* Assignment opens per row rather than every row rendering two dropdowns. Sixty live
              selects is both a slow table and a screen that looks like a form when it is a list. */}
          <EditToggle
            editing={editing === object.id}
            onToggle={() => setEditing((cur) => (cur === object.id ? null : object.id))}
            what="consultant and ETL developer"
          />
          <button
            type="button"
            onClick={() => setDetail(object)}
            title={`Open ${object.objectId} details`}
            aria-label={`Open ${object.objectId} details`}
            className="w-7 h-7 grid place-items-center rounded text-muted hover:bg-surface-2 hover:text-text transition-colors"
          >
            <Info size={14} />
          </button>
        </span>
      ),
    },
  ];

  if (!isLoading && inScope.length === 0) {
    return (
      <EmptyState
        title="Nothing in scope yet"
        description="Pick the objects this subproject migrates, map them to SAP, and work through dependencies and load order."
        action={<Button variant="primary" onClick={() => navigate(build)}>Build the scope</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <Toolbar
        spacing="none"
        search={{ value: query, onChange: setQuery, placeholder: 'Search the scope…' }}
        onClearFilters={hasFilters ? clear : undefined}
        count={rows.length} noun="objects"
        actions={
          <>
            {unassigned > 0 && (
              <Button
                variant={unassignedOnly ? 'primary' : 'quiet'} size="sm"
                onClick={() => setUnassignedOnly((v) => !v)}
                title="Objects missing a consultant or an ETL developer"
              >
                <SlidersHorizontal size={13} /> Unassigned {unassigned}
              </Button>
            )}
            {/* Bulk GENERATION only — there is no bulk assign, deliberately. Which existing
                document a subproject adopts is a judgement per object, and doing it fifty at a
                time is how the wrong FMD gets attached to forty-nine of them. */}
            {noFmd.length > 1 && (
              <Button variant="ai" size="sm" onClick={() => setGenerateFor(noFmd)}>
                <Sparkles size={13} /> Generate {noFmd.length} FMDs
              </Button>
            )}
            {/* The only way into the builder. The register is where you look the scope up; changing
                it is a deliberate act with its own focused flow, not a mode this screen slips into. */}
            <Button variant="primary" size="sm" onClick={() => navigate(build)}>
              <Pencil size={13} /> Edit scope
            </Button>
          </>
        }
      >
        {componentOptions.length > 1 && (
          <MultiSelectFilter label="Component" options={componentOptions} selected={components} onChange={setComponents} />
        )}
      </Toolbar>

      {rows.length === 0 ? (
        <ListEmptyState
          noun="objects" filtered={hasFilters}
          description="Nothing in this subproject's scope matches."
          onClearFilters={clear}
        />
      ) : (
        <Table
          columns={columns} rows={rows} rowKey={({ object }) => object.id}
          pageSize={25} emptyMessage="Loading…" fill
        />
      )}

      <AssignFmdDialog
        object={assignFor}
        currentFmdId={rows.find((r) => r.object.id === assignFor?.id)?.fmd?.id}
        busy={busy}
        onAssign={(fmdId) => { if (assignFor) assignFmd(assignFor.id, fmdId); }}
        onGenerate={() => { setGenerateFor(assignFor ? [assignFor] : null); setAssignFor(null); }}
        onClose={() => setAssignFor(null)}
      />

      {/* Generated here means wanted here — the result assigns itself to this subproject. */}
      <GenerateFmdDialog
        objects={generateFor}
        onClose={() => setGenerateFor(null)}
        onGenerated={(fmdId, migrationObjectId) => assignFmd(migrationObjectId, fmdId)}
      />

      {/* The same dialog as Library > Migration Object and the wizard's catalogue. Its prerequisite
          links are walkable, and since there is no URL to push here the hops are kept in a stack —
          otherwise the dialog offers a Back button that unwinds nothing. */}
      <LibraryObjectDialog
        object={detail}
        onClose={() => { setDetail(null); setDetailTrail([]); }}
        onSelectObject={(objectId) => {
          const next = objects.find((o) => o.id === objectId);
          if (!next || !detail) return;
          setDetailTrail((t) => [...t, detail]);
          setDetail(next);
        }}
        onBack={() => {
          const previous = detailTrail[detailTrail.length - 1];
          if (!previous) return;
          setDetail(previous);
          setDetailTrail((t) => t.slice(0, -1));
        }}
        // Reading the object to check what was agreed, not authoring a document from it.
        allowGenerateFmd={false}
        // The dependency diagram answers "what does this need" against the SAP catalogue, which is
        // program-wide. Here the question is narrower — what does this need *that we are actually
        // migrating* — so the graph is restricted to the scope and says so on its face.
        scopeObjectIds={inScopeIds}
      />
    </div>
  );
}

function Assignee({ name }: { name?: string }) {
  if (!name) return <Tag variant="neutral" size="sm">Unassigned</Tag>;
  return <span className="truncate">{name}</span>;
}

/* The FMD status badges moved to `components/FmdStatusTags` — this screen carried a cut-down copy
   (version + Draft) while Library carried the full set, so the same FMD reported different things
   depending on which list you were reading it in. One component now, one definition of each flag. */

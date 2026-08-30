import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronRight, ExternalLink, EyeOff, Files, Filter, Key, Table2 } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Tag } from '../../components/Tag';
import { ApproachTag } from '../../components/ApproachTag';
import { EmptyState } from '../../components/EmptyState';
import { Table, type Column } from '../../components/Table';
import { useDmcFields, useDmcStructures } from '../../lib/queries/dmcStructures';
import { useObjectDependencies } from '../../lib/queries/scope';
import { useStandardFmdLinks } from '../../lib/queries/fmds';
import { useLibraryPath } from '../../lib/libraryNav';
import { GenerateFmdDialog } from './GenerateFmdDialog';
import { DependencyDiagram } from './DependencyDiagram';
import type { DmcField, DmcStructure, DmcStructureSide, MigrationObject } from '../../types/entities';

type Tab = 'details' | 'structure';
const TABS: { key: Tab; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'structure', label: 'Structure' },
];

export interface LibraryObjectDialogProps {
  object: MigrationObject | null;
  onClose: () => void;
  /** Navigate the dialog to a different object (e.g. clicking a prerequisite in Dependencies).
   * Each object is its own URL, so this pushes a history entry. */
  onSelectObject: (objectId: string) => void;
  /** Unwind one `onSelectObject` hop. Separate from `onSelectObject` because those hops are real
   * history entries now: re-selecting the previous id would push a third entry that merely looks
   * like going back, leaving browser Back pointing forward. */
  onBack: () => void;
  /** Generating an FMD is a LIBRARY action — it authors a new record in the Field Mapping
   * catalogue. The same dialog opens from Design > Scope, where the object is being read to
   * decide whether to migrate it; offering to create a document there is an unrelated,
   * irreversible side trip out of the step someone is in the middle of. Defaults to true so
   * the Library keeps it without opting in. */
  allowGenerateFmd?: boolean;
  /** Migration object ids that are in the current subproject's scope. When supplied, the dependency
   * diagram is restricted to them.
   *
   * The catalogue's dependency graph is program-wide: `object_dependencies` says what an object
   * needs in SAP, not what this subproject agreed to migrate. Opened from Scope, that meant a
   * twelve-object scope could produce a diagram full of objects nobody had chosen — indistinguishable
   * from objects that WERE in scope, so the picture quietly overstated the work. Undefined (the
   * Library's own use) means "no scope to restrict to", and the full catalogue graph is correct
   * there. */
  scopeObjectIds?: ReadonlySet<string>;
}

export function LibraryObjectDialog({
  object, onClose, onSelectObject, onBack, allowGenerateFmd = true, scopeObjectIds,
}: LibraryObjectDialogProps) {
  const [tab, setTab] = useState<Tab>('details');
  const [history, setHistory] = useState<string[]>([]);
  const [generateOpen, setGenerateOpen] = useState(false);

  useEffect(() => {
    setTab('details');
  }, [object?.id]);

  useEffect(() => {
    if (!object) setHistory([]);
  }, [object]);

  const navigateTo = (nextId: string) => {
    if (object) setHistory((h) => [...h, object.id]);
    onSelectObject(nextId);
  };
  // The stack isn't the navigation — the URL is. It only records how many hops deep into the
  // dependency chain you are, which is what decides whether a Back affordance belongs in the
  // dialog header at all.
  const goBack = () => {
    if (history.length === 0) return;
    setHistory((h) => h.slice(0, -1));
    onBack();
  };

  return (
    <Dialog
      open={!!object} onClose={onClose} title={object?.objectId ?? ''} size="win" onBack={history.length > 0 ? goBack : undefined}
    >
      {object && (
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between gap-3 border-b border-line mb-3 shrink-0">
            <div className="flex items-center gap-1">
              {TABS.map((t) => (
                <button
                  key={t.key} onClick={() => setTab(t.key)}
                  className={clsx(
                    'px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px',
                    tab === t.key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {allowGenerateFmd && (
              <Button variant="quiet" size="sm" onClick={() => setGenerateOpen(true)} className="shrink-0 -mt-[5px]"><Files size={13} /> Generate FMD</Button>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {tab === 'details' && <DetailsTab object={object} onSelectObject={navigateTo} scopeObjectIds={scopeObjectIds} />}
            {tab === 'structure' && <StructureTab object={object} />}
          </div>
          {allowGenerateFmd && (
            <GenerateFmdDialog objects={generateOpen ? [object] : null} onClose={() => setGenerateOpen(false)} />
          )}
        </div>
      )}
    </Dialog>
  );
}

function DetailsTab({ object, onSelectObject, scopeObjectIds }: {
  object: MigrationObject;
  onSelectObject: (objectId: string) => void;
  scopeObjectIds?: ReadonlySet<string>;
}) {
  const { data: allDependencies = [], isLoading: depsLoading } = useObjectDependencies(object.id);

  /** The catalogue's prerequisites, narrowed to what this subproject actually migrates. */
  const dependencies = useMemo(
    () => (scopeObjectIds ? allDependencies.filter((d) => scopeObjectIds.has(d.requiresObjectId)) : allDependencies),
    [allDependencies, scopeObjectIds],
  );
  const hidden = allDependencies.length - dependencies.length;
  const { data: standardFmdLinks = [] } = useStandardFmdLinks();
  const fmdLink = standardFmdLinks.find((l) => l.migrationObjectId === object.id);
  const navigate = useNavigate();
  const to = useLibraryPath();

  return (
    <div className="flex gap-5 h-full min-h-0">
      <div className="flex-1 min-w-0 overflow-auto flex flex-col gap-5 pr-1">
        <div className="flex flex-col gap-1.5 mb-1">
          {object.description ? (
            <p className="text-xl font-bold text-text">{object.description}</p>
          ) : (
            <p className="text-sm2 italic text-muted">No description provided yet.</p>
          )}
          <div className="flex items-center gap-4 flex-wrap">
            {object.url && (
              <a
                href={object.url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm2 font-semibold text-blue hover:underline w-fit"
              >
                <ExternalLink size={14} /> SAP Documentation
              </a>
            )}
            {fmdLink && (
              <button
                // Goes to the FMD's own page rather than stacking a second viewer inside this
                // dialog — Back comes straight back here.
                onClick={() => navigate(to('fmds', fmdLink.fmdId))}
                className="inline-flex items-center gap-1.5 text-sm2 font-semibold text-blue hover:underline w-fit"
              >
                <Files size={14} /> Standard FMD: {fmdLink.displayId ?? fmdLink.name}
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-8 flex-wrap">
          <div className="flex-1 min-w-[220px] flex flex-col gap-3">
            <SummaryField label="Object Type">{object.category ?? '—'}</SummaryField>
            <SummaryField label="Class">{object.class}</SummaryField>
            <SummaryField label="Approach"><ApproachTag approach={object.approach} /></SummaryField>
            <SummaryField label="Component">{object.component ?? '—'}</SummaryField>
          </div>
          <div className="flex-1 min-w-[220px] flex flex-col gap-3">
            <SummaryField label="Technical Name">{object.technicalName ?? '—'}</SummaryField>
            <SummaryField label="Invalid">{object.invalid ? <Tag variant="warn">Yes</Tag> : <Tag variant="neutral">No</Tag>}</SummaryField>
            <SummaryField label="Custom Field Support">{object.customFieldSupport ?? '—'}</SummaryField>
            <SummaryField label="Analyze Selection">{object.analyzeSelection ?? '—'}</SummaryField>
          </div>
        </div>

        <div className="border-t border-line pt-3 mt-auto">
          <div className="text-2xs font-semibold uppercase tracking-[.04em] text-muted mb-2">Technical</div>
          <div className="grid grid-cols-2 gap-3">
            <SummaryField label="GUID"><span className="font-mono text-2xs break-all">{object.guid ?? '—'}</span></SummaryField>
            <SummaryField label="Program ID"><span className="font-mono text-2xs break-all">{object.programId}</span></SummaryField>
            <SummaryField label="Sender Container"><span className="font-mono text-2xs break-all">{object.scontainer ?? '—'}</span></SummaryField>
            <SummaryField label="Receiver Container"><span className="font-mono text-2xs break-all">{object.rcontainer ?? '—'}</span></SummaryField>
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <span className="text-2xs font-semibold uppercase tracking-[.04em] text-muted">Dependency Diagram</span>
          {/* Says what you are looking at even when nothing was filtered out. "All eight
              prerequisites happen to be in scope" and "this diagram is the whole catalogue" look
              identical otherwise, and only one of them stays true as the scope changes. */}
          {scopeObjectIds && (
            <Tag variant="accent" size="sm" title="Restricted to objects in this subproject's scope">
              <Filter size={10} /> In scope only
            </Tag>
          )}
        </div>
        {hidden > 0 && (
          <div className="flex items-start gap-2 mb-2 shrink-0 rounded border border-amber-ink/25 bg-amber-bg px-2.5 py-2 text-2xs text-amber-ink">
            <EyeOff size={13} className="shrink-0 mt-px" />
            <span>
              <strong className="font-semibold">
                {hidden} prerequisite{hidden === 1 ? '' : 's'} hidden.
              </strong>{' '}
              {object.objectId} depends on {allDependencies.length} object{allDependencies.length === 1 ? '' : 's'} in
              the SAP catalogue, but only {dependencies.length} {dependencies.length === 1 ? 'is' : 'are'} in this
              subproject&apos;s scope. Open it from Library &rsaquo; Migration Object to see the full graph.
            </span>
          </div>
        )}
        <div className="flex-1 min-h-0">
          {depsLoading ? (
            <p className="text-sm2 text-muted">Loading…</p>
          ) : dependencies.length === 0 && allDependencies.length > 0 ? (
            /* Not the same as "no dependencies", and the diagram's own empty state says exactly
               that — which would be a lie here. This object has prerequisites; none of them were
               brought into scope. */
            <EmptyState
              icon={<EyeOff size={22} />}
              title="No prerequisites in scope"
              description={`${object.objectId} depends on ${allDependencies.length} catalogue object${allDependencies.length === 1 ? '' : 's'}, none of which this subproject migrates. Add one to the scope to see it here.`}
            />
          ) : (
            <DependencyDiagram
              key={object.id}
              root={{ objectId: object.objectId, description: object.description, category: object.category, component: object.component }}
              dependencies={dependencies} onSelectObject={onSelectObject}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs font-semibold uppercase tracking-[.04em] text-muted mb-0.5">{label}</div>
      <div className="text-sm2 text-text">{children}</div>
    </div>
  );
}

interface TreeNode { structure: DmcStructure; children: TreeNode[] }

/** Builds the structure hierarchy from a flat (already single-side) list using PARENTID — a root
 * node's parentGuid points at the object's own container guid (not another structure in the set),
 * everything else nests under whichever sibling's `guid` its `parentGuid` matches. */
function buildForest(structures: DmcStructure[]): TreeNode[] {
  const byGuid = new Set(structures.map((s) => s.guid));
  const childrenByParent = new Map<string, DmcStructure[]>();
  const roots: DmcStructure[] = [];
  for (const s of structures) {
    if (s.parentGuid && byGuid.has(s.parentGuid)) {
      const arr = childrenByParent.get(s.parentGuid) ?? [];
      arr.push(s);
      childrenByParent.set(s.parentGuid, arr);
    } else {
      roots.push(s);
    }
  }
  const bySeq = (a: DmcStructure, b: DmcStructure) => (a.seq ?? 0) - (b.seq ?? 0);
  const build = (s: DmcStructure): TreeNode => ({ structure: s, children: (childrenByParent.get(s.guid) ?? []).sort(bySeq).map(build) });
  return roots.sort(bySeq).map(build);
}

const RAIL_COLOR = '#a9c7e6';

/** Nested left-borders, one per sibling group — the vertical line is one continuous CSS border
 * spanning exactly the height of its own children, so there's no per-row segment math to get
 * wrong (unlike absolutely-positioned half-height divs, or text glyphs which don't span between
 * separate row elements at all). Each row adds its own short horizontal "elbow" stub to meet it. */
function StructureTree({
  nodes, depth, selectedId, onSelect, collapsed, onToggle,
}: {
  nodes: TreeNode[]; depth: number; selectedId: string | null; onSelect: (id: string) => void;
  collapsed: Set<string>; onToggle: (id: string) => void;
}) {
  const rows = nodes.map((node) => (
    <StructureTreeRow
      key={node.structure.id} node={node} depth={depth}
      selectedId={selectedId} onSelect={onSelect} collapsed={collapsed} onToggle={onToggle}
    />
  ));
  if (depth === 0) return <>{rows}</>;
  return <div className="ml-2 pl-3 border-l" style={{ borderColor: RAIL_COLOR }}>{rows}</div>;
}

function StructureTreeRow({
  node, depth, selectedId, onSelect, collapsed, onToggle,
}: {
  node: TreeNode; depth: number; selectedId: string | null; onSelect: (id: string) => void;
  collapsed: Set<string>; onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.structure.id);
  const isSelected = node.structure.id === selectedId;

  return (
    <div>
      <div
        onClick={() => onSelect(node.structure.id)}
        className={clsx('relative flex items-center gap-1 rounded-xs cursor-pointer py-0.5 pr-1', isSelected ? 'bg-blue-light' : 'hover:bg-blue-pale')}
      >
        {depth > 0 && <span className="absolute -left-3 top-1/2 w-3 h-px" style={{ backgroundColor: RAIL_COLOR }} />}
        <div className="min-w-0 flex-1 py-0.5">
          <div className={clsx('font-mono truncate text-sm2', hasChildren || isSelected ? 'font-bold' : 'font-normal', isSelected && 'text-blue-deep')}>
            {node.structure.ident}
          </div>
          {node.structure.description && <div className="text-2xs text-muted truncate">{node.structure.description}</div>}
        </div>
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(node.structure.id); }}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted hover:text-blue hover:bg-blue-light"
          >
            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : (
          <span className="shrink-0 w-5" />
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <StructureTree
          nodes={node.children} depth={depth + 1}
          selectedId={selectedId} onSelect={onSelect} collapsed={collapsed} onToggle={onToggle}
        />
      )}
    </div>
  );
}

function StructureTab({ object }: { object: MigrationObject }) {
  const { data: structures = [], isLoading } = useDmcStructures(object.id);
  const [side, setSide] = useState<DmcStructureSide>('sender');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { data: fields = [], isLoading: fieldsLoading } = useDmcFields(selectedId ?? undefined);

  const sender = useMemo(() => structures.filter((s) => s.side === 'sender'), [structures]);
  const receiver = useMemo(() => structures.filter((s) => s.side === 'receiver'), [structures]);
  const shown = side === 'sender' ? sender : receiver;
  const forest = useMemo(() => buildForest(shown), [shown]);

  useEffect(() => {
    const initialSide: DmcStructureSide = structures.some((s) => s.side === 'sender') ? 'sender' : 'receiver';
    setSide(initialSide);
    setCollapsed(new Set());
  }, [object.id, structures]);

  useEffect(() => {
    setSelectedId(forest[0]?.structure.id ?? null);
  }, [side, forest]);

  const toggleCollapsed = (id: string) => setCollapsed((c) => {
    const next = new Set(c);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selected = structures.find((s) => s.id === selectedId);

  const columns: Column<DmcField>[] = [
    { key: 'key', header: '', width: 30, render: (f) => (f.keyFlag ? <Key size={13} className="text-amber-ink" /> : null) },
    { key: 'seq', header: 'Pos', numeric: true, width: 55, render: (f) => f.seq ?? '—', sortValue: (f) => f.seq },
    { key: 'fieldName', header: 'Field Name', render: (f) => <span className="font-mono font-bold text-sm2">{f.fieldName}</span>, sortValue: (f) => f.fieldName },
    { key: 'dataType', header: 'Type', render: (f) => f.dataType ?? '—', sortValue: (f) => f.dataType },
    { key: 'length', header: 'Length', numeric: true, render: (f) => f.length ?? '—', sortValue: (f) => f.length },
    { key: 'decimals', header: 'Decimals', numeric: true, render: (f) => f.decimals ?? '—', sortValue: (f) => f.decimals },
    { key: 'domName', header: 'Domain', render: (f) => f.domName ? <span className="font-mono text-2xs">{f.domName}</span> : '—', sortValue: (f) => f.domName },
    { key: 'checkTable', header: 'Check Table', render: (f) => f.checkTable ? <span className="font-mono text-2xs">{f.checkTable}</span> : '—', sortValue: (f) => f.checkTable },
    { key: 'description', header: 'Description', render: (f) => f.description ?? '—', sortValue: (f) => f.description },
  ];

  if (!isLoading && structures.length === 0) {
    return <EmptyState icon={<Table2 size={22} />} title="No structures found" description="This object's sender/receiver container guids didn't match any DMC_STREE rows." />;
  }

  return (
    <div className="flex gap-4 h-full min-h-0">
      <div className="w-[340px] shrink-0 overflow-auto border-r border-line pr-3">
        <div className="sticky top-0 z-10 bg-surface pb-3">
          <div className="flex rounded border border-line-strong overflow-hidden">
            <button
              onClick={() => setSide('sender')} disabled={sender.length === 0}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm2 font-semibold disabled:opacity-40',
                side === 'sender' ? 'bg-blue text-white' : 'bg-surface text-text hover:bg-blue-pale',
              )}
            >
              <ArrowUpFromLine size={13} /> Sender ({sender.length})
            </button>
            <button
              onClick={() => setSide('receiver')} disabled={receiver.length === 0}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm2 font-semibold disabled:opacity-40 border-l border-line-strong',
                side === 'receiver' ? 'bg-blue text-white' : 'bg-surface text-text hover:bg-blue-pale',
              )}
            >
              <ArrowDownToLine size={13} /> Receiver ({receiver.length})
            </button>
          </div>
        </div>
        <div className="flex flex-col">
          <StructureTree nodes={forest} depth={0} selectedId={selectedId} onSelect={setSelectedId} collapsed={collapsed} onToggle={toggleCollapsed} />
        </div>
      </div>
      <div className="flex-1 min-w-0 overflow-auto">
        {!selected ? (
          <EmptyState title="Select a structure" description="Pick a structure on the left to see its fields." />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Tag variant={selected.side === 'sender' ? 'accent' : 'connection'}>{selected.side === 'sender' ? 'Sender' : 'Receiver'}</Tag>
              <span className="font-mono font-bold text-sm2">{selected.ident}</span>
              {selected.ddicName && <span className="text-2xs text-muted font-mono">({selected.ddicName})</span>}
              <span className="text-sm2 text-muted truncate">{selected.description}</span>
            </div>
            <Table columns={columns} rows={fields} rowKey={(f) => f.id} pageSize={50} emptyMessage={fieldsLoading ? 'Loading…' : 'No fields.'} dense />
          </div>
        )}
      </div>
    </div>
  );
}

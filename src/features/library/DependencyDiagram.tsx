import { useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { MousePointerClick, Package, Sparkles, Sun } from 'lucide-react';
import clsx from 'clsx';
import { ColorTag } from '../../components/ColorTag';
import { EmptyState } from '../../components/EmptyState';
import { componentMainGroup } from '../../lib/tagColor';
import { useErdTheme, type ErdTheme } from '../../lib/erdTheme';
import type { ObjectPrerequisite } from '../../lib/queries/scope';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 118;
const COL_GAP = 28;
const ROW_GAP = 28;
const ROOT_TOP_GAP = 64;

const FUTURISTIC_RED = '#ff5470';
const FUTURISTIC_CYAN = '#4fd1ff';
const FUTURISTIC_BLUE = '#7cb3ff';

interface DiagramRoot { objectId: string; description?: string; category?: string; component?: string }

interface DepNodeData extends Record<string, unknown> {
  ident: string;
  description?: string;
  category?: string;
  component?: string;
  mandatory?: boolean;
  isRoot?: boolean;
  theme: ErdTheme;
  selected?: boolean;
  dimmed?: boolean;
  onNavigate?: () => void;
}

function DepNode({ data }: NodeProps<Node<DepNodeData>>) {
  const futuristic = data.theme === 'futuristic';
  const accent = data.isRoot ? FUTURISTIC_BLUE : data.mandatory ? FUTURISTIC_RED : FUTURISTIC_CYAN;

  return (
    <div
      style={{
        width: NODE_WIDTH, height: NODE_HEIGHT,
        ...(futuristic
          ? {
            backgroundImage: data.isRoot ? 'linear-gradient(160deg, #2f6fed 0%, #17306e 100%)' : 'linear-gradient(160deg, #253158 0%, #171f38 100%)',
            border: `1px solid ${accent}`,
            boxShadow: data.selected ? `0 0 22px 0 ${accent}, inset 0 0 24px -10px ${accent}` : `0 0 14px -2px ${accent}99, inset 0 0 20px -12px ${accent}`,
          }
          : {}),
      }}
      className={clsx(
        'flex flex-col justify-center gap-1.5 px-3.5 py-2.5 rounded-[10px] transition-opacity',
        !futuristic && (data.isRoot
          ? 'bg-blue'
          : clsx(
            'bg-surface cursor-pointer transition-colors hover:bg-blue-pale hover:shadow-[inset_0_0_0_1.5px_var(--blue-deep)]',
            data.mandatory ? 'shadow-[inset_0_0_0_1.5px_var(--red)]' : 'shadow-[inset_0_0_0_1px_var(--line)]',
            data.selected && 'ring-2 ring-blue ring-offset-2',
          )),
        futuristic && !data.isRoot && 'cursor-pointer transition-shadow hover:brightness-125',
        data.dimmed && 'opacity-35',
      )}
    >
      {!data.isRoot && <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />}
      <div className="flex items-center gap-2 min-w-0">
        {data.isRoot && (
          <span
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white"
            style={futuristic ? { backgroundColor: `${FUTURISTIC_BLUE}33`, boxShadow: `0 0 8px ${FUTURISTIC_BLUE}` } : { backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <Package size={14} />
          </span>
        )}
        <span
          onClick={data.isRoot ? undefined : (e) => { e.stopPropagation(); data.onNavigate?.(); }}
          className={clsx(
            'font-mono font-bold truncate min-w-0 flex-1',
            data.isRoot ? 'text-[15px] text-white' : futuristic ? 'text-sm2 text-white hover:underline cursor-pointer' : 'text-sm2 text-text hover:underline cursor-pointer',
          )}
          title={data.isRoot ? data.ident : `Open ${data.ident}`}
        >
          {data.ident}
        </span>
      </div>
      <div className={clsx('text-2xs leading-snug line-clamp-3', data.isRoot ? 'text-white/85' : futuristic ? 'text-white/60' : 'text-muted')} title={data.description}>
        {data.description || '—'}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {data.category && <ColorTag colorKey={data.category} className="text-[10px] px-1.5 py-px">{data.category}</ColorTag>}
        {data.component && <ColorTag colorKey={componentMainGroup(data.component)} className="text-[10px] px-1.5 py-px">{data.component}</ColorTag>}
      </div>
      {data.isRoot && <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />}
    </div>
  );
}

const nodeTypes = { dep: DepNode };

function Legend({ theme }: { theme: ErdTheme }) {
  const futuristic = theme === 'futuristic';
  return (
    <div
      className={clsx(
        'absolute top-2.5 right-2.5 z-10 rounded-[8px] shadow-cardHover px-3 py-2 flex flex-col gap-1.5',
        futuristic ? 'bg-[#141b30]/95 text-white' : 'bg-surface/95 text-text',
      )}
    >
      <div className="flex items-center gap-2 text-2xs">
        <span className="w-5 border-t-[2.5px]" style={{ borderColor: futuristic ? FUTURISTIC_RED : 'var(--red)' }} />
        Mandatory dependency
      </div>
      <div className="flex items-center gap-2 text-2xs">
        <span className="w-5 border-t-[2.5px] border-dashed" style={{ borderColor: futuristic ? FUTURISTIC_CYAN : '#9aa4b2' }} />
        Optional dependency
      </div>
    </div>
  );
}

function ThemeToggle({ theme, onChange }: { theme: ErdTheme; onChange: (t: ErdTheme) => void }) {
  const futuristic = theme === 'futuristic';
  return (
    <div className={clsx('absolute top-2.5 left-2.5 z-10 inline-flex rounded-[8px] overflow-hidden shadow-cardHover', futuristic ? 'bg-[#141b30]/95' : 'bg-surface/95')}>
      <button
        onClick={() => onChange('simple')}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-semibold',
          !futuristic ? 'bg-blue text-white' : futuristic ? 'text-white/60 hover:text-white' : 'text-muted hover:text-text',
        )}
      >
        <Sun size={12} /> Simple
      </button>
      <button
        onClick={() => onChange('futuristic')}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-semibold',
          futuristic ? 'bg-blue text-white' : 'text-muted hover:text-text',
        )}
      >
        <Sparkles size={12} /> Futuristic
      </button>
    </div>
  );
}

/** Star-shaped dependency graph (root + its direct prerequisites) laid out by hand rather than via
 * an automatic ranker — a fixed-column grid below the root (2 columns up to 10 dependencies, 3
 * columns beyond that), mandatory dependencies always filling the top row(s) first. Two visual
 * styles (Simple/Futuristic) are a local, per-browser preference via useErdTheme — same layout and
 * interactions either way. Clicking the object's NAME opens its details; clicking anywhere else on
 * the box instead selects it and highlights its connection back to the root (dimming the rest) —
 * two distinct actions on the same card, so the name click stops propagation before it can also
 * trigger the box's select handler. Clicking empty canvas clears the selection. Remount the caller
 * with `key={object.id}` on navigation so the view always re-centers on the new root. */
export function DependencyDiagram({
  root, dependencies, onSelectObject,
}: {
  root: DiagramRoot; dependencies: ObjectPrerequisite[]; onSelectObject: (objectId: string) => void;
}) {
  const [theme, setTheme] = useErdTheme();
  const futuristic = theme === 'futuristic';
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const sorted = [...dependencies].sort((a, b) => Number(b.mandatory) - Number(a.mandatory));
    const maxCols = sorted.length > 10 ? 3 : 2;
    const cols = Math.min(maxCols, sorted.length || 1);
    const gridWidth = cols * NODE_WIDTH + (cols - 1) * COL_GAP;
    const rootX = gridWidth / 2 - NODE_WIDTH / 2;

    const depNodes: Node<DepNodeData>[] = sorted.map((d, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const isSelected = d.requiresObjectId === selectedId;
      return {
        id: d.requiresObjectId, type: 'dep',
        position: { x: col * (NODE_WIDTH + COL_GAP), y: NODE_HEIGHT + ROOT_TOP_GAP + row * (NODE_HEIGHT + ROW_GAP) },
        data: {
          ident: d.requiresIdent, description: d.requiresDescription, category: d.requiresCategory, component: d.requiresComponent,
          mandatory: d.mandatory, theme, selected: isSelected, dimmed: !!selectedId && !isSelected,
          onNavigate: () => onSelectObject(d.requiresObjectId),
        },
      };
    });

    const rootNode: Node<DepNodeData> = {
      id: 'root', type: 'dep', position: { x: rootX, y: 0 },
      data: { ident: root.objectId, description: root.description, category: root.category, component: root.component, isRoot: true, theme },
    };

    const depEdges: Edge[] = sorted.map((d) => {
      const isSelected = d.requiresObjectId === selectedId;
      const isOther = !!selectedId && !isSelected;
      const mandatoryColor = futuristic ? FUTURISTIC_RED : 'var(--red)';
      const optionalColor = futuristic ? FUTURISTIC_CYAN : '#9aa4b2';
      return {
        id: `root-${d.requiresObjectId}`, source: 'root', target: d.requiresObjectId,
        style: {
          stroke: d.mandatory ? mandatoryColor : optionalColor,
          strokeWidth: isSelected ? 3 : 1.5,
          strokeDasharray: d.mandatory ? undefined : '5,4',
          opacity: isOther ? 0.15 : 1,
          ...(futuristic ? { filter: `drop-shadow(0 0 ${isSelected ? 5 : 3}px ${d.mandatory ? FUTURISTIC_RED : FUTURISTIC_CYAN})` } : {}),
        },
      };
    });

    return { nodes: [rootNode, ...depNodes], edges: depEdges };
  }, [root, dependencies, onSelectObject, theme, futuristic, selectedId]);

  if (dependencies.length === 0) {
    return <EmptyState icon={<Package size={22} />} title="No prerequisite objects" description="This object has no dependencies to diagram." />;
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      <div
        className="relative flex-1 min-h-0 rounded-lg overflow-hidden"
        style={futuristic
          ? { backgroundImage: 'linear-gradient(135deg, #1e2a4a 0%, #261c47 55%, #1f2b52 100%)' }
          : { boxShadow: 'inset 0 0 0 1px var(--line)' }}
      >
        <ThemeToggle theme={theme} onChange={setTheme} />
        <Legend theme={theme} />
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false} nodesConnectable={false} zoomOnDoubleClick={false} proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => { if (node.id !== 'root') setSelectedId((id) => (id === node.id ? null : node.id)); }}
          onPaneClick={() => setSelectedId(null)}
        >
          <Background gap={16} color={futuristic ? 'rgba(255,255,255,0.08)' : '#e3e7ec'} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="flex items-center gap-1.5 text-2xs text-muted shrink-0">
        <MousePointerClick size={12} className="shrink-0" />
        Click the object name to open its details · Click the box to highlight its connection.
      </div>
    </div>
  );
}

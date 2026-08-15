import { Handle, Position, type NodeProps } from 'reactflow';
import { NODE_META, type EtlNodeType } from '../../types/entities';
import * as icons from 'lucide-react';

export interface EtlNodeCardData {
  name: string;
  type: EtlNodeType;
  detail?: string;                       // "DS_ECP_STG · 128,400 rows"
  runState?: 'running' | 'done' | 'error';
  onSelect: () => void;
  onOpen: () => void;                    // double-click: step in / mapping editor
}

const STATE_DOT = { running: '#e2a900', done: '#1e6bb8', error: '#da291c' } as const;

/** 200×60 icon-first node card. Register as nodeTypes={{ etl: EtlNodeCard }}. */
export function EtlNodeCard({ data, selected }: NodeProps<EtlNodeCardData>) {
  const meta = NODE_META[data.type];
  const Icon = (icons as any)[toPascal(meta.icon)] ?? icons.Box;
  const border = selected ? `2px solid ${meta.color}` : data.runState === 'running' ? '2px solid #e2a900' : '1px solid var(--line)';

  return (
    <div
      onDoubleClick={data.onOpen}
      style={{ width: 200, height: 60, boxSizing: 'border-box', border, borderRadius: 11, background: '#fff',
               boxShadow: selected ? '0 3px 12px rgba(15,23,42,.16)' : '0 1px 3px rgba(15,23,42,.08)' }}
      className="flex items-center gap-[9px] pl-2 pr-2.5 select-none"
    >
      <Handle type="target" position={Position.Left} style={{ width: 9, height: 9, background: '#fff', border: `2px solid ${meta.color}` }} />
      <div title={meta.label} className="flex-none grid place-items-center" style={{ width: 32, height: 32, borderRadius: 9, background: meta.color + '16' }}>
        <Icon size={15} color={meta.color} />
      </div>
      <button
        onPointerDown={(e) => e.stopPropagation()}   /* never start a drag from the label */
        onClick={data.onSelect}
        title="Open properties"
        className="min-w-0 flex-1 text-left cursor-pointer bg-transparent border-0 p-0"
      >
        <div className="font-mono font-bold text-sm2 truncate">{data.name}</div>
        <div className="text-muted text-2xs truncate">{meta.label}{data.detail ? ` · ${data.detail}` : ''}</div>
      </button>
      {data.runState && <span className="flex-none rounded-full" style={{ width: 6, height: 6, background: STATE_DOT[data.runState] }} />}
      <Handle type="source" position={Position.Right} style={{ width: 13, height: 13, background: '#fff', border: `2px solid ${meta.color}`, cursor: 'crosshair' }} />
    </div>
  );
}

const toPascal = (s: string) => s.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');

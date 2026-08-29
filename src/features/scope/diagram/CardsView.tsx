import { useMemo } from 'react';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { getLayerTheme, LAYER_BAND_TEXT } from '../../../lib/layerTheme';
import { VIEW_LIMITS, type GraphNode } from '../../../lib/scopeGraph';
import { EmptyState } from '../../../components/EmptyState';

/** The same layered graph, read rather than looked at.
 *
 * A canvas is the right answer for "how does this hang together" and the wrong one for "what is in
 * layer 3 and what does it need" — that question is a list, and reading it off a diagram means
 * panning and counting arrows. Cards keep the layer colouring so the two views stay recognisably
 * the same graph, and put the two numbers people actually chase (what it needs, what needs it) on
 * every object. */
export function CardsView({ nodes, onSelect }: {
  nodes: GraphNode[];
  onSelect?: (node: GraphNode) => void;
}) {
  const layers = useMemo(() => {
    const byLayer = new Map<number, GraphNode[]>();
    for (const n of nodes.slice(0, VIEW_LIMITS.cards)) {
      byLayer.set(n.layer, [...(byLayer.get(n.layer) ?? []), n]);
    }
    return [...byLayer.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([layer, items]) => [layer, [...items].sort((a, b) => a.ident.localeCompare(b.ident))] as const);
  }, [nodes]);

  if (nodes.length === 0) {
    return <EmptyState title="Nothing to show" description="No objects match the current filters." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {nodes.length > VIEW_LIMITS.cards && (
        <p className="text-2xs text-muted">
          Showing the first {VIEW_LIMITS.cards} of {nodes.length} objects. Filter by layer or component to narrow it.
        </p>
      )}
      {layers.map(([layer, items]) => {
        const theme = getLayerTheme(layer);
        return (
          <section key={layer}>
            <div
              className="rounded-t-[8px] px-3 py-1.5 text-2xs font-bold flex items-center gap-2"
              style={{ background: theme.band, color: LAYER_BAND_TEXT }}
            >
              <span>Layer {layer}</span>
              <span className="opacity-70 font-semibold">{items.length}</span>
              <span className="opacity-70 font-medium ml-auto">
                {layer === 0 ? 'Loads first' : `After layer ${layer - 1}`}
              </span>
            </div>
            <div
              className="grid gap-2 p-2 rounded-b-[8px]"
              style={{ boxShadow: `inset 0 0 0 1px ${theme.ink}33`, background: theme.wash, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}
            >
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={onSelect ? () => onSelect(n) : undefined}
                  disabled={!onSelect}
                  className="text-left rounded bg-surface border px-2.5 py-2 flex flex-col gap-1 enabled:hover:border-blue-mid transition-colors disabled:cursor-default"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-2xs font-mono font-bold truncate" style={{ color: theme.ink }}>{n.ident}</span>
                  </div>
                  <div className="text-2xs text-text leading-tight line-clamp-2">{n.name}</div>
                  <div className="flex items-center gap-3 text-2xs text-muted mt-auto pt-0.5">
                    <span className="flex items-center gap-1" title="Prerequisites in scope">
                      <ArrowDownToLine size={11} /> {n.requires.length}
                    </span>
                    <span className="flex items-center gap-1" title="In-scope objects that need this">
                      <ArrowUpFromLine size={11} /> {n.requiredBy.length}
                    </span>
                    {n.component && <span className="truncate ml-auto">{n.component}</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

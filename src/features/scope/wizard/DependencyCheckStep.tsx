import { useMemo, useState } from 'react';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Plus, RotateCcw, ShieldOff } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../../../components/Button';
import { Select } from '../../../components/Select';
import { Tag } from '../../../components/Tag';
import { EmptyState } from '../../../components/EmptyState';
import { getLayerTheme } from '../../../lib/layerTheme';
import type { GraphNode } from '../../../lib/scopeGraph';
import type { DependencyCheckRow } from '../../../lib/queries/scope';

const FILTERS = ['All', 'Missing', 'Waived', 'No dependency'] as const;
type Filter = typeof FILTERS[number];

export interface DependencyCheckHandlers {
  onAddToScope: (migrationObjectIds: string[]) => void;
  onWaive: (pairs: { objectId: string; requiresId: string }[]) => void;
  onUnwaive: (objectId: string, requiresId: string) => void;
}

/** Step 4 — every prerequisite of every in-scope object, grouped by the object that needs it.
 *
 * SAP publishes an object's predecessors against its own idents; this expands the scope against that
 * list. A missing mandatory prerequisite is a load that fails on the day, and it fails late — after
 * the extract, in the target system.
 *
 * Objects carry their LOAD STAGE badge here, not just in the sequence view. The stage is what the
 * dependency graph means: an object in L3 is three loads deep, and seeing that beside its gaps is
 * what tells you whether a missing prerequisite is urgent or merely untidy.
 *
 * Two ways out, and the step insists on one per gap: pull the prerequisite into scope, or waive it.
 * Waiving is per PAIR — an object with four gaps can have three covered elsewhere and one that is an
 * oversight, and a single reason on the object could never say that. */
export function DependencyCheckStep({
  rows, nodes, onAddToScope, onWaive, onUnwaive, busy,
}: DependencyCheckHandlers & {
  rows: DependencyCheckRow[];
  /** The in-scope objects as a layered graph — supplies each object's load stage. */
  nodes: GraphNode[];
  busy?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('All');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());

  /** One entry per in-scope object, whether or not it declares a prerequisite. An object with none
   * is not absent from this step — "nothing to check here" is a result, and hiding it makes the
   * totals disagree with the scope. */
  const groups = useMemo(() => {
    const byObject = new Map<string, DependencyCheckRow[]>();
    for (const r of rows) byObject.set(r.objectId, [...(byObject.get(r.objectId) ?? []), r]);

    const entries = nodes.map((n) => {
      const items = byObject.get(n.id) ?? [];
      const missing = items.filter((r) => r.status === 'Missing' && !r.waived);
      const waived = items.filter((r) => r.status === 'Missing' && r.waived);
      return {
        objectId: n.id,
        ident: n.ident,
        name: n.name,
        layer: n.layer,
        items,
        missing,
        waived,
      };
    });
    // Load stage first, then ident — the same order the sequence runs in, so the two read alike.
    return entries.sort((a, b) => a.layer - b.layer || a.ident.localeCompare(b.ident));
  }, [rows, nodes]);

  const totals = useMemo(() => ({
    stages: new Set(nodes.map((n) => n.layer)).size,
    objects: nodes.length,
    noDependency: groups.filter((g) => g.items.length === 0).length,
    missing: groups.reduce((n, g) => n + g.missing.length, 0),
    waived: groups.reduce((n, g) => n + g.waived.length, 0),
  }), [groups, nodes]);

  const shown = useMemo(() => groups.filter((g) => {
    if (filter === 'Missing') return g.missing.length > 0;
    if (filter === 'Waived') return g.waived.length > 0;
    if (filter === 'No dependency') return g.items.length === 0;
    return true;
  }), [groups, filter]);

  const allExpanded = shown.length > 0 && shown.every((g) => expanded.has(g.objectId));
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(shown.map((g) => g.objectId)));
  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /** Ticked prerequisite rows, keyed `object::requires` so the same prerequisite under two different
   * objects is two separate decisions — which it is. */
  const checkedPairs = useMemo(
    () => [...checked].map((k) => { const [objectId, requiresId] = k.split('::'); return { objectId, requiresId }; }),
    [checked],
  );
  const toggleCheck = (key: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (nodes.length === 0) {
    return (
      <EmptyState
        title="Nothing in scope yet"
        description="Confirm some objects in the mapping step and their prerequisites are checked here."
      />
    );
  }

  return (
    // An unbroken flex-1/min-h-0 chain from the wizard's body down to the list. Without it the
    // group list grows past the viewport and paints over the Back/Next footer instead of scrolling.
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap shrink-0">
        <Metric n={totals.stages} label="Load Stages" />
        <Metric n={totals.objects} label="Total Objects" />
        <Metric n={totals.noDependency} label="No Dependency" muted />
        <Metric n={totals.missing} label="Missing" tone={totals.missing > 0 ? 'danger' : undefined} />
        <Metric n={totals.waived} label="Waived" tone={totals.waived > 0 ? 'warn' : undefined} />

        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <Select size="sm" quiet={filter === 'All'} value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter">
            {FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
          <Button variant="quiet" size="sm" onClick={toggleAll}>
            {allExpanded ? <><ChevronsDownUp size={13} /> Collapse all</> : <><ChevronsUpDown size={13} /> Expand all</>}
          </Button>
          {/* Bulk actions act on the ticked rows only — never on "everything missing", which would
              waive gaps nobody has looked at. */}
          <Button
            variant="quiet" size="sm"
            disabled={busy || checkedPairs.length === 0}
            onClick={() => { onWaive(checkedPairs); setChecked(new Set()); }}
          >
            <ShieldOff size={13} /> Mark Waived{checkedPairs.length > 0 ? ` (${checkedPairs.length})` : ''}
          </Button>
          <Button
            variant="primary" size="sm"
            disabled={busy || checkedPairs.length === 0}
            onClick={() => { onAddToScope([...new Set(checkedPairs.map((p) => p.requiresId))]); setChecked(new Set()); }}
          >
            <Plus size={13} /> Add to Scope
          </Button>
          {checked.size > 0 && (
            <button
              type="button" onClick={() => setChecked(new Set())}
              title="Clear selection" aria-label="Clear selection"
              className="w-7 h-7 grid place-items-center rounded text-muted hover:bg-surface-2 hover:text-text"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--line)] divide-y divide-line-soft flex-1 min-h-0 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="text-sm2 text-muted py-10 text-center">Nothing matches this filter.</p>
        ) : shown.map((g) => {
          const theme = getLayerTheme(g.layer);
          const open = expanded.has(g.objectId);
          return (
            <div key={g.objectId}>
              <button
                type="button"
                onClick={() => toggle(g.objectId)}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-blue-pale/40"
              >
                <span
                  className="text-2xs font-bold rounded-pill px-2 py-0.5 shrink-0 tabular-nums"
                  style={{ background: theme.wash, color: theme.ink }}
                  title={`Load stage ${g.layer}`}
                >
                  L{g.layer}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm2 font-bold text-text truncate">{g.name}</span>
                  <span className="block text-2xs text-muted">
                    <span className="font-mono">{g.ident}</span>
                    {' · '}
                    {/* "0 prerequisites missing" is a double negative for the common, healthy case.
                        Say what IS true instead, and save the count for the gaps. */}
                    {g.items.length === 0
                      ? 'No prerequisites'
                      : g.missing.length === 0
                        ? `All ${g.items.length} prerequisite${g.items.length === 1 ? '' : 's'} in scope`
                        : `${g.missing.length} of ${g.items.length} prerequisite${g.items.length === 1 ? '' : 's'} missing`}
                    {g.waived.length > 0 && ` · ${g.waived.length} waived`}
                  </span>
                </span>
                {g.missing.length > 0 && <Tag variant="danger" size="sm" className="shrink-0">{g.missing.length}</Tag>}
                <ChevronDown
                  size={15}
                  className={clsx('text-muted shrink-0 transition-transform', open && 'rotate-180')}
                />
              </button>

              {open && (
                <div className="bg-surface-2/40 border-t border-line-soft">
                  {g.items.length === 0 ? (
                    <p className="text-2xs text-muted px-3.5 py-2 pl-12">
                      This object declares no prerequisites in the SAP catalogue.
                    </p>
                  ) : g.items.map((r) => {
                    const key = `${r.objectId}::${r.requiresId}`;
                    const gap = r.status === 'Missing' && !r.waived;
                    return (
                      <div key={key} className="flex items-center gap-2.5 px-3.5 py-1.5 pl-12 border-b border-line-soft last:border-b-0">
                        {gap ? (
                          <input
                            type="checkbox" checked={checked.has(key)} onChange={() => toggleCheck(key)}
                            className="w-3.5 h-3.5 accent-[var(--blue)] shrink-0"
                            aria-label={`Select ${r.requiresIdent}`}
                          />
                        ) : <span className="w-3.5 shrink-0" />}

                        <span className="text-sm2 text-text truncate flex-1 min-w-0">
                          {r.requiresName ?? r.requiresIdent}
                          <span className="text-2xs text-muted font-mono ml-1.5">{r.requiresIdent}</span>
                        </span>

                        {!r.mandatory && <span className="text-2xs text-muted shrink-0">optional</span>}

                        {r.status === 'In scope' ? (
                          <Tag variant="accent" size="sm" className="shrink-0">In Scope</Tag>
                        ) : r.waived ? (
                          <>
                            <Tag variant="warn" size="sm" className="shrink-0" title={r.waivedReason ?? undefined}>Waived</Tag>
                            <Button variant="quiet" size="sm" disabled={busy} onClick={() => onUnwaive(r.objectId, r.requiresId)}>
                              Un-waive
                            </Button>
                          </>
                        ) : (
                          <>
                            <Tag variant="danger" size="sm" className="shrink-0">Missing in Scope</Tag>
                            <Button variant="quiet" size="sm" disabled={busy} onClick={() => onWaive([{ objectId: r.objectId, requiresId: r.requiresId }])}>
                              Mark Waived
                            </Button>
                            <Button variant="quiet" size="sm" disabled={busy} onClick={() => onAddToScope([r.requiresId])}>
                              Add to Scope
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-2xs text-muted shrink-0">
        A missing prerequisite is a load that fails after the extract, in the target system. Pull it
        into scope, or waive it — a waiver travels with the scope into cutover planning, so the gap
        stays visible rather than becoming silence.
      </p>
    </div>
  );
}

function Metric({ n, label, tone, muted }: {
  n: number; label: string; tone?: 'danger' | 'warn'; muted?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={clsx(
        'text-md font-bold tabular-nums',
        tone === 'danger' ? 'text-red' : tone === 'warn' ? 'text-amber-ink' : muted ? 'text-muted' : 'text-text',
      )}>
        {n}
      </span>
      <span className="text-2xs text-muted">{label}</span>
    </span>
  );
}

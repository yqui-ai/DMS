import { useMemo, useState } from 'react';
import { Check, CheckCircle2, Copy, Link2Off, Undo2 } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../../../components/Button';
import { Tag } from '../../../components/Tag';
import { Toolbar } from '../../../components/Toolbar';
import { EmptyState } from '../../../components/EmptyState';
import { useToast } from '../../../components/Toast';
import {
  isSettled, useScopeCandidateMutations, type ScopeCandidate,
} from '../../../lib/queries/scopeCandidates';
import type { MigrationObject } from '../../../types/entities';
import { ObjectPicker } from './ObjectPicker';

const FILTERS = ['To map', 'Confirmed', 'Custom', 'All'] as const;
type Filter = typeof FILTERS[number];

/** Step 3 — tie every object to an SAP standard migration object.
 *
 * This is not paperwork. SAP publishes an object's prerequisites against its own idents, so until a
 * row is mapped the app cannot say what it depends on, what has to load before it, or which Golden
 * FMD applies. An unmapped row is not a scope entry yet; it is a name.
 *
 * Objects picked from the catalogue arrive already mapped — the mapping is itself — so for those
 * this step is a confirmation. Objects from an uploaded list arrive with a suggestion at best.
 *
 * Custom objects are parked, not mapped. They have no SAP equivalent by definition, and forcing one
 * into the catalogue produces a wrong answer rather than no answer. */
export function MappingStep({ objects, candidates, subprojectId }: {
  objects: MigrationObject[];
  candidates: ScopeCandidate[];
  subprojectId: string;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('To map');
  const { update, confirm, unconfirm } = useScopeCandidateMutations(subprojectId);

  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const inScope = useMemo(() => candidates.filter((c) => c.inScope), [candidates]);

  const counts = useMemo(() => ({
    'To map': inScope.filter((c) => !c.custom && !c.confirmedAt).length,
    Confirmed: inScope.filter((c) => !c.custom && !!c.confirmedAt).length,
    Custom: inScope.filter((c) => c.custom).length,
    All: inScope.length,
  }), [inScope]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScope.filter((c) => {
      if (q && !(
        c.sourceIdent.toLowerCase().includes(q)
        || (c.sourceName ?? '').toLowerCase().includes(q)
        || (byId.get(c.mappedObjectId ?? '')?.objectId ?? '').toLowerCase().includes(q)
      )) return false;
      if (filter === 'To map') return !c.custom && !c.confirmedAt;
      if (filter === 'Confirmed') return !c.custom && !!c.confirmedAt;
      if (filter === 'Custom') return c.custom;
      return true;
    });
  }, [inScope, query, filter, byId]);

  /** Source idents sharing one SAP object. Confirming both upserts a single scope row, so without
   * this the list says N objects while N-1 actually load — and nothing on screen explains the gap. */
  const duplicates = useMemo(() => {
    const byObject = new Map<string, string[]>();
    for (const c of inScope) {
      if (!c.mappedObjectId || c.custom) continue;
      byObject.set(c.mappedObjectId, [...(byObject.get(c.mappedObjectId) ?? []), c.sourceIdent]);
    }
    const out = new Map<string, string>();
    for (const [, idents] of byObject) {
      if (idents.length < 2) continue;
      for (const ident of idents) {
        const others = idents.filter((i) => i !== ident);
        out.set(ident, others.length === 1 ? others[0] : `${others.length} other rows`);
      }
    }
    return out;
  }, [inScope]);

  /** Mapped but not yet agreed to — the rows a bulk confirm would actually act on. */
  const readyToConfirm = shown.filter((c) => !c.custom && !c.confirmedAt && c.mappedObjectId);
  const outstanding = inScope.filter((c) => !isSettled(c)).length;

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    try { await fn(); toast.success(ok); } catch (err: any) { toast.error(err?.message ?? fail); }
  };

  if (inScope.length === 0) {
    return (
      <EmptyState
        title="Nothing to map"
        description="Go back and import a list or pick from the SAP catalogue first."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'flex items-baseline gap-1.5 rounded px-3 py-1.5 border transition-colors',
              filter === f ? 'border-blue bg-blue-pale' : 'border-line hover:border-line-strong bg-surface',
            )}
          >
            <span className="text-md font-bold tabular-nums text-text">{counts[f]}</span>
            <span className="text-2xs text-muted">{f}</span>
          </button>
        ))}
        {outstanding === 0 ? (
          <span className="text-2xs text-green flex items-center gap-1.5 ml-auto">
            <CheckCircle2 size={13} /> Every object is mapped and confirmed
          </span>
        ) : (
          <span className="text-2xs text-amber-ink ml-auto">
            {outstanding} object{outstanding === 1 ? '' : 's'} still to confirm before the next step
          </span>
        )}
      </div>

      <div className="shrink-0">
      <Toolbar
        spacing="none"
        search={{ value: query, onChange: setQuery, placeholder: 'Search your objects or SAP idents…' }}
        count={shown.length} noun="objects"
        actions={
          readyToConfirm.length > 0 ? (
            <Button
              variant="primary" size="sm" disabled={confirm.isPending}
              onClick={() => run(
                () => confirm.mutateAsync(readyToConfirm),
                `${readyToConfirm.length} object${readyToConfirm.length === 1 ? '' : 's'} confirmed.`,
                'Could not confirm.',
              )}
            >
              <Check size={14} /> Confirm {readyToConfirm.length} mapped
            </Button>
          ) : undefined
        }
      />
      </div>

      {/* Height comes from the flex chain, not a vh guess: a `max-h-[54vh]` cap is right on one
          monitor and leaves dead space or an overlapped footer on every other. */}
      <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] bg-surface flex-1 min-h-0 overflow-y-auto divide-y divide-line-soft">
        {shown.length === 0 ? (
          <p className="text-sm2 text-muted py-10 text-center">Nothing in this view.</p>
        ) : shown.map((c) => (
          <Row
            key={c.id}
            candidate={c}
            objects={objects}
            mapped={c.mappedObjectId ? byId.get(c.mappedObjectId) : undefined}
            duplicate={duplicates.get(c.sourceIdent)}
            busy={update.isPending || confirm.isPending || unconfirm.isPending}
            onMap={(objectId) => run(
              () => update.mutateAsync({ id: c.id, mappedObjectId: objectId || null }),
              objectId ? 'Mapped.' : 'Mapping cleared.',
              'Could not save the mapping.',
            )}
            onCustom={(custom) => run(
              () => update.mutateAsync({ id: c.id, custom, mappedObjectId: custom ? null : undefined }),
              custom ? 'Parked as a custom object.' : 'No longer custom.',
              'Could not update.',
            )}
            onConfirm={() => run(() => confirm.mutateAsync([c]), 'Confirmed.', 'Could not confirm.')}
            onUnconfirm={() => run(() => unconfirm.mutateAsync(c), 'Re-opened for mapping.', 'Could not re-open.')}
          />
        ))}
      </div>

      <p className="text-2xs text-muted shrink-0">
        Mapping is what makes dependencies knowable — SAP publishes them against its own idents, so
        an unmapped object has no prerequisites the app can find. Custom objects carry none by
        definition and are parked here rather than forced into the catalogue.
      </p>
    </div>
  );
}

function Row({ candidate: c, objects, mapped, duplicate, busy, onMap, onCustom, onConfirm, onUnconfirm }: {
  candidate: ScopeCandidate;
  objects: MigrationObject[];
  mapped?: MigrationObject;
  /** The other source ident mapping to the same SAP object, when there is one. */
  duplicate?: string;
  busy: boolean;
  onMap: (objectId: string) => void;
  onCustom: (custom: boolean) => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
}) {
  const confirmed = !!c.confirmedAt;

  return (
    <div className={clsx('flex items-center gap-3 px-3.5 py-2', confirmed && 'bg-green-bg/30')}>
      {/* What they call it — never overwritten by the mapping, because their list is the thing
          they will keep recognising it by. */}
      <div className="w-[240px] shrink-0 min-w-0">
        <div className="text-sm2 font-mono font-bold text-blue-deep truncate">{c.sourceIdent}</div>
        {c.sourceName && <div className="text-2xs text-muted truncate">{c.sourceName}</div>}
      </div>

      {c.custom ? (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Tag variant="warn" size="sm">Custom</Tag>
          <span className="text-2xs text-muted truncate">
            Parked — no SAP equivalent, so it carries no dependencies.
          </span>
        </div>
      ) : (
        <>
          <span className="text-muted shrink-0" aria-hidden>→</span>
          <ObjectPicker
            objects={objects}
            value={c.mappedObjectId}
            disabled={busy || confirmed}
            onChange={(objectId) => onMap(objectId ?? '')}
            label={`SAP object for ${c.sourceIdent}`}
          />
          {/* Two source rows pointing at one SAP object is almost always an import artefact — a
              plant-split list, or the same object under two local names. It is legal, but it means
              the scope has fewer objects than the list suggests, so it is said out loud rather than
              silently collapsed by the upsert at confirm time. */}
          {duplicate && (
            <span className="text-2xs text-amber-ink flex items-center gap-1 shrink-0" title="Another row in this list maps to the same SAP object">
              <Copy size={11} /> Also mapped by {duplicate}
            </span>
          )}
          {c.origin === 'standard' && !confirmed && !duplicate && (
            <Tag variant="accent" size="sm" className="shrink-0">From catalogue</Tag>
          )}
        </>
      )}

      <div className="flex items-center gap-1.5 shrink-0 w-[190px] justify-end">
        {confirmed ? (
          <>
            <span className="text-2xs text-green font-semibold flex items-center gap-1">
              <CheckCircle2 size={12} /> Confirmed
            </span>
            <Button variant="quiet" size="sm" disabled={busy} onClick={onUnconfirm} title="Re-open this mapping">
              <Undo2 size={12} />
            </Button>
          </>
        ) : c.custom ? (
          <Button variant="quiet" size="sm" disabled={busy} onClick={() => onCustom(false)}>
            Not custom
          </Button>
        ) : (
          <>
            <Button
              variant="quiet" size="sm" disabled={busy} onClick={() => onCustom(true)}
              title="No SAP equivalent — park it for now"
            >
              <Link2Off size={12} /> Custom
            </Button>
            <Button variant="primary" size="sm" disabled={busy || !c.mappedObjectId} onClick={onConfirm}>
              Confirm
            </Button>
          </>
        )}
      </div>

      {mapped?.category && !c.custom && (
        <span className="text-2xs text-muted shrink-0 w-[110px] truncate text-right">{mapped.category}</span>
      )}
    </div>
  );
}

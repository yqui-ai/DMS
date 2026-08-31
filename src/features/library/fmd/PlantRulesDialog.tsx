import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../../components/Dialog';
import { Button } from '../../../components/Button';
import { Tag } from '../../../components/Tag';
import { useToast } from '../../../components/Toast';
import { fmtDateTime } from '../../../lib/format';
import { useFmdPlantRuleMutations, type FmdPlantRule } from '../../../lib/queries/fmdPlantRules';
import type { Plant } from '../../../lib/queries/plants';

/** Which plants differ, and how, for one mapping row.
 *
 * A subproject can cover several plants, and a LOCAL field is local precisely because its handling
 * differs between them — the same target column filled from a different source in one plant than in
 * another. The FMD carries one rule per row, so without this the difference lived in a comment or in
 * somebody's head.
 *
 * The row's own rule is shown at the top as the BASELINE, and each plant either inherits it or
 * overrides it. That framing matters: the common case is that most plants agree, and a screen that
 * asked you to fill in a rule per plant would make the exceptional look routine and quietly invite
 * six copies of the same sentence.
 *
 * Clearing an override is a delete, never blank fields. An empty rule is a real value meaning "this
 * plant maps nothing here"; falling back to the baseline is a different statement, and storing one
 * to mean the other would be unrecoverable. */
export function PlantRulesDialog({ open, fmdId, structureId, structureIdent, rowKey, rowLabel, baseTransformation, baseTechnical, plants, rules, canEdit, onClose }: {
  open: boolean;
  fmdId: string;
  structureId: string;
  structureIdent?: string;
  rowKey: string;
  rowLabel: string;
  /** The row's own rules — what a plant inherits unless it overrides. */
  baseTransformation?: string;
  baseTechnical?: string;
  /** The plants this FMD's subproject covers. */
  plants: Plant[];
  /** Every per-plant rule on this FMD; filtered to this row here. */
  rules: FmdPlantRule[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const { save, clear } = useFmdPlantRuleMutations(fmdId);
  const [busyPlant, setBusyPlant] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { transformationRule: string; technicalRule: string; note: string }>>({});

  const forRow = useMemo(
    () => rules.filter((r) => r.structureId === structureId && r.rowKey === rowKey),
    [rules, structureId, rowKey],
  );
  const byPlant = useMemo(() => new Map(forRow.map((r) => [r.plantId, r])), [forRow]);

  // Reseeded each open: the dialog may be reopened on a different row, and stale drafts would show
  // one row's overrides under another row's name.
  useEffect(() => {
    if (!open) return;
    const next: typeof drafts = {};
    for (const p of plants) {
      const existing = byPlant.get(p.id);
      next[p.id] = {
        transformationRule: existing?.transformationRule ?? '',
        technicalRule: existing?.technicalRule ?? '',
        note: existing?.note ?? '',
      };
    }
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rowKey, structureId, plants.length, forRow.length]);

  const run = async (plantId: string, fn: () => Promise<void>, failure: string) => {
    setBusyPlant(plantId);
    try { await fn(); } catch (err: any) { toast.error(err.message ?? failure); } finally { setBusyPlant(null); }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rules by plant"
      subtitle={[structureIdent, rowLabel].filter(Boolean).join('  ·  ')}
      size="lg"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col gap-4">
        {/* The baseline first. Every plant below is read as a difference from this, and without it
            on screen there is nothing for "override" to mean. */}
        <div className="rounded-lg bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)] px-3.5 py-3">
          <div className="text-2xs font-bold uppercase tracking-[.05em] text-muted mb-2">
            The row's rule — what every plant uses unless it overrides
          </div>
          <div className="flex flex-col gap-1.5">
            <Baseline label="Transformation" value={baseTransformation} />
            <Baseline label="Technical" value={baseTechnical} />
          </div>
        </div>

        {plants.length === 0 ? (
          <p className="text-sm2 text-muted py-8 text-center">
            No plants are assigned to this FMD's subproject, so there is nothing to differ between.
            Assign plants on the subproject first.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {plants.map((p) => {
              const existing = byPlant.get(p.id);
              const draft = drafts[p.id] ?? { transformationRule: '', technicalRule: '', note: '' };
              const dirty = !!existing
                ? draft.transformationRule !== (existing.transformationRule ?? '')
                  || draft.technicalRule !== (existing.technicalRule ?? '')
                  || draft.note !== (existing.note ?? '')
                : !!(draft.transformationRule || draft.technicalRule || draft.note);
              const busy = busyPlant === p.id;

              return (
                <div
                  key={p.id}
                  className={clsx(
                    'rounded-lg px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--line)]',
                    existing ? 'bg-amber-bg/40' : 'bg-surface',
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-sm2 font-bold">{p.code}</span>
                    <span className="text-sm2 text-muted truncate">{p.name}</span>
                    {existing
                      ? <Tag variant="warn" size="sm">Overrides</Tag>
                      : <Tag variant="neutral" size="sm">Uses the row's rule</Tag>}
                    <span className="ml-auto flex items-center gap-1.5 shrink-0">
                      {existing && canEdit && (
                        <Button
                          variant="quiet" size="sm" disabled={busy}
                          title="Remove this override so the plant falls back to the row's rule"
                          onClick={() => run(p.id, () => clear(structureId, rowKey, p.id), 'Could not clear the override.')}
                        >
                          <RotateCcw size={12} /> Use the row's rule
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          size="sm" disabled={busy || !dirty}
                          onClick={() => run(p.id, () => save(structureId, rowKey, p.id, draft), 'Could not save the override.')}
                        >
                          {busy ? 'Saving…' : 'Save'}
                        </Button>
                      )}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <PlantField
                      label="Transformation rule" placeholder={baseTransformation || 'Same as the row'}
                      value={draft.transformationRule} disabled={!canEdit}
                      onChange={(v) => setDrafts((d) => ({ ...d, [p.id]: { ...draft, transformationRule: v } }))}
                    />
                    <PlantField
                      label="Technical rule" placeholder={baseTechnical || 'Same as the row'} mono
                      value={draft.technicalRule} disabled={!canEdit}
                      onChange={(v) => setDrafts((d) => ({ ...d, [p.id]: { ...draft, technicalRule: v } }))}
                    />
                  </div>
                  <div className="mt-2">
                    <PlantField
                      label="Why it differs" placeholder="Optional — the reason, for whoever reads this next"
                      value={draft.note} disabled={!canEdit}
                      onChange={(v) => setDrafts((d) => ({ ...d, [p.id]: { ...draft, note: v } }))}
                    />
                  </div>

                  {existing?.changedAt && (
                    <p className="text-2xs text-muted mt-1.5">
                      Last changed by {existing.changedBy ?? existing.createdBy} · {fmtDateTime(existing.changedAt)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-2xs text-muted border-t border-line pt-3">
          Overrides are attached to the mapping row itself, not to a version, so they survive
          regeneration and a sync to a newer Golden template. They are not part of the FMD's own
          rules — the row's rule stays what an ETL developer builds by default.
        </p>
      </div>
    </Dialog>
  );
}

function Baseline({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2.5 text-sm2">
      <span className="w-[100px] shrink-0 text-2xs text-muted pt-[3px]">{label}</span>
      <span className={clsx('min-w-0 flex-1 break-words', !value && 'text-muted italic')}>
        {value || 'Not set on this row'}
      </span>
    </div>
  );
}

function PlantField({ label, value, placeholder, onChange, disabled, mono }: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-2xs text-muted">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className={clsx(
          'w-full text-sm2 bg-surface border border-line-strong rounded px-2 py-1.5 resize-y',
          'focus-visible:outline-none focus-visible:border-blue-mid focus-visible:ring-4 focus-visible:ring-blue-light',
          'disabled:opacity-60 placeholder:text-muted',
          mono && 'font-mono',
        )}
      />
    </label>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import { Button } from '../../../components/Button';
import { Field, Input } from '../../../components/Field';
import { Select } from '../../../components/Select';
import { Segmented } from '../../../components/Segmented';
import { useToast } from '../../../components/Toast';
import { normaliseStructureFieldName } from '../../../lib/structureFieldName';
import { rowKey } from '../../../lib/rowDiff';
import { useAddFmdContent } from '../../../lib/queries/fmds';
import type { GeneratedTable } from '../../../types/entities';

type Mode = 'row' | 'structure';

/** Adds something the Golden template never gave this FMD.
 *
 * Two shapes, because they are genuinely different things:
 *  · **Row** — a new mapping line in one structure, for a field the sender structure did not
 *    declare.
 *  · **Structure** — a new tab, for a sender structure this object turned out to also send.
 *
 * **Adding a COLUMN is deliberately not here.** A column is part of what an FMD IS, and every FMD in
 * the programme is generated from one template — so a column added to a single document would make
 * that document a different shape from its siblings, and no export, diff or review would agree on
 * what an FMD contains. Columns are added in the Golden FMD designer, where the change reaches every
 * document that follows it.
 *
 * Whatever is added is marked `FIELD_TYPE: Custom`, which is what lets a reader tell the template's
 * columns from this document's own — and why FIELD_TYPE is in the Golden baseline rather than being
 * invented here.
 *
 * Every one of these produces a real draft VERSION rather than a pending change: pending changes are
 * cell edits and cannot express "a row appeared". Saying so on the dialog matters, because it is the
 * difference between an edit you can un-tick at publish and one you cannot. */
export function AddFmdContentDialog({ open, fmdId, tables, standardTables, activeStructureId, onClose, onAdded }: {
  open: boolean;
  fmdId: string;
  tables: GeneratedTable[];
  /** The object's STANDARD FMD tables, for restoring a predefined field. Undefined when the object
   * has no Standard FMD to draw from. */
  standardTables?: GeneratedTable[];
  /** The structure the grid is showing — what a new row defaults to. */
  activeStructureId?: string;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const toast = useToast();
  const { addRow, addStructure } = useAddFmdContent(fmdId);

  const [mode, setMode] = useState<Mode>('row');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [structureId, setStructureId] = useState('');
  /** Which predefined field to restore, by rowKey. Empty means a blank custom row. */
  const [seedKey, setSeedKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('row'); setName(''); setDescription('');
    setStructureId(activeStructureId ?? tables[0]?.structureId ?? '');
    setSeedKey('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeStructureId]);

  /** Fields the Standard FMD defines for the chosen structure that this document no longer has.
   *
   * Matched on the same content-based `rowKey` everything else uses — the SRC/TGT field pair —
   * rather than on position, because the two documents diverge in row order the moment either is
   * edited. Structures are matched by IDENT, not id: a Custom FMD and its Standard are separate
   * documents whose structure ids do not correspond. */
  const restorable = useMemo(() => {
    if (!standardTables?.length) return [];
    const mine = tables.find((t) => t.structureId === structureId);
    if (!mine) return [];
    const standard = standardTables.find((t) => t.structureIdent === mine.structureIdent);
    if (!standard) return [];
    const present = new Set(mine.rows.map((r, i) => rowKey(r, i)));
    return standard.rows
      .map((r, i) => ({ key: rowKey(r, i), row: r }))
      .filter((x) => !present.has(x.key))
      .map((x) => ({
        ...x,
        label: [x.row.SRC_FIELD, x.row.TGT_FIELD].filter(Boolean).join(' → ') || x.key,
      }));
  }, [standardTables, tables, structureId]);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'structure') {
        await addStructure(name, description);
        toast.success(`Structure ${normaliseStructureFieldName(name)} added.`);
      } else {
        const seed = restorable.find((r) => r.key === seedKey)?.row;
        await addRow(structureId, seed);
        toast.success(seed ? 'Field restored from the Standard FMD.' : 'Row added. Fill it in on the grid.');
      }
      onAdded?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Could not add that.');
    } finally {
      setBusy(false);
    }
  };

  const needsName = mode !== 'row';
  const canSubmit = !busy && (needsName ? name.trim().length > 0 : !!structureId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add to this FMD"
      subtitle="Something the Golden template does not define — marked Custom so it stays distinguishable."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          value={mode}
          onChange={(v) => { setMode(v); setName(''); }}
          options={[
            { value: 'row' as const, label: 'Row', title: 'A new mapping line in one structure' },
            { value: 'structure' as const, label: 'Structure', title: 'A new sender structure — a new tab in the grid' },
          ]}
        />

        {mode === 'row' && (
          <>
            <Field label="Structure" hint="The new row is added at the end.">
              <Select value={structureId} onChange={(e) => { setStructureId(e.target.value); setSeedKey(''); }} className="w-full" mono>
                {tables.map((t) => (
                  <option key={t.structureId} value={t.structureId}>
                    {t.structureIdent}{t.structureDescription ? ` — ${t.structureDescription}` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Restoring a predefined field, rather than retyping it.
                Removing a field the wave does not migrate is normal, and so is changing your mind.
                Retyping SRC_FIELD, its description, data type and length from memory is tedious and
                is exactly how a Custom FMD drifts from the standard it was generated from — so the
                fields the Standard FMD defines and this document no longer has are offered by
                name. Only the missing ones: a field already present is not something to add twice. */}
            <Field
              label="Field"
              hint={restorable.length > 0
                ? 'Restore a field from the object’s Standard FMD with its details filled in, or start a blank custom one.'
                : 'A blank row, for a field the Standard FMD does not define.'}
            >
              <Select value={seedKey} onChange={(e) => setSeedKey(e.target.value)} className="w-full" mono>
                <option value="">Blank custom field</option>
                {restorable.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </Select>
            </Field>
          </>
        )}

        {mode === 'structure' && (
          <>
            <Field label="Structure name" hint="ALL CAPS, no spaces — the grid tab and the export sheet name.">
              <Input
                value={name}
                onChange={(e) => setName(normaliseStructureFieldName(e.target.value))}
                placeholder="S_BNKA_LOCAL"
                className="font-mono"
                autoFocus
              />
            </Field>
            <Field label="Description" hint="What this structure sends. Optional, but it is what the tab can show instead of the ident.">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </Field>
          </>
        )}

        {/* Said before the click, not discovered after it. Adding changes the document's shape, and
            that cannot be expressed as a pending change you un-tick at publish — it is a version. */}
        <p className="text-2xs text-muted border-t border-line pt-3">
          This creates a <span className="font-semibold text-text">draft version</span> rather than a
          pending change. Changing a value can be published selectively; changing the document's
          shape cannot, so it is released as a whole. Any edits you already have pending are folded
          into the same draft.
        </p>
      </div>
    </Dialog>
  );
}

import { useEffect, useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import { Button } from '../../../components/Button';
import { Field, Input } from '../../../components/Field';
import { Select } from '../../../components/Select';
import { Segmented } from '../../../components/Segmented';
import { useToast } from '../../../components/Toast';
import { normaliseStructureFieldName } from '../../../lib/structureFieldName';
import { useAddFmdContent } from '../../../lib/queries/fmds';
import type { GeneratedColumn, GeneratedTable } from '../../../types/entities';

type Mode = 'field' | 'row' | 'structure';

/** Adds something the Golden template never gave this FMD.
 *
 * Three shapes of "custom", because they are genuinely different things and folding them into one
 * button would make the common one ambiguous:
 *  · **Field** — a new COLUMN, added to every structure. The document's columns are one shared list,
 *    so a column present in one tab and absent from another is not a narrower document, it is one
 *    whose other tabs show blanks under a header.
 *  · **Row** — a new mapping line in one structure, for a field the sender structure did not
 *    declare.
 *  · **Structure** — a new tab, for a sender structure this object turned out to also send.
 *
 * Whatever is added is marked `FIELD_TYPE: Custom`, which is what lets a reader tell the template's
 * columns from this document's own — and why FIELD_TYPE is in the Golden baseline rather than being
 * invented here.
 *
 * Every one of these produces a real draft VERSION rather than a pending change: pending changes are
 * cell edits and cannot express "a row appeared". Saying so on the dialog matters, because it is the
 * difference between an edit you can un-tick at publish and one you cannot. */
export function AddFmdContentDialog({ open, fmdId, columns, tables, activeStructureId, onClose, onAdded }: {
  open: boolean;
  fmdId: string;
  columns: GeneratedColumn[];
  tables: GeneratedTable[];
  /** The structure the grid is showing — what a new row defaults to. */
  activeStructureId?: string;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const toast = useToast();
  const { addField, addRow, addStructure } = useAddFmdContent(fmdId);

  const [mode, setMode] = useState<Mode>('field');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [structureId, setStructureId] = useState('');
  const [busy, setBusy] = useState(false);

  const sections = [...new Set(columns.map((c) => c.sectionName))];

  useEffect(() => {
    if (!open) return;
    setMode('field'); setName(''); setDescription('');
    setSectionName(sections[sections.length - 1] ?? '');
    setStructureId(activeStructureId ?? tables[0]?.structureId ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeStructureId]);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'field') {
        await addField(name, { description: description.trim() || undefined, sectionName });
        toast.success(`${normaliseStructureFieldName(name)} added to every structure.`);
      } else if (mode === 'structure') {
        await addStructure(name, description);
        toast.success(`Structure ${normaliseStructureFieldName(name)} added.`);
      } else {
        await addRow(structureId);
        toast.success('Row added. Fill it in on the grid.');
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
            { value: 'field' as const, label: 'Field', title: 'A new column, added to every structure in this FMD' },
            { value: 'row' as const, label: 'Row', title: 'A new mapping line in one structure' },
            { value: 'structure' as const, label: 'Structure', title: 'A new sender structure — a new tab in the grid' },
          ]}
        />

        {mode === 'field' && (
          <>
            <Field label="Field name" hint="ALL CAPS, no spaces — what you type is converted automatically.">
              <Input
                value={name}
                onChange={(e) => setName(normaliseStructureFieldName(e.target.value))}
                placeholder="LOCAL_PRICING_GROUP"
                className="font-mono"
                autoFocus
              />
            </Field>
            <Field label="Description" hint="What the column is for. Shown to whoever has to fill it in.">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Section" hint="Which coloured band it appears under in the grid and the export.">
              <Select value={sectionName} onChange={(e) => setSectionName(e.target.value)} className="w-full">
                {sections.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </>
        )}

        {mode === 'row' && (
          <Field label="Structure" hint="The new row is added at the end, with every column blank.">
            <Select value={structureId} onChange={(e) => setStructureId(e.target.value)} className="w-full" mono>
              {tables.map((t) => (
                <option key={t.structureId} value={t.structureId}>
                  {t.structureIdent}{t.structureDescription ? ` — ${t.structureDescription}` : ''}
                </option>
              ))}
            </Select>
          </Field>
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

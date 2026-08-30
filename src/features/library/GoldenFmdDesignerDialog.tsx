import { Select } from '../../components/Select';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { parseValueList } from '../../lib/mappingRulePolicy';
import { useEffect, useState } from 'react';
import { AlertTriangle, GripVertical, Lock, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useLatestFmdVersion, useGoldenFmdMutations, type LibraryFmdRow } from '../../lib/queries/fmds';
import { SECTION_COLORS, colorByKey, nextColor } from '../../lib/goldenFmdColors';
import { isRequiredGoldenField, missingRequiredGoldenFields, withMissingBaselineFields } from '../../lib/goldenFmdRequiredFields';
import type { GoldenFmdStructure } from '../../types/entities';

export const GOLDEN_FMD_NAME = 'Golden_Field_Mapping_Document_Template';

const newId = () => crypto.randomUUID();

/** The Golden FMD's starting structure — the template's field list, not data. */
const defaultStructure = (): GoldenFmdStructure => ({
  sections: [
    {
      id: newId(), name: 'Source Section', color: 'blue',
      fields: [
        { id: newId(), field: 'SRC_SYSTEM', description: '' },
        { id: newId(), field: 'SRC_TABLE', description: '' },
        { id: newId(), field: 'SRC_FIELD', description: '' },
        { id: newId(), field: 'SRC_FIELD_DESC', description: '' },
        { id: newId(), field: 'SRC_FIELD_MANDATORY', description: 'Mandatory or Optional' },
        { id: newId(), field: 'SRC_FIELD_DATATYPE', description: '' },
        { id: newId(), field: 'SRC_FIELD_LENGTH', description: '' },
        { id: newId(), field: 'SRC_FIELD_DECIMAL', description: '' },
        { id: newId(), field: 'SRC_CHECK_TABLE', description: '' },
      ],
    },
    {
      id: newId(), name: 'Mapping Section', color: 'orange',
      fields: [
        { id: newId(), field: 'MAPPING_TYPE', description: 'Copy, Default, Transform, XREF' },
        { id: newId(), field: 'TRANSFORMATION_RULE', description: '' },
        { id: newId(), field: 'TECHNICAL_RULE', description: '' },
      ],
    },
    {
      id: newId(), name: 'Target Section', color: 'teal',
      fields: [
        { id: newId(), field: 'TGT_SYSTEM', description: '' },
        { id: newId(), field: 'TGT_TABLE', description: '' },
        { id: newId(), field: 'TGT_FIELD', description: '' },
        { id: newId(), field: 'TGT_FIELD_DESC', description: '' },
        { id: newId(), field: 'TGT_FIELD_MANDATORY', description: 'Mandatory or Optional' },
        { id: newId(), field: 'TGT_FIELD_DATATYPE', description: '' },
        { id: newId(), field: 'TGT_FIELD_LENGTH', description: '' },
        { id: newId(), field: 'TGT_FIELD_DECIMAL', description: '' },
        { id: newId(), field: 'TGT_CHECK_TABLE', description: '' },
        // Target classification: what KIND of field this is, as opposed to what it holds. A field
        // added on one FMD rather than inherited from this template carries 'Custom', which is what
        // lets a generated document say which of its columns the template never gave it.
        {
          id: newId(), field: 'FIELD_TYPE', kind: 'select', options: ['Standard', 'Custom'],
          description: 'Standard = comes from the Golden template. Custom = added on this FMD only.',
        },
      ],
    },
    {
      id: newId(), name: 'Load Section', color: 'red',
      fields: [
        { id: newId(), field: 'LOAD_APPROACH', description: '' },
        { id: newId(), field: 'LOAD_TABLE', description: '' },
        { id: newId(), field: 'LOAD_FIELD', description: '' },
      ],
    },
  ],
});

const moveItem = <T,>(list: T[], fromIndex: number, toIndex: number): T[] => {
  const copy = [...list];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
};

type Drag = { type: 'section'; id: string } | { type: 'field'; id: string } | null;

/** Golden FMD Designer — the only editable entry point for the (singleton) Golden FMD. Sections
 * live in a left pane (drag to reorder, click to select, add/rename/recolor/delete); the selected
 * section's fields live in a right pane (drag to reorder, add/edit/delete). Saving opens a
 * required change-comment prompt and writes a brand-new version row, never overwriting the last
 * one, so past structures stay inspectable from the catalog's read-only viewer. */
/** The editor each kind produces, named the way a person would describe the column rather than the
 * way a database would. `longText` exists because a transformation rule needs a textarea and a
 * table name does not. */
const GOLDEN_FIELD_KINDS = [
  { value: 'text', label: 'Text' },
  { value: 'longText', label: 'Long text' },
  { value: 'select', label: 'Value list' },
  { value: 'boolean', label: 'Yes / no' },
  { value: 'integer', label: 'Whole number' },
  { value: 'decimal', label: 'Number' },
] as const;

/** The comma-separated value list.
 *
 * Holds the RAW text while you type and only parses on blur. Parsing on every keystroke made the
 * field impossible to use: typing a comma produced a trailing empty segment, the filter dropped it,
 * and the comma vanished from under the cursor — so a second value could never be entered. */
function OptionsInput({ options, onChange }: { options: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState(options.join(', '));
  const [focused, setFocused] = useState(false);
  // Follow the model while the box is idle, so an undo or a section switch is reflected; ignore it
  // while focused, or the round-trip would fight the keyboard again.
  useEffect(() => { if (!focused) setText(options.join(', ')); }, [options, focused]);

  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        onChange(parseValueList(text));
      }}
      placeholder="CHAR, DATS, INT"
      title="Separate values with a comma, a semicolon or a line break."
      className="w-full bg-transparent px-2.5 py-1.5 text-sm2 font-mono focus-visible:outline-none focus-visible:bg-blue-pale placeholder:text-muted placeholder:font-sans"
    />
  );
}

export function GoldenFmdDesignerDialog({ target, onClose }: { target: LibraryFmdRow | 'new' | null; onClose: () => void }) {
  const toast = useToast();
  const isNew = target === 'new';
  const fmdId = isNew || !target ? undefined : target.id;
  const { data: version, isLoading } = useLatestFmdVersion(fmdId);
  const mutations = useGoldenFmdMutations();

  const [structure, setStructure] = useState<GoldenFmdStructure>(defaultStructure());
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<Drag>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (isNew) {
      const s = defaultStructure();
      setStructure(s); setActiveSectionId(s.sections[0]?.id ?? null); setDirty(false);
    } else if (target && version) {
      const s = version.sheets.goldenStructure?.sections.length ? version.sheets.goldenStructure : defaultStructure();
      setStructure(s); setActiveSectionId(s.sections[0]?.id ?? null); setDirty(false);
    }
  }, [isNew, target, version?.id]);

  if (!target) return null;

  const activeSection = structure.sections.find((s) => s.id === activeSectionId) ?? null;

  /** Baseline fields this template does not have. Recomputed on every edit rather than checked only
   * at save, because "you cannot save" is far more useful before you have made twenty changes than
   * after. */
  const missingBaseline = missingRequiredGoldenFields(
    structure.sections.flatMap((s) => s.fields.map((f) => f.field)),
  );

  const updateSection = (id: string, patch: Partial<GoldenFmdStructure['sections'][number]>) => {
    setStructure((s) => ({ sections: s.sections.map((sec) => (sec.id === id ? { ...sec, ...patch } : sec)) }));
    setDirty(true);
  };
  const addSection = () => {
    const id = newId();
    setStructure((s) => ({ sections: [...s.sections, { id, name: 'New Section', color: nextColor(s.sections.map((sec) => sec.color)).key, fields: [] }] }));
    setActiveSectionId(id);
    setDirty(true);
  };
  const removeSection = (id: string) => {
    setStructure((s) => {
      const next = s.sections.filter((sec) => sec.id !== id);
      if (activeSectionId === id) setActiveSectionId(next[0]?.id ?? null);
      return { sections: next };
    });
    setDirty(true);
  };
  const addField = (sectionId: string) => {
    setStructure((s) => ({ sections: s.sections.map((sec) => (sec.id === sectionId ? { ...sec, fields: [...sec.fields, { id: newId(), field: '', description: '' }] } : sec)) }));
    setDirty(true);
  };
  const updateField = (sectionId: string, fieldId: string, key: 'field' | 'description' | 'critical' | 'kind' | 'options', value: string | boolean | string[]) => {
    setStructure((s) => ({
      sections: s.sections.map((sec) => (sec.id !== sectionId ? sec : {
        ...sec, fields: sec.fields.map((f) => (f.id === fieldId ? { ...f, [key]: value } : f)),
      })),
    }));
    setDirty(true);
  };
  const removeField = (sectionId: string, fieldId: string) => {
    const target = structure.sections.find((s) => s.id === sectionId)?.fields.find((f) => f.id === fieldId);
    if (target && isRequiredGoldenField(target.field)) {
      toast.error(`${target.field} is a required field — row identity, generation and the mapping review all depend on it.`);
      return;
    }
    setStructure((s) => ({
      sections: s.sections.map((sec) => (sec.id !== sectionId ? sec : { ...sec, fields: sec.fields.filter((f) => f.id !== fieldId) })),
    }));
    setDirty(true);
  };

  const dropOnSection = (targetId: string) => {
    if (drag?.type !== 'section' || drag.id === targetId) return;
    setStructure((s) => {
      const from = s.sections.findIndex((sec) => sec.id === drag.id);
      const to = s.sections.findIndex((sec) => sec.id === targetId);
      return { sections: moveItem(s.sections, from, to) };
    });
    setDirty(true);
  };
  const dropOnField = (targetFieldId: string) => {
    if (drag?.type !== 'field' || drag.id === targetFieldId || !activeSection) return;
    const sectionId = activeSection.id;
    setStructure((s) => ({
      sections: s.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const from = sec.fields.findIndex((f) => f.id === drag.id);
        const to = sec.fields.findIndex((f) => f.id === targetFieldId);
        return { ...sec, fields: moveItem(sec.fields, from, to) };
      }),
    }));
    setDirty(true);
  };

  const openSaveComment = () => {
    if (structure.sections.length === 0) { toast.error('Add at least one section first.'); return; }
    // Checked at save as well as at delete: renaming a required field away is the same loss as
    // deleting it, and only a whole-structure check catches that.
    const missing = missingRequiredGoldenFields(structure.sections.flatMap((s) => s.fields.map((f) => f.field)));
    if (missing.length > 0) {
      toast.error(`Required field${missing.length === 1 ? '' : 's'} missing: ${missing.join(', ')}. Restore ${missing.length === 1 ? 'it' : 'them'} before saving.`);
      return;
    }
    setComment('');
    setCommentOpen(true);
  };

  const confirmSave = async () => {
    if (!comment.trim()) { toast.error('A change comment is required for version history.'); return; }
    setSaving(true);
    try {
      if (isNew) {
        await mutations.create(GOLDEN_FMD_NAME, structure, comment.trim());
        toast.success('Golden FMD registered.');
      } else {
        // target is narrowed to LibraryFmdRow here (null returned early, 'new' handled above).
        await mutations.saveNewVersion(target.id, version?.version ?? target.latestVersion ?? 'v1.0.0', structure, comment.trim());
        toast.success('New version saved.');
      }
      setDirty(false);
      setCommentOpen(false);
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Could not save Golden FMD.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <UnsavedChangesGuard when={!!target && dirty} what="Your Golden FMD changes" />
    <Dialog
      open={!!target} onClose={onClose}
      unsavedWarning={dirty ? 'Your changes to the Golden FMD structure have not been saved as a version yet.' : undefined} title={GOLDEN_FMD_NAME} size="win"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={openSaveComment} disabled={saving || (!isNew && !dirty)}>
          {isNew ? 'Register Golden FMD' : 'Save new version'}
        </Button>
      </>}
    >
      {!isNew && isLoading ? (
        <p className="text-sm2 text-muted">Loading…</p>
      ) : (
        <div className="h-full flex flex-col gap-3">
        {/* The baseline moves. When a field is added to REQUIRED_GOLDEN_FIELDS, every template
            written before that becomes unsaveable — the save refuses while a required field is
            absent, so a programme is locked out of editing its own template until someone recreates
            the field by hand, spelled correctly, in the right section, with the right value list.
            That is a wall with no instructions on it. This is the same repair as one action, and it
            goes through the normal comment-and-version path rather than happening invisibly. */}
        {missingBaseline.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg bg-amber-bg shadow-[inset_0_0_0_1px_var(--amber-ink)] px-3.5 py-2.5 shrink-0">
            <AlertTriangle size={15} className="text-amber-ink shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 text-2xs text-amber-ink">
              <span className="font-semibold">
                {missingBaseline.length} baseline field{missingBaseline.length === 1 ? '' : 's'} missing:
              </span>{' '}
              <span className="font-mono font-semibold">{missingBaseline.join(', ')}</span>
              <span className="ml-1 font-normal">
                — the template cannot be saved without {missingBaseline.length === 1 ? 'it' : 'them'}.
                Adding {missingBaseline.length === 1 ? 'it' : 'them'} here puts{' '}
                {missingBaseline.length === 1 ? 'it' : 'each'} in the closest matching section, with
                its description and value list filled in.
              </span>
            </div>
            <Button
              variant="primary" size="sm" className="shrink-0"
              onClick={() => { setStructure((s) => withMissingBaselineFields(s)); setDirty(true); }}
            >
              Add {missingBaseline.length === 1 ? 'it' : 'them'}
            </Button>
          </div>
        )}
        <div className="flex-1 min-h-0 flex gap-4">
          <div className="w-[260px] shrink-0 flex flex-col rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
            <div className="px-3 py-2 text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3">Sections</div>
            <div className="flex-1 overflow-auto">
              {structure.sections.map((section) => {
                const color = colorByKey(section.color);
                const selected = section.id === activeSectionId;
                return (
                  <div
                    key={section.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOnSection(section.id)}
                    onClick={() => setActiveSectionId(section.id)}
                    className={clsx('flex items-center gap-2 px-2.5 py-2 border-b border-line cursor-pointer', selected ? 'bg-blue-pale' : 'hover:bg-surface-2')}
                  >
                    <span draggable onDragStart={() => setDrag({ type: 'section', id: section.id })} onClick={(e) => e.stopPropagation()} className="cursor-grab text-muted hover:text-text shrink-0">
                      <GripVertical size={14} />
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color.text }} />
                    <span className={clsx('flex-1 min-w-0 truncate text-sm2', selected ? 'font-bold text-text' : 'text-text')}>{section.name || 'Untitled section'}</span>
                    <span className="text-2xs text-muted shrink-0">{section.fields.length}</span>
                    <button onClick={(e) => { e.stopPropagation(); removeSection(section.id); }} className="text-red hover:bg-red-light p-1 rounded shrink-0"><Trash2 size={12} /></button>
                  </div>
                );
              })}
              {structure.sections.length === 0 && <p className="text-sm2 text-muted px-3 py-4">No sections yet.</p>}
            </div>
            <button onClick={addSection} className="text-blue text-sm2 font-semibold px-3 py-2.5 hover:bg-blue-pale w-full text-left border-t border-line">
              <Plus size={13} className="inline -mt-0.5" /> Add section
            </button>
          </div>

          <div className="flex-1 min-w-0 flex flex-col rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
            {!activeSection ? (
              <p className="text-sm2 text-muted p-6 text-center">Add a section to start defining fields.</p>
            ) : (
              <>
                <div className="px-3.5 py-2.5 border-b border-line flex items-center gap-3" style={{ backgroundColor: colorByKey(activeSection.color).bg }}>
                  <input
                    value={activeSection.name} onChange={(e) => updateSection(activeSection.id, { name: e.target.value })}
                    className="bg-transparent text-sm2 font-bold min-w-0 flex-1 focus-visible:outline-none"
                    style={{ color: colorByKey(activeSection.color).text }}
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    {SECTION_COLORS.map((c) => {
                      const usedBy = structure.sections.find((sec) => sec.id !== activeSection.id && sec.color === c.key);
                      return (
                        <button
                          key={c.key} onClick={() => !usedBy && updateSection(activeSection.id, { color: c.key })}
                          disabled={!!usedBy}
                          aria-label={c.label}
                          title={usedBy ? `Already used by "${usedBy.name || 'Untitled section'}"` : c.label}
                          className={clsx(
                            'w-4 h-4 rounded-full shrink-0 border',
                            activeSection.color === c.key && 'ring-2 ring-offset-1 ring-text',
                            usedBy && 'opacity-25 cursor-not-allowed',
                          )}
                          style={{ backgroundColor: c.text, borderColor: c.border }}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse text-sm2 table-fixed">
                    <thead>
                      <tr>
                        <th className="w-8 bg-surface border-b border-line px-2.5 py-2" />
                        {/* Characters, not a percentage — see the same header in
                            GoldenXrefDesignerDialog. A percentage narrows with the dialog and a
                            long name then scrolls inside its own input. */}
                        <th className="w-[34ch] text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface border-b border-line px-2.5 py-2 text-left sticky top-0">Field</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface border-b border-line px-2.5 py-2 text-left sticky top-0">Description</th>
                        <th
                          className="w-28 text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface border-b border-line px-2.5 py-2 text-left sticky top-0"
                          title="What this column accepts. Every FMD generated from this template gets the matching editor, so the restriction is set once here rather than re-argued per FMD."
                        >
                          Type
                        </th>
                        <th className="w-[22%] text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface border-b border-line px-2.5 py-2 text-left sticky top-0">Allowed values</th>
                        <th
                          className="w-16 text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface border-b border-line px-2.5 py-2 text-center sticky top-0"
                          title="Critical fields are what the Mapping Review checks first: a blank one is an error rather than a warning, and the AI weighs its judgement toward them."
                        >
                          Critical
                        </th>
                        <th className="w-8 bg-surface border-b border-line" />
                      </tr>
                    </thead>
                    <tbody>
                      {activeSection.fields.map((field) => (
                        <tr
                          key={field.id} className="border-t border-line"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => dropOnField(field.id)}
                        >
                          <td className="text-center">
                            <span draggable onDragStart={() => setDrag({ type: 'field', id: field.id })} className="cursor-grab text-muted hover:text-text inline-flex">
                              <GripVertical size={13} />
                            </span>
                          </td>
                          <td className="p-0">
                            {/* A baseline name is read-only, not merely rejected on save: renaming
                                SRC_FIELD removes SRC_FIELD just as surely as deleting the row, and
                                finding that out only when you press Save costs you the edits you
                                made after it. Everything else about the field stays editable. */}
                            <input
                              value={field.field} onChange={(e) => updateField(activeSection.id, field.id, 'field', e.target.value)}
                              readOnly={isRequiredGoldenField(field.field)}
                              title={isRequiredGoldenField(field.field) ? 'Baseline field — its name is fixed. Type, allowed values, description and Critical are all still editable.' : undefined}
                              className={clsx(
                                'w-full bg-transparent px-2.5 py-1.5 text-sm2 font-mono font-bold focus-visible:outline-none',
                                isRequiredGoldenField(field.field) ? 'cursor-default' : 'focus-visible:bg-blue-pale',
                              )}
                            />
                          </td>
                          <td className="p-0">
                            <input
                              value={field.description} onChange={(e) => updateField(activeSection.id, field.id, 'description', e.target.value)}
                              placeholder="—"
                              className="w-full bg-transparent px-2.5 py-1.5 text-sm2 focus-visible:outline-none focus-visible:bg-blue-pale placeholder:text-muted"
                            />
                          </td>
                          <td className="p-0">
                            <Select
                              size="sm" value={field.kind ?? 'text'}
                              onChange={(e) => updateField(activeSection.id, field.id, 'kind', e.target.value)}
                              className="w-full border-0 rounded-none bg-transparent focus-visible:bg-blue-pale"
                            >
                              {GOLDEN_FIELD_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                            </Select>
                          </td>
                          <td className="p-0">
                            {/* Only a value list needs values. Showing the box for every type would
                                invite someone to fill it in where nothing reads it. */}
                            {field.kind === 'select' ? (
                              <OptionsInput
                                options={field.options ?? []}
                                onChange={(next) => updateField(activeSection.id, field.id, 'options', next)}
                              />
                            ) : (
                              <span className="block px-2.5 py-1.5 text-2xs text-muted">—</span>
                            )}
                          </td>
                          <td className="text-center">
                            {/* Marking a column critical here is what focuses every Mapping Review
                                run on it. It belongs to the TEMPLATE, not the review: which columns
                                a program cares about is a decision about the document, and it
                                differs between programs. */}
                            <input
                              type="checkbox"
                              checked={!!field.critical}
                              onChange={(e) => updateField(activeSection.id, field.id, 'critical', e.target.checked)}
                              className="w-3.5 h-3.5 accent-[var(--red)]"
                              aria-label={`Mark ${field.field || 'this field'} critical`}
                              title="Blank in this column is reported as an error"
                            />
                          </td>
                          <td className="text-center">
                            {isRequiredGoldenField(field.field) ? (
                              <span title="Required field — cannot be removed" className="inline-flex text-muted p-1"><Lock size={12} /></span>
                            ) : (
                              <button onClick={() => removeField(activeSection.id, field.id)} className="text-red hover:bg-red-light p-1 rounded"><Trash2 size={12} /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {activeSection.fields.length === 0 && (
                        <tr><td colSpan={7} className="px-2.5 py-6 text-center text-muted text-sm2">No fields in this section yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <button onClick={() => addField(activeSection.id)} className="text-blue text-sm2 font-semibold px-2.5 py-2 hover:bg-blue-pale w-full text-left">
                    <Plus size={13} className="inline -mt-0.5" /> Add field
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      )}

      <Dialog
        open={commentOpen} onClose={() => setCommentOpen(false)} title="Save Golden FMD" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setCommentOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={confirmSave} disabled={saving}>{saving ? 'Saving…' : 'Confirm & Save'}</Button>
        </>}
      >
        <label className="block text-sm2 font-semibold text-muted mb-[5px]">What changed?</label>
        <textarea
          value={comment} onChange={(e) => setComment(e.target.value)} rows={3} autoFocus
          placeholder="e.g. Added SRC_CHECK_TABLE and reordered Load Section"
          className="w-full text-sm2 bg-surface border border-line-strong rounded px-[11px] py-2 resize-y"
        />
        <p className="text-2xs text-muted mt-1.5">Saved as this version's note in Versions.</p>
      </Dialog>
    </Dialog>
    </>
  );
}

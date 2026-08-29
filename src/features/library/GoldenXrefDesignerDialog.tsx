import { useEffect, useState } from 'react';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useXrefVersions, useGoldenXrefMutations, type LibraryXrefRow } from '../../lib/queries/rules';
import { SECTION_COLORS, colorByKey, nextColor } from '../../lib/goldenFmdColors';
import type { GoldenFmdStructure } from '../../types/entities';

export const GOLDEN_XREF_NAME = 'Golden_Cross_Reference_Template';

const newId = () => crypto.randomUUID();

const fieldsFor = (prefix: string, n: number): { id: string; field: string; description: string }[] => [
  { id: newId(), field: `LEGACY_FIELDNAME${n}`, description: '' },
  { id: newId(), field: `LEGACY_FIELDNAME${n}_DESCRIPTION`, description: '' },
  { id: newId(), field: `LEGACY_VALUE${n}`, description: '' },
  { id: newId(), field: `LEGACY_VALUE${n}_DESCRIPTION`, description: '' },
  { id: newId(), field: `NEW_FIELDNAME${n}`, description: '' },
  { id: newId(), field: `NEW_FIELDNAME${n}_DESCRIPTION`, description: '' },
  { id: newId(), field: `NEW_FIELDVALUE${n}`, description: '' },
  { id: newId(), field: `NEW_FIELDVALUE${n}_DESCRIPTION`, description: '' },
].map((f) => ({ ...f, field: prefix ? `${prefix}${f.field}` : f.field }));

/** The Golden XREF's starting structure — General (name/description) plus four Field N sections,
 * each holding the legacy/new field-and-value pairs a value-mapping row needs. */
const defaultStructure = (): GoldenFmdStructure => ({
  sections: [
    {
      id: newId(), name: 'General Section', color: 'blue',
      fields: [
        { id: newId(), field: 'XREF_NAME', description: '' },
        { id: newId(), field: 'XREF_DESCRIPTION', description: '' },
      ],
    },
    { id: newId(), name: 'Field 1 Section', color: 'orange', fields: fieldsFor('', 1) },
    { id: newId(), name: 'Field 2 Section', color: 'teal', fields: fieldsFor('', 2) },
    { id: newId(), name: 'Field 3 Section', color: 'red', fields: fieldsFor('', 3) },
    { id: newId(), name: 'Field 4 Section', color: 'indigo', fields: fieldsFor('', 4) },
  ],
});

const moveItem = <T,>(list: T[], fromIndex: number, toIndex: number): T[] => {
  const copy = [...list];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
};

type Drag = { type: 'section'; id: string } | { type: 'field'; id: string } | null;

/** Golden XREF Designer — the only editable entry point for the (singleton) Golden XREF. Same
 * left-pane-sections / right-pane-fields layout, drag-to-reorder, color picker, and
 * comment-on-save versioning as the Golden FMD Designer. */
export function GoldenXrefDesignerDialog({ target, onClose }: { target: LibraryXrefRow | 'new' | null; onClose: () => void }) {
  const toast = useToast();
  const isNew = target === 'new';
  const xrefTableId = isNew || !target ? undefined : target.id;
  const { data: versions = [], isLoading } = useXrefVersions(xrefTableId);
  const version = versions[0];
  const mutations = useGoldenXrefMutations();

  const [structure, setStructure] = useState<GoldenFmdStructure>(defaultStructure());
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Same guard as the Golden FMD designer: a structure edited but not saved as a version is exactly
  // the kind of work that disappears when someone clicks the sidebar to check something.
  const guard = <UnsavedChangesGuard when={!!target && dirty} what="Your Golden XREF changes" />;
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<Drag>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (isNew) {
      const s = defaultStructure();
      setStructure(s); setActiveSectionId(s.sections[0]?.id ?? null); setDirty(false);
    } else if (target && version) {
      const s = version.structure?.sections?.length ? version.structure : defaultStructure();
      setStructure(s); setActiveSectionId(s.sections[0]?.id ?? null); setDirty(false);
    }
  }, [isNew, target, version?.id]);

  if (!target) return null;

  const activeSection = structure.sections.find((s) => s.id === activeSectionId) ?? null;

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
  const updateField = (sectionId: string, fieldId: string, key: 'field' | 'description', value: string) => {
    setStructure((s) => ({
      sections: s.sections.map((sec) => (sec.id !== sectionId ? sec : {
        ...sec, fields: sec.fields.map((f) => (f.id === fieldId ? { ...f, [key]: value } : f)),
      })),
    }));
    setDirty(true);
  };
  const removeField = (sectionId: string, fieldId: string) => {
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
    setComment('');
    setCommentOpen(true);
  };

  const confirmSave = async () => {
    if (!comment.trim()) { toast.error('A change comment is required for version history.'); return; }
    setSaving(true);
    try {
      if (isNew) {
        await mutations.create(GOLDEN_XREF_NAME, structure, comment.trim());
        toast.success('Golden XREF registered.');
      } else {
        // target is narrowed to LibraryXrefRow here (null returned early, 'new' handled above).
        // latestVersion is derived from xref_versions — the old xref_tables.version column was dead.
        await mutations.saveNewVersion(target.id, version?.version ?? target.latestVersion ?? 'v1.0.0', structure, comment.trim());
        toast.success('New version saved.');
      }
      setDirty(false);
      setCommentOpen(false);
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Could not save Golden XREF.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    {guard}
    <Dialog
      open={!!target} onClose={onClose}
      unsavedWarning={dirty ? 'Your changes to the Golden XREF structure have not been saved as a version yet.' : undefined} title={GOLDEN_XREF_NAME} size="win"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={openSaveComment} disabled={saving || (!isNew && !dirty)}>
          {isNew ? 'Register Golden XREF' : 'Save new version'}
        </Button>
      </>}
    >
      {!isNew && isLoading ? (
        <p className="text-sm2 text-muted">Loading…</p>
      ) : (
        <div className="h-full flex gap-4">
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
                        <th className="w-[32%] text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface border-b border-line px-2.5 py-2 text-left sticky top-0">Field</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface border-b border-line px-2.5 py-2 text-left sticky top-0">Description / Allowed Values</th>
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
                            <input
                              value={field.field} onChange={(e) => updateField(activeSection.id, field.id, 'field', e.target.value)}
                              className="w-full bg-transparent px-2.5 py-1.5 text-sm2 font-mono font-bold focus-visible:outline-none focus-visible:bg-blue-pale"
                            />
                          </td>
                          <td className="p-0">
                            <input
                              value={field.description} onChange={(e) => updateField(activeSection.id, field.id, 'description', e.target.value)}
                              placeholder="—"
                              className="w-full bg-transparent px-2.5 py-1.5 text-sm2 focus-visible:outline-none focus-visible:bg-blue-pale placeholder:text-muted"
                            />
                          </td>
                          <td className="text-center">
                            <button onClick={() => removeField(activeSection.id, field.id)} className="text-red hover:bg-red-light p-1 rounded"><Trash2 size={12} /></button>
                          </td>
                        </tr>
                      ))}
                      {activeSection.fields.length === 0 && (
                        <tr><td colSpan={4} className="px-2.5 py-6 text-center text-muted text-sm2">No fields in this section yet.</td></tr>
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
      )}

      <Dialog
        open={commentOpen} onClose={() => setCommentOpen(false)} title="Save Golden XREF" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setCommentOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={confirmSave} disabled={saving}>{saving ? 'Saving…' : 'Confirm & Save'}</Button>
        </>}
      >
        <label className="block text-sm2 font-semibold text-muted mb-[5px]">What changed?</label>
        <textarea
          value={comment} onChange={(e) => setComment(e.target.value)} rows={3} autoFocus
          placeholder="e.g. Added Field 4 Section, reordered General fields"
          className="w-full text-sm2 bg-surface border border-line-strong rounded px-[11px] py-2 resize-y"
        />
        <p className="text-2xs text-muted mt-1.5">Saved as this version's note in Versions.</p>
      </Dialog>
    </Dialog>
    </>
  );
}

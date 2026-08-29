import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { useTimelineCategories, useTimelineEntries, useTimelineAdminMutations } from '../../lib/queries/timelineAdmin';

export function TimelinesSettingsTab({ programId }: { programId: string }) {
  const toast = useToast();
  const { data: categories = [] } = useTimelineCategories(programId);
  const categoryIds = categories.map((c) => c.id);
  const { data: entries = [] } = useTimelineEntries(categoryIds);
  const mutations = useTimelineAdminMutations(programId);
  const [newCategory, setNewCategory] = useState('');
  const [entryForm, setEntryForm] = useState<Record<string, { rowLabel: string; name: string; startDate: string; endDate: string }>>({});

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      await mutations.addCategory(newCategory.trim(), categories.length + 1);
      setNewCategory('');
    } catch (err: any) {
      toast.error(err.message ?? 'Could not add category.');
    }
  };

  const addEntry = async (categoryId: string) => {
    const f = entryForm[categoryId];
    if (!f?.rowLabel.trim() || !f?.name.trim() || !f?.startDate) return;
    try {
      await mutations.addEntry(categoryId, {
        rowLabel: f.rowLabel, name: f.name, kind: f.endDate ? 'range' : 'point',
        startDate: f.startDate, endDate: f.endDate || undefined,
      });
      setEntryForm((cur) => ({ ...cur, [categoryId]: { rowLabel: '', name: '', startDate: '', endDate: '' } }));
    } catch (err: any) {
      toast.error(err.message ?? 'Could not add milestone.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm2 text-muted">Milestones configured here render read-only on the Dashboard.</p>

      <div className="flex items-center gap-2">
        <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name" className="w-64" />
        <Button variant="secondary" onClick={addCategory}><Plus size={13} /> Add category</Button>
      </div>

      {categories.map((cat) => {
        const catEntries = entries.filter((e) => e.categoryId === cat.id);
        const f = entryForm[cat.id] ?? { rowLabel: '', name: '', startDate: '', endDate: '' };
        return (
          <Card key={cat.id}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-text">{cat.name}</span>
              <button onClick={() => mutations.removeCategory(cat.id)} className="text-red hover:bg-red-light p-1.5 rounded"><Trash2 size={13} /></button>
            </div>
            <div className="flex flex-col gap-1.5 mb-3">
              {catEntries.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-sm2 bg-surface-2 rounded px-2.5 py-1.5">
                  <span className="font-semibold flex-1">{e.rowLabel} — {e.name}</span>
                  <span className="text-2xs text-muted">{e.startDate}{e.endDate ? ` → ${e.endDate}` : ''}</span>
                  <button onClick={() => mutations.removeEntry(e.id)} className="text-red hover:bg-red-light p-1 rounded"><Trash2 size={12} /></button>
                </div>
              ))}
              {catEntries.length === 0 && <p className="text-2xs text-muted">No milestones yet.</p>}
            </div>
            <div className="grid grid-cols-5 gap-2 items-end">
              <Field label="Row"><Input value={f.rowLabel} onChange={(e) => setEntryForm((c) => ({ ...c, [cat.id]: { ...f, rowLabel: e.target.value } }))} /></Field>
              <Field label="Name"><Input value={f.name} onChange={(e) => setEntryForm((c) => ({ ...c, [cat.id]: { ...f, name: e.target.value } }))} /></Field>
              <Field label="Start"><Input type="date" value={f.startDate} onChange={(e) => setEntryForm((c) => ({ ...c, [cat.id]: { ...f, startDate: e.target.value } }))} /></Field>
              <Field label="End (optional)"><Input type="date" value={f.endDate} onChange={(e) => setEntryForm((c) => ({ ...c, [cat.id]: { ...f, endDate: e.target.value } }))} /></Field>
              <Button variant="secondary" onClick={() => addEntry(cat.id)}>Add</Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

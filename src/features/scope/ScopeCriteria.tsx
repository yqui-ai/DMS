import { useState } from 'react';
import { Select } from '../../components/Select';
import { useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { Table, type Column } from '../../components/Table';
import { Tag } from '../../components/Tag';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, Input } from '../../components/Field';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { useSelectionCriteria, useSelectionCriteriaMutations } from '../../lib/queries/staging';
import type { SelectionCriterion } from '../../types/entities';

export function ScopeCriteria() {
  const { subprojectId } = useParams();
  const toast = useToast();
  const { data: criteria = [], isLoading } = useSelectionCriteria(subprojectId);
  const mutations = useSelectionCriteriaMutations(subprojectId!);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ tableName: '', mode: 'Simple' as 'Simple' | 'Complex', field: '', condition: '', value: '', scope: 'Table' as 'Table' | 'Cross-table' });

  const remove = async (c: SelectionCriterion) => {
    try { await mutations.remove(c.id); } catch (err: any) { toast.error(err.message ?? 'Could not remove.'); }
  };

  const add = async () => {
    if (!form.tableName.trim()) return;
    try {
      await mutations.create(form);
      setForm({ tableName: '', mode: 'Simple', field: '', condition: '', value: '', scope: 'Table' });
      setAddOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not add criterion.');
    }
  };

  const columns: Column<SelectionCriterion>[] = [
    { key: 'table', header: 'Table', render: (c) => <Tag variant="table">{c.tableName}</Tag> },
    { key: 'mode', header: 'Mode', render: (c) => <Tag variant="neutral">{c.mode}</Tag> },
    { key: 'field', header: 'Field', render: (c) => c.field ?? '—' },
    { key: 'condition', header: 'Condition', render: (c) => c.condition ?? '—' },
    { key: 'value', header: 'Value', render: (c) => <span className="font-mono text-sm2">{c.value ?? '—'}</span> },
    { key: 'scope', header: 'Scope', render: (c) => c.scope },
    { key: 'actions', header: '', frozen: true, width: 40, render: (c) => <button onClick={() => remove(c)} className="text-red hover:bg-red-light p-1 rounded"><Trash2 size={13} /></button> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setAddOpen(true)}><Plus size={14} /> Add criterion</Button>
      </div>
      {!isLoading && criteria.length === 0 ? (
        <EmptyState title="No selection criteria yet" description="Row-level filters for extraction will list here." />
      ) : (
        <Table columns={columns} rows={criteria} rowKey={(c) => c.id} emptyMessage="Loading…" />
      )}

      <Dialog
        open={addOpen} onClose={() => setAddOpen(false)} title="Add selection criterion" size="sm"
        footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button><Button variant="primary" onClick={add}>Add</Button></>}
      >
        <div className="flex flex-col gap-3">
          <Field label="Table"><Input value={form.tableName} onChange={(e) => setForm((f) => ({ ...f, tableName: e.target.value }))} placeholder="e.g. MARA" /></Field>
          <Field label="Mode">
            <Select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as 'Simple' | 'Complex' }))} className="w-full">
              <option>Simple</option><option>Complex</option>
            </Select>
          </Field>
          <Field label="Field"><Input value={form.field} onChange={(e) => setForm((f) => ({ ...f, field: e.target.value }))} /></Field>
          <Field label="Condition"><Input value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))} placeholder="e.g. in, equals, not null" /></Field>
          <Field label="Value"><Input value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} /></Field>
          <Field label="Scope">
            <Select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as 'Table' | 'Cross-table' }))} className="w-full">
              <option>Table</option><option>Cross-table</option>
            </Select>
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { useToast } from '../../components/Toast';
import { useScopeMutations } from '../../lib/queries/scope';
import type { MigrationObject, SubprojectObject } from '../../types/entities';

/** "Standard list" = Master data objects, the commonly-migrated starter set (no such flag exists in
 * the SAP DMC catalogue itself, so this is the closest reasonable proxy). */
export function SelectStandardDialog({
  open, onClose, objects, subprojectObjects, subprojectId,
}: {
  open: boolean; onClose: () => void; objects: MigrationObject[]; subprojectObjects: SubprojectObject[]; subprojectId: string;
}) {
  const toast = useToast();
  const mutations = useScopeMutations(subprojectId);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const inScopeIds = useMemo(() => new Set(subprojectObjects.filter((w) => w.inScope).map((w) => w.migrationObjectId)), [subprojectObjects]);
  const standardObjects = useMemo(() => objects.filter((o) => o.category === 'Master data'), [objects]);

  const toggle = (id: string) => setChecked((c) => {
    const next = new Set(c);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const apply = async () => {
    setBusy(true);
    try {
      await Promise.all(Array.from(checked).map((id) => mutations.setInScope(id, true)));
      toast.success(`Added ${checked.size} object${checked.size === 1 ? '' : 's'} to scope.`);
      setChecked(new Set());
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Could not add objects.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open} onClose={onClose} title="Select objects — standard list" size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={apply} disabled={checked.size === 0 || busy}>
          {busy ? 'Adding…' : `Add ${checked.size || ''} to scope`.trim()}
        </Button>
      </>}
    >
      <p className="text-sm text-muted mb-3">The standard Master Data starter set — check the objects to add to this subproject's scope.</p>
      <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] max-h-[420px] overflow-auto">
        {standardObjects.map((o) => {
          const already = inScopeIds.has(o.id);
          return (
            <label key={o.id} className={`flex items-center gap-3 px-3.5 py-2 border-b border-line last:border-0 ${already ? 'opacity-50' : 'hover:bg-blue-pale cursor-pointer'}`}>
              <input
                type="checkbox" checked={already || checked.has(o.id)} disabled={already}
                onChange={() => toggle(o.id)} className="w-4 h-4 accent-[var(--blue)]"
              />
              <Tag variant="table">{o.objectId}</Tag>
              <span className="text-sm text-text truncate flex-1">{o.description ?? '—'}</span>
              {already && <span className="text-2xs text-muted shrink-0">Already in scope</span>}
            </label>
          );
        })}
      </div>
    </Dialog>
  );
}

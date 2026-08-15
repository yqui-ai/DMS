import { useParams } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Tag } from '../../components/Tag';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { useMigrationObjects, useSubprojectObjects, useScopeMutations } from '../../lib/queries/scope';

export function ScopeSequence() {
  const { subprojectId } = useParams();
  const toast = useToast();
  const { data: objects = [] } = useMigrationObjects();
  const { data: subprojectObjects = [] } = useSubprojectObjects(subprojectId);
  const mutations = useScopeMutations(subprojectId!);

  const byId = new Map(objects.map((o) => [o.id, o]));
  const ordered = [...subprojectObjects.filter((w) => w.inScope)].sort((a, b) => (a.loadSeq ?? 999) - (b.loadSeq ?? 999));

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    const a = ordered[index], b = ordered[target];
    try {
      await Promise.all([mutations.setLoadSeq(a.migrationObjectId, target + 1), mutations.setLoadSeq(b.migrationObjectId, index + 1)]);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not reorder.');
    }
  };

  if (ordered.length === 0) {
    return <EmptyState title="No objects in scope yet" description="Order the load sequence once objects are in scope." />;
  }

  return (
    <div className="rounded-lg shadow-card bg-surface divide-y divide-line">
      {ordered.map((w, i) => (
        <div key={w.migrationObjectId} className="flex items-center gap-3 px-3.5 py-2.5">
          <span className="text-sm2 font-bold text-muted w-6">{i + 1}</span>
          <Tag variant="table">{byId.get(w.migrationObjectId)?.objectId ?? w.migrationObjectId}</Tag>
          <span className="text-sm text-text truncate flex-1">{byId.get(w.migrationObjectId)?.description ?? '—'}</span>
          <button disabled={i === 0} onClick={() => move(i, -1)} className="p-1 rounded hover:bg-blue-pale disabled:opacity-30"><ChevronUp size={14} /></button>
          <button disabled={i === ordered.length - 1} onClick={() => move(i, 1)} className="p-1 rounded hover:bg-blue-pale disabled:opacity-30"><ChevronDown size={14} /></button>
        </div>
      ))}
    </div>
  );
}

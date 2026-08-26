import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { useXrefVersions, type LibraryXrefRow } from '../../lib/queries/rules';
import { fmtDateTime } from '../../lib/format';
import { GoldenFmdStructureView } from './GoldenFmdStructureView';

type SortDir = 'newest' | 'oldest';

/** Read-only view of the (singleton) Golden XREF opened from the catalog row — editing only ever
 * happens through the "Golden XREF" toolbar button / GoldenXrefDesignerDialog. Same version-list +
 * details pane as the Golden FMD viewer's Versions tab, minus Where-used (nothing else
 * references a Golden XREF template yet). */
export function GoldenXrefViewerDialog({ xref, onClose }: { xref: LibraryXrefRow | null; onClose: () => void }) {
  const { data: versions = [], isLoading } = useXrefVersions(xref?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('newest');

  useEffect(() => {
    setSelectedId(versions[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xref?.id, versions.length]);

  const sortedVersions = useMemo(
    () => (sortDir === 'newest' ? versions : [...versions].reverse()),
    [versions, sortDir],
  );
  const latest = versions[0];
  const selected = versions.find((v) => v.id === selectedId) ?? latest;

  if (!xref) return null;

  return (
    <Dialog open={!!xref} onClose={onClose} title={xref.name} size="win">
      {isLoading ? (
        <p className="text-sm2 text-muted">Loading…</p>
      ) : (
        <div className="h-full flex gap-4 min-h-0">
          <div className="w-[300px] shrink-0 flex flex-col gap-3 min-h-0">
            <div className="flex-1 min-h-0 flex flex-col rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
              <button
                onClick={() => setSortDir((d) => (d === 'newest' ? 'oldest' : 'newest'))}
                className="flex items-center gap-1.5 text-2xs font-semibold text-muted hover:text-text px-3 py-1.5 border-b border-line shrink-0"
              >
                {sortDir === 'newest' ? <ArrowDownAZ size={12} /> : <ArrowUpAZ size={12} />}
                {sortDir === 'newest' ? 'Newest first' : 'Oldest first'}
              </button>
              <div className="flex-1 min-h-0 overflow-auto">
                {sortedVersions.length === 0 && <p className="text-sm2 text-muted p-3">No versions yet.</p>}
                {sortedVersions.map((v) => (
                  <button
                    key={v.id} onClick={() => setSelectedId(v.id)}
                    className={clsx('w-full text-left px-3 py-2 border-b border-line last:border-b-0', v.id === selected?.id ? 'bg-blue-pale' : 'hover:bg-surface-2')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm2 text-blue-deep">{v.version}</span>
                      {v.id === latest?.id && <span className="text-2xs text-muted">latest</span>}
                    </div>
                    <div className="text-2xs text-muted truncate">{v.comment || 'No comment provided'}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--line)] p-3.5">
              {selected ? (
                <div className="flex flex-col gap-2.5">
                  <span className="font-mono font-bold text-sm2 text-blue-deep w-fit bg-blue-pale px-2 py-0.5 rounded">{selected.version}</span>
                  <div className="text-sm2"><span className="text-muted">Edited by</span> <span className="font-semibold">{selected.createdBy ?? '—'}</span></div>
                  <div className="text-sm2"><span className="text-muted">On</span> {fmtDateTime(selected.createdAt)}</div>
                  <div>
                    <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1">Comment</div>
                    <p className="text-sm2">{selected.comment || 'No comment provided'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm2 text-muted">Select a version to see its details.</p>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0 overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
            {selected?.structure?.sections?.length ? (
              <GoldenFmdStructureView structure={selected.structure} />
            ) : (
              <p className="text-sm2 text-muted py-8 text-center">No structure recorded for this version.</p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

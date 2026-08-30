import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Select } from '../../components/Select';
import { Pane } from '../../components/Pane';
import { useXrefVersions, type LibraryXrefRow } from '../../lib/queries/rules';
import { fmtDateTime } from '../../lib/format';
import { GoldenFmdStructureView } from './GoldenFmdStructureView';

type Tab = 'structure' | 'versions';

/** Read-only view of the (singleton) Golden XREF — shaped exactly like the Golden FMD viewer.
 *
 * It used to be laid out the other way round: a permanent 300px rail of versions and details on the
 * left with the structure squeezed into whatever was left. Two templates that are read the same
 * way, opened from sibling rows of the same catalogue, gave the reader two different screens — and
 * the one that showed the actual content gave it the smaller half.
 *
 * So it follows the contract in the library-section-design skill, the one the FMD viewer already
 * keeps:
 *   · ONE version selector in the header, driving every tab — a single answer to "which version am
 *     I looking at" wherever you are in the dialog.
 *   · Structure tab: the selected version's fields at FULL dialog width, and nothing else.
 *   · Versions tab: the version list and its details side by side.
 *
 * Editing is still only ever through the "Golden XREF" toolbar button / GoldenXrefDesignerDialog.
 * There is no Where-used tab because nothing references a Golden XREF template yet — an empty tab
 * would be a promise the data cannot keep. */
export function GoldenXrefViewerDialog({ xref, onClose }: { xref: LibraryXrefRow | null; onClose: () => void }) {
  const { data: versions = [], isLoading } = useXrefVersions(xref?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('structure');

  useEffect(() => {
    setSelectedId(versions[0]?.id ?? null);
    setTab('structure');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xref?.id, versions.length]);

  const latest = versions[0];
  const selected = useMemo(
    () => versions.find((v) => v.id === selectedId) ?? latest,
    [versions, selectedId, latest],
  );

  if (!xref) return null;

  return (
    <Dialog open={!!xref} onClose={onClose} title={xref.name} size="win">
      {isLoading ? (
        <p className="text-sm2 text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between gap-3 border-b border-line mb-3 shrink-0">
            <div className="flex items-center gap-1">
              {([
                { key: 'structure', label: 'Cross Reference' },
                { key: 'versions', label: 'Versions' },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={clsx(
                    'px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px',
                    tab === t.key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* One selector for the whole dialog, matching the FMD viewer. Both tabs render
                whatever is picked here, so there is a single answer to which version is on screen. */}
            {versions.length > 0 && (
              <label className="flex items-center gap-1.5 text-2xs text-muted shrink-0 -mt-[5px]">
                Version
                <Select
                  value={selected?.id ?? ''}
                  onChange={(e) => setSelectedId(e.target.value)}
                  size="sm"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.version}{v.id === latest?.id ? ' · latest' : ''}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {tab === 'structure' ? (
              selected?.structure?.sections?.length ? (
                <GoldenFmdStructureView structure={selected.structure} />
              ) : (
                <p className="text-sm2 text-muted py-8 text-center">No structure recorded for this version.</p>
              )
            ) : (
              <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
                <Pane title="Versions">
                  <div className="flex flex-col">
                    {versions.length === 0 && <p className="text-sm2 text-muted p-3">No versions yet.</p>}
                    {versions.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedId(v.id)}
                        className={clsx(
                          'w-full text-left px-3 py-2 border-b border-line-soft last:border-b-0',
                          v.id === selected?.id ? 'bg-blue-pale' : 'hover:bg-surface-2',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm2 text-blue-deep">{v.version}</span>
                          {v.id === latest?.id && <span className="text-2xs text-muted">latest</span>}
                        </div>
                        <div className="text-2xs text-muted truncate">{v.comment || 'No comment provided'}</div>
                      </button>
                    ))}
                  </div>
                </Pane>

                <Pane title="Version details">
                  {selected ? (
                    <div className="flex flex-col gap-2.5 p-3.5">
                      <span className="font-mono text-sm2 text-blue-deep w-fit bg-blue-pale px-2 py-0.5 rounded">
                        {selected.version}
                      </span>
                      <div className="text-sm2">
                        <span className="text-muted">Edited by</span> {selected.createdBy ?? '—'}
                      </div>
                      <div className="text-sm2">
                        <span className="text-muted">On</span> {fmtDateTime(selected.createdAt)}
                      </div>
                      <div>
                        <div className="text-2xs font-semibold uppercase tracking-[.04em] text-muted mb-1">Comment</div>
                        <p className="text-sm2">{selected.comment || 'No comment provided'}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm2 text-muted p-3.5">Select a version to see its details.</p>
                  )}
                </Pane>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

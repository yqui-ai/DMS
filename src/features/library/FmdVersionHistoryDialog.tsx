import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { useFmdGoldenLink, useFmdVersions, useGoldenFmdSummary, useGoldenWhereUsed, type LibraryFmdRow } from '../../lib/queries/fmds';
import { useMigrationObjects } from '../../lib/queries/scope';
import { Tag } from '../../components/Tag';
import { fmtDateTime } from '../../lib/format';
import { GoldenFmdStructureView } from './GoldenFmdStructureView';
import { GeneratedFmdTableView } from './GeneratedFmdTableView';

type Tab = 'history' | 'whereUsed';
type SortDir = 'newest' | 'oldest';

/** Version-history viewer shared by Golden and Custom FMDs — top-left version list (sortable),
 * bottom-left who/when/comment for whichever version is selected, and the version's data on the
 * right (the Golden FMD's structure, or a Custom FMD's generated table — whichever the version
 * actually has). Golden additionally gets a "Where-used" tab (which other FMDs reference it, and
 * whether they're outdated) and a per-version "who's using this" note — Custom FMDs are already
 * scoped to one object/subproject, so that tracking doesn't apply and stays hidden. Standard FMDs
 * use the simpler FmdViewerDialog instead (a version strip, not this full pane layout). */
export function FmdVersionHistoryDialog({ fmd, onClose, showWhereUsed = true }: { fmd: LibraryFmdRow | null; onClose: () => void; showWhereUsed?: boolean }) {
  const { data: versions = [], isLoading } = useFmdVersions(fmd?.id);
  const [tab, setTab] = useState<Tab>('history');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('newest');
  const { data: whereUsed = [], isLoading: whereUsedLoading } = useGoldenWhereUsed(showWhereUsed ? fmd?.id : undefined, showWhereUsed ? versions[0]?.id : undefined);
  const { data: golden } = useGoldenFmdSummary();
  const { data: goldenLink } = useFmdGoldenLink(showWhereUsed ? undefined : fmd?.id);
  const { data: goldenVersions = [] } = useFmdVersions(showWhereUsed ? undefined : golden?.id);
  const { data: objects = [] } = useMigrationObjects();

  useEffect(() => {
    setTab('history');
    setSelectedId(versions[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmd?.id, versions.length]);

  const sortedVersions = useMemo(
    () => (sortDir === 'newest' ? versions : [...versions].reverse()),
    [versions, sortDir],
  );
  const latest = versions[0];
  const selected = versions.find((v) => v.id === selectedId) ?? latest;
  const usedByVersion = useMemo(
    () => (showWhereUsed ? whereUsed.filter((r) => selected && r.basedOnVersion === selected.version) : []),
    [whereUsed, selected, showWhereUsed],
  );

  if (!fmd) return null;

  const object = objects.find((o) => o.id === fmd.migrationObjectId);
  const basedOnVersionLabel = goldenVersions.find((v) => v.id === goldenLink)?.version;
  const goldenOutdated = !!goldenLink && !!golden?.latestVersionId && goldenLink !== golden.latestVersionId;

  return (
    <Dialog open={!!fmd} onClose={onClose} title={fmd.name} size="win">
      <div className="h-full flex flex-col">
        {showWhereUsed && (
          <div className="flex items-center gap-1 border-b border-line mb-3.5 shrink-0">
            <button
              onClick={() => setTab('history')}
              className={clsx('px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px', tab === 'history' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
            >
              Version Updates <span className="text-2xs text-muted">({versions.length})</span>
            </button>
            <button
              onClick={() => setTab('whereUsed')}
              className={clsx('px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px', tab === 'whereUsed' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
            >
              Where-used
            </button>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="flex-1 min-h-0">
            {tab === 'history' ? (
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
                      {sortedVersions.length === 0 && <p className="text-sm text-muted p-3">No versions yet.</p>}
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
                        {showWhereUsed && (
                          <div className="border-t border-line pt-2.5">
                            <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1.5">
                              Program/project/objects on this version ({usedByVersion.length})
                            </div>
                            {usedByVersion.length === 0 ? (
                              <p className="text-2xs text-muted">Nothing generated against this version.</p>
                            ) : (
                              <ul className="flex flex-col gap-1.5">
                                {usedByVersion.map((r) => (
                                  <li key={r.fmdId} className="text-2xs">
                                    <span className="font-mono font-bold">{r.objectId ?? r.name}</span>
                                    <span className="text-muted"> · {r.reference}</span>
                                    {selected.id !== latest?.id && <Tag variant="warn" className="ml-1.5">Outdated</Tag>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">Select a version to see its details.</p>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0 overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
                  {selected?.sheets.goldenStructure ? (
                    <GoldenFmdStructureView structure={selected.sheets.goldenStructure} />
                  ) : selected?.sheets.generatedColumns?.length && selected.sheets.generatedTables?.length ? (
                    <div className="h-full p-2">
                      <GeneratedFmdTableView
                        meta={{
                          fmdName: fmd.name, fmdDisplayId: fmd.displayId, objectId: object?.objectId, objectDescription: object?.description,
                          klass: fmd.class, type: fmd.type, reference: fmd.reference, versionLabel: selected.version,
                          createdBy: selected.createdBy, createdAt: selected.createdAt,
                          goldenVersionLabel: basedOnVersionLabel, goldenOutdated,
                        }}
                        columns={selected.sheets.generatedColumns} tables={selected.sheets.generatedTables}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted py-8 text-center">No data recorded for this version.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
                {whereUsedLoading ? (
                  <p className="text-sm text-muted p-4">Loading…</p>
                ) : whereUsed.length === 0 ? (
                  <p className="text-sm text-muted p-8 text-center">
                    No FMDs reference this template yet. Use "Apply Golden Template" in a Standard FMD's editor (Scope &gt; FMD) to link one.
                  </p>
                ) : (
                  <table className="w-full border-collapse text-sm2">
                    <thead>
                      <tr>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3 py-2 text-left sticky top-0">ID</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3 py-2 text-left sticky top-0">Name</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3 py-2 text-left sticky top-0">Object</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3 py-2 text-left sticky top-0">Reference</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3 py-2 text-left sticky top-0">Based on</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3 py-2 text-left sticky top-0">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {whereUsed.map((r) => (
                        <tr key={r.fmdId} className="border-t border-line">
                          <td className="px-3 py-2 font-mono">{r.displayId ?? '—'}</td>
                          <td className="px-3 py-2">{r.name}</td>
                          <td className="px-3 py-2 font-mono">{r.objectId ?? '—'}</td>
                          <td className="px-3 py-2 font-mono">{r.reference}</td>
                          <td className="px-3 py-2 font-mono">{r.basedOnVersion ?? '—'}</td>
                          <td className="px-3 py-2">
                            <Tag variant={r.isOutdated ? 'warn' : 'accent'}>{r.isOutdated ? 'Outdated' : 'Up to date'}</Tag>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

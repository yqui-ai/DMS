import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Tag } from '../../components/Tag';
import { useFmdGoldenLink, useFmdVersions, useGoldenFmdSummary, type LibraryFmdRow } from '../../lib/queries/fmds';
import { useMigrationObjects } from '../../lib/queries/scope';
import { fmtDateTime } from '../../lib/format';
import { GeneratedFmdTableView } from './GeneratedFmdTableView';
import type { GovState } from '../../types/entities';

type SheetKey = 'source' | 'target' | 'mapping';
const SHEET_COLUMNS: Record<SheetKey, string[]> = {
  source: ['field', 'desc', 'sample', 'sheet'],
  target: ['table', 'field', 'dataType'],
  mapping: ['source', 'target', 'dataType', 'rule', 'mandatory', 'defaultValue', 'dqRule', 'comments'],
};
const SHEET_LABEL: Record<SheetKey, string> = { source: 'Source', target: 'Target', mapping: 'Mapping' };
const STATE_VARIANT: Record<GovState, 'neutral' | 'warn' | 'accent' | 'danger'> = { Draft: 'neutral', 'In Review': 'warn', Approved: 'accent', Rejected: 'danger' };

/** Read-only Library view of a Standard/Historical FMD — plain table, no editing. A version
 * dropdown lets you switch between past snapshots (simpler than Custom/Golden's full
 * version-detail panes, since Standard FMDs are program-wide reference, not a single project's
 * tracked change history) — shows which Golden FMD version it was built from and flags it as
 * outdated once the Golden FMD has moved on. Actual mapping work happens in Scope > FMD
 * (FmdEditorDialog), not from the catalog. */
export function FmdViewerDialog({ fmd, onClose }: { fmd: LibraryFmdRow | null; onClose: () => void }) {
  const { data: versions = [], isLoading } = useFmdVersions(fmd?.id);
  const { data: golden } = useGoldenFmdSummary();
  const { data: goldenLink } = useFmdGoldenLink(fmd?.id);
  const { data: goldenVersions = [] } = useFmdVersions(golden?.id);
  const { data: objects = [] } = useMigrationObjects();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [tab, setTab] = useState<SheetKey>('source');

  useEffect(() => { setSelectedVersionId(versions[0]?.id ?? null); setTab('source'); }, [fmd?.id, versions.length]);

  if (!fmd) return null;

  const version = versions.find((v) => v.id === selectedVersionId) ?? versions[0];
  const isGenerated = !!version?.sheets.generatedColumns?.length && !!version.sheets.generatedTables?.length;
  const rows = version?.sheets[tab] ?? [];
  const columns = SHEET_COLUMNS[tab];
  const object = objects.find((o) => o.id === fmd.migrationObjectId);
  const basedOnVersionLabel = goldenVersions.find((v) => v.id === goldenLink)?.version;
  const goldenOutdated = !!goldenLink && !!golden?.latestVersionId && goldenLink !== golden.latestVersionId;

  return (
    <Dialog open={!!fmd} onClose={onClose} title={fmd.name} size="win">
      <div className="h-full flex flex-col">
        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !version ? (
          <p className="text-sm text-muted py-16 text-center">This FMD has no working version yet.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3 shrink-0 flex-wrap">
              {versions.length > 1 ? (
                <select
                  value={version.id} onChange={(e) => setSelectedVersionId(e.target.value)}
                  className="text-sm2 font-mono font-bold px-2.5 py-1 rounded-[6px] border border-[#d6dbe2] bg-surface"
                >
                  {versions.map((v) => <option key={v.id} value={v.id}>{v.version}{v.id === versions[0].id ? ' (latest)' : ''}</option>)}
                </select>
              ) : (
                <Tag variant="table">{version.version}</Tag>
              )}
              <Tag variant={STATE_VARIANT[version.state]}>{version.state}</Tag>
              {goldenLink && (
                <span className="text-2xs text-muted">
                  Based on Golden FMD <span className="font-mono font-bold">{basedOnVersionLabel ?? '—'}</span>
                  {goldenOutdated && <span className="ml-1.5 font-semibold text-amber-ink">· Outdated — latest is {golden?.latestVersion}</span>}
                </span>
              )}
              {version.approvedBy && <span className="text-2xs text-muted ml-auto">Approved by {version.approvedBy} · {fmtDateTime(version.approvedAt)}</span>}
            </div>

            {isGenerated ? (
              <div className="flex-1 min-h-0">
                <GeneratedFmdTableView
                  meta={{
                    fmdName: fmd.name, fmdDisplayId: fmd.displayId, objectId: object?.objectId, objectDescription: object?.description,
                    klass: fmd.class, type: fmd.type, reference: fmd.reference, versionLabel: version.version,
                    createdBy: version.createdBy, createdAt: version.createdAt,
                    goldenVersionLabel: basedOnVersionLabel,
                    goldenOutdated,
                  }}
                  columns={version.sheets.generatedColumns!} tables={version.sheets.generatedTables!}
                />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1 border-b border-line mb-3 shrink-0">
                  {(Object.keys(SHEET_COLUMNS) as SheetKey[]).map((key) => (
                    <button
                      key={key} onClick={() => setTab(key)}
                      className={clsx('px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px', tab === key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
                    >
                      {SHEET_LABEL[key]} <span className="text-2xs text-muted">({(version.sheets[key] ?? []).length})</span>
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
                  <table className="w-full border-collapse text-sm2">
                    <thead>
                      <tr>
                        {columns.map((c) => (
                          <th key={c} className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-2.5 py-2 sticky top-0 text-left">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr><td colSpan={columns.length} className="px-2.5 py-6 text-center text-muted text-sm">No rows on this sheet.</td></tr>
                      )}
                      {rows.map((row, i) => (
                        <tr key={i} className="border-t border-line">
                          {columns.map((c) => <td key={c} className="px-2.5 py-1.5 text-sm2">{row[c] || '—'}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

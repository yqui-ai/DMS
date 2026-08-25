import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownAZ, ArrowUpAZ, Download, Sparkles, UserCircle2 } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { Tag } from '../../components/Tag';
import { ToolbarButton } from '../../components/ToolbarButton';
import { AiButton } from '../../components/AiButton';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { ToolbarSearch } from '../../components/ToolbarSearch';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../lib/auth';
import { useFmdVersions, useGoldenWhereUsed, useHistoricalSiblings, useSetFmdOwner, type LibraryFmdRow } from '../../lib/queries/fmds';
import { useFmdFieldNotes, useFmdFieldNoteMutations } from '../../lib/queries/fmdFieldNotes';
import { useMigrationObjects } from '../../lib/queries/scope';
import { diffTablesByStructure, rowKey } from '../../lib/rowDiff';
import { useMappingReview } from '../../lib/queries/mappingReview';
import { fmtDateTime, fmdAuditLine } from '../../lib/format';
import { exportGeneratedFmdToExcel } from '../../lib/generatedFmdExport';
import { exportGoldenFmdToExcel } from '../../lib/goldenFmdExport';
import { GoldenFmdStructureView } from './GoldenFmdStructureView';
import { GeneratedFmdTableView, type ReviewCellFinding } from './GeneratedFmdTableView';
import { FieldDetailView } from './FieldDetailView';
import type { FmdVersion, GovState, MappingReviewFinding } from '../../types/entities';

type Tab = 'mapping' | 'versions' | 'whereUsed';
type SortDir = 'newest' | 'oldest';
type SheetKey = 'source' | 'target' | 'mapping';

const SHEET_COLUMNS: Record<SheetKey, string[]> = {
  source: ['field', 'desc', 'sample', 'sheet'],
  target: ['table', 'field', 'dataType'],
  mapping: ['source', 'target', 'dataType', 'rule', 'mandatory', 'defaultValue', 'dqRule', 'comments'],
};
const SHEET_LABEL: Record<SheetKey, string> = { source: 'Source', target: 'Target', mapping: 'Mapping' };
const STATE_VARIANT: Record<GovState, 'neutral' | 'warn' | 'accent' | 'danger'> = { Draft: 'neutral', 'In Review': 'warn', Approved: 'accent', Rejected: 'danger' };

/** FMD viewer shared by every FMD type. One version selector in the header drives every tab, so
 * "which version am I looking at" has a single answer wherever you are:
 *  - Field Mapping: that version's data at full dialog width — the Golden FMD's structure, the
 *    generated grid (one tab per sender structure, since an object can send several), the
 *    field-level drill-down for one row of one structure, or (for an FMD edited by hand in
 *    Scope > FMD rather than generated) the raw source/target/mapping sheets.
 *  - Versions (& Review): the version list, that version's who/when/state/comment, and — Custom
 *    FMDs only — the Mapping Review findings recorded against it.
 * "Where-used" means something different depending on the FMD:
 *  - Golden: which other FMDs reference it, and whether they're outdated (useGoldenWhereUsed).
 *  - Anything else: its sibling plants from the same tracked source file, if it was AI-converted
 *    (useHistoricalSiblings) — a manually-generated FMD with no tracked source just shows a message
 *    explaining there's nothing to find, rather than hiding the tab. */
export function FmdVersionHistoryDialog({ fmd, onClose }: { fmd: LibraryFmdRow | null; onClose: () => void }) {
  const toast = useToast();
  const { data: versions = [], isLoading } = useFmdVersions(fmd?.id);
  const [tab, setTab] = useState<Tab>('mapping');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('newest');
  const [rawTab, setRawTab] = useState<SheetKey>('source');
  const [exporting, setExporting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [structureFilter, setStructureFilter] = useState<string[]>([]);
  const [fieldFilter, setFieldFilter] = useState<string[]>([]);
  const [findingSearch, setFindingSearch] = useState('');
  const [openField, setOpenField] = useState<{ structureId: string; rowIndex: number } | null>(null);
  const { review: reviewMapping, save: saveMappingReview } = useMappingReview();
  const { user } = useAuth();
  const { setOwner } = useSetFmdOwner();
  const [settingOwner, setSettingOwner] = useState(false);
  const isCustomFmd = fmd?.type === 'Custom';
  const goldenMode = fmd?.type === 'Golden';
  const siblingsMode = !goldenMode;
  const { data: whereUsed = [], isLoading: whereUsedLoading } = useGoldenWhereUsed(goldenMode ? fmd?.id : undefined, goldenMode ? versions[0]?.id : undefined);
  const { data: siblings = [], isLoading: siblingsLoading } = useHistoricalSiblings(siblingsMode ? fmd?.histSourceName : undefined, fmd?.id);
  const { data: objects = [] } = useMigrationObjects();
  const { data: fieldNotes = [] } = useFmdFieldNotes(fmd?.id);
  const fieldNoteMutations = useFmdFieldNoteMutations(fmd?.id ?? '');
  const canAddNote = !!user?.email && !!fmd?.owner && user.email === fmd.owner;

  useEffect(() => {
    setTab('mapping');
    setSelectedId(versions[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmd?.id, versions.length]);

  const sortedVersions = useMemo(
    () => (sortDir === 'newest' ? versions : [...versions].reverse()),
    [versions, sortDir],
  );
  const latest = versions[0];
  const selected = versions.find((v) => v.id === selectedId) ?? latest;
  useEffect(() => { setRawTab('source'); setOpenField(null); }, [selected?.id]);
  useEffect(() => {
    setSeverityFilter([]); setStructureFilter([]); setFieldFilter([]); setFindingSearch('');
  }, [selected?.id]);
  // `versions` is newest-first, so the version right after the selected one in that array is the
  // one immediately before it in time — what the selected version's changes are diffed against.
  const selectedIndex = versions.findIndex((v) => v.id === selected?.id);
  const previousVersion = selectedIndex >= 0 ? versions[selectedIndex + 1] : undefined;
  const changedCellsByTable = useMemo(
    () => diffTablesByStructure(previousVersion?.sheets.generatedTables, selected?.sheets.generatedTables),
    [previousVersion, selected],
  );
  // Review findings are keyed by (structureId, rowIndex) as stored — resolved here against the
  // selected version's actual rows into (structureId, rowKey, field) so a re-sort in the table view
  // can't misalign a finding onto the wrong row.
  const reviewFindingsByTable = useMemo(() => {
    const findings = selected?.sheets.mappingReview?.findings;
    const tables = selected?.sheets.generatedTables;
    if (!findings?.length || !tables?.length) return undefined;
    const byTable = new Map<string, Map<string, Map<string, ReviewCellFinding>>>();
    for (const f of findings) {
      if (!f.field) continue;
      const table = tables.find((t) => t.structureId === f.structureId);
      const row = table?.rows[f.rowIndex];
      if (!table || !row) continue;
      const rk = rowKey(row, f.rowIndex);
      const byRow = byTable.get(f.structureId) ?? new Map<string, Map<string, ReviewCellFinding>>();
      const byField = byRow.get(rk) ?? new Map<string, ReviewCellFinding>();
      byField.set(f.field, { severity: f.severity, issue: f.issue });
      byRow.set(rk, byField);
      byTable.set(f.structureId, byRow);
    }
    return byTable.size > 0 ? byTable : undefined;
  }, [selected]);
  const openTable = openField ? selected?.sheets.generatedTables?.find((t) => t.structureId === openField.structureId) : undefined;
  const openRow = openTable?.rows[openField?.rowIndex ?? -1];
  const openRowKeyValue = openField && openRow ? rowKey(openRow, openField.rowIndex) : undefined;
  const openFindings = openField && openRowKeyValue ? reviewFindingsByTable?.get(openField.structureId)?.get(openRowKeyValue) : undefined;
  const openNotes = useMemo(
    () => (openField && openRowKeyValue ? fieldNotes.filter((n) => n.structureId === openField.structureId && n.rowKey === openRowKeyValue) : []),
    [fieldNotes, openField, openRowKeyValue],
  );
  const allFindings = selected?.sheets.mappingReview?.findings ?? [];
  const structureOptions = useMemo(() => [...new Set(allFindings.map((f) => f.structureIdent))], [allFindings]);
  const fieldOptions = useMemo(() => [...new Set(allFindings.map((f) => f.field).filter((f): f is string => !!f))], [allFindings]);
  const filteredFindings = useMemo(() => {
    const q = findingSearch.trim().toLowerCase();
    return allFindings.filter((f) => {
      if (severityFilter.length > 0 && !severityFilter.includes(f.severity)) return false;
      if (structureFilter.length > 0 && !structureFilter.includes(f.structureIdent)) return false;
      if (fieldFilter.length > 0 && !(f.field && fieldFilter.includes(f.field))) return false;
      if (!q) return true;
      return [f.structureIdent, f.field, f.srcField, f.tgtField, f.issue].some((v) => v?.toLowerCase().includes(q));
    });
  }, [allFindings, severityFilter, structureFilter, fieldFilter, findingSearch]);
  const findingFiltersActive = severityFilter.length > 0 || structureFilter.length > 0 || fieldFilter.length > 0 || findingSearch !== '';
  // Oldest first, for the exported Version History sheet — the on-screen list stays independently
  // sortable (sortedVersions) but the export always reads the same way regardless of that toggle.
  const exportVersions = useMemo(
    () => [...versions].reverse().map((v) => ({ version: v.version, changedBy: v.createdBy, changedAt: v.createdAt, comment: v.comment })),
    [versions],
  );

  if (!fmd) return null;

  const object = objects.find((o) => o.id === fmd.migrationObjectId);
  const isGoldenStructure = !!selected?.sheets.goldenStructure;
  const isGenerated = !!selected?.sheets.generatedColumns?.length && !!selected?.sheets.generatedTables?.length;
  const tableCount = selected?.sheets.generatedTables?.length ?? 0;
  const rawRows = selected ? (selected.sheets[rawTab] ?? []) : [];

  const handleExport = async () => {
    if (!selected) return;
    setExporting(true);
    try {
      if (isGoldenStructure) {
        await exportGoldenFmdToExcel(fmd.name, selected.sheets.goldenStructure!);
      } else if (isGenerated) {
        await exportGeneratedFmdToExcel(
          {
            fmdName: fmd.name, fmdDisplayId: fmd.displayId, objectId: object?.objectId, objectDescription: object?.description,
            migrationObjectUuid: object?.id,
            klass: fmd.class, type: fmd.type, reference: fmd.reference, versionLabel: selected.version,
            createdBy: selected.createdBy, createdAt: selected.createdAt,
            goldenVersionLabel: fmd.goldenVersionLabel, goldenOutdated: fmd.goldenOutdated, versions: exportVersions,
            mappingReview: selected.sheets.mappingReview,
          },
          selected.sheets.generatedColumns!, selected.sheets.generatedTables!,
        );
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Could not export this FMD.');
    } finally {
      setExporting(false);
    }
  };

  const handleReviewMapping = async () => {
    if (!selected || !isGenerated) return;
    setReviewing(true);
    setTab('versions');
    try {
      const findings = await reviewMapping(selected.sheets.generatedColumns!, selected.sheets.generatedTables!);
      await saveMappingReview(selected.id, selected.sheets, findings);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not run the mapping review.');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <Dialog open={!!fmd} onClose={onClose} title={fmd.name} subtitle={fmdAuditLine(fmd)} size="win">
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-1 border-b border-line mb-3.5 shrink-0">
          <button
            onClick={() => setTab('mapping')}
            className={clsx('px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px', tab === 'mapping' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
          >
            Field Mapping
            {tableCount > 1 && <span className="text-2xs text-muted ml-1.5">{tableCount} structures</span>}
          </button>
          <button
            onClick={() => setTab('versions')}
            className={clsx('px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px', tab === 'versions' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
          >
            {isCustomFmd ? 'Versions & Review' : 'Versions'} <span className="text-2xs text-muted">({versions.length})</span>
            {isCustomFmd && selected?.sheets.mappingReview && selected.sheets.mappingReview.findings.length > 0 && (
              <Tag variant="danger" className="ml-1.5">{selected.sheets.mappingReview.findings.length}</Tag>
            )}
          </button>
          <button
            onClick={() => setTab('whereUsed')}
            className={clsx('px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px', tab === 'whereUsed' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
          >
            Where-used
          </button>
          <div className="ml-auto flex items-center gap-2">
            {/* One version selector for the whole dialog — the Field Mapping tab (table and
                field-level view alike) always renders whatever is picked here, so there's a single
                answer to "which version am I looking at" no matter which tab is open. */}
            {versions.length > 0 && (
              <label className="flex items-center gap-1.5 text-2xs text-muted">
                Version
                <select
                  value={selected?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}
                  className="text-sm2 font-mono font-bold text-blue-deep bg-blue-pale px-2 py-1 rounded-[8px] border border-[#d6dbe2]"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>{v.version}{v.id === latest?.id ? ' · latest' : ''}</option>
                  ))}
                </select>
              </label>
            )}
            {isCustomFmd && (
              <div className="flex items-center gap-1.5 text-2xs text-muted mr-1">
                <UserCircle2 size={13} />
                {fmd.owner ? (
                  <>
                    <span>Owner <span className="font-semibold text-text">{fmd.owner}</span></span>
                    {user?.email === fmd.owner && (
                      <button
                        disabled={settingOwner}
                        onClick={async () => { setSettingOwner(true); try { await setOwner(fmd.id, null); } finally { setSettingOwner(false); } }}
                        className="font-semibold text-blue hover:underline disabled:opacity-50"
                      >
                        Release
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    disabled={settingOwner || !user?.email}
                    onClick={async () => { if (!user?.email) return; setSettingOwner(true); try { await setOwner(fmd.id, user.email); } finally { setSettingOwner(false); } }}
                    className="font-semibold text-blue hover:underline disabled:opacity-50"
                  >
                    Claim ownership
                  </button>
                )}
              </div>
            )}
            <ToolbarButton onClick={handleExport} disabled={exporting || !selected || (!isGoldenStructure && !isGenerated)}>
              <Download size={14} /> {exporting ? 'Exporting…' : 'Export to Excel'}
            </ToolbarButton>
            {isCustomFmd && (
              <AiButton onClick={handleReviewMapping} disabled={reviewing || !selected || !isGenerated}>
                <Sparkles size={14} /> {reviewing ? 'Reviewing…' : 'Review Mapping'}
              </AiButton>
            )}
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="flex-1 min-h-0">
            {tab === 'mapping' ? (
              <div className="h-full min-h-0">
                <div className="h-full min-w-0 overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
                  {isGoldenStructure ? (
                    <GoldenFmdStructureView structure={selected!.sheets.goldenStructure!} />
                  ) : isGenerated && openField && openTable ? (
                    <div className="h-full p-2">
                      <FieldDetailView
                        columns={selected!.sheets.generatedColumns!} tables={selected!.sheets.generatedTables!}
                        structureId={openField.structureId} rowIndex={openField.rowIndex}
                        onOpen={(structureId, rowIndex) => setOpenField({ structureId, rowIndex })}
                        onBack={() => setOpenField(null)}
                        findings={openFindings} notes={openNotes} canAddNote={canAddNote}
                        onAddNote={async (tagVal, body) => { if (openRowKeyValue) await fieldNoteMutations.add(openField.structureId, openRowKeyValue, tagVal, body); }}
                        onToggleResolved={(noteId, resolved) => fieldNoteMutations.setResolved(noteId, resolved)}
                      />
                    </div>
                  ) : isGenerated ? (
                    <div className="h-full p-2">
                      <GeneratedFmdTableView
                        columns={selected!.sheets.generatedColumns!} tables={selected!.sheets.generatedTables!}
                        changedCellsByTable={changedCellsByTable} reviewFindingsByTable={reviewFindingsByTable}
                        onOpenField={(structureId, rowIndex) => setOpenField({ structureId, rowIndex })}
                      />
                    </div>
                  ) : selected && (selected.sheets.source?.length || selected.sheets.target?.length || selected.sheets.mapping?.length) ? (
                    <div className="h-full flex flex-col">
                      <div className="flex items-center gap-1 border-b border-line mb-3 shrink-0 px-2 pt-2">
                        {(Object.keys(SHEET_COLUMNS) as SheetKey[]).map((key) => (
                          <button
                            key={key} onClick={() => setRawTab(key)}
                            className={clsx('px-3.5 py-2 text-sm font-semibold border-b-2 -mb-px', rawTab === key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
                          >
                            {SHEET_LABEL[key]} <span className="text-2xs text-muted">({(selected.sheets[key] ?? []).length})</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex-1 overflow-auto px-2 pb-2">
                        <table className="w-full border-collapse text-sm2">
                          <thead>
                            <tr>
                              {SHEET_COLUMNS[rawTab].map((c) => (
                                <th key={c} className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-2.5 py-2 sticky top-0 text-left">{c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rawRows.length === 0 && (
                              <tr><td colSpan={SHEET_COLUMNS[rawTab].length} className="px-2.5 py-6 text-center text-muted text-sm">No rows on this sheet.</td></tr>
                            )}
                            {rawRows.map((row, i) => (
                              <tr key={i} className="border-t border-line">
                                {SHEET_COLUMNS[rawTab].map((c) => <td key={c} className="px-2.5 py-1.5 text-sm2">{row[c] || '—'}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted py-8 text-center">No data recorded for this version.</p>
                  )}
                </div>
              </div>
            ) : tab === 'versions' ? (
              <div className="h-full flex gap-4 min-h-0">
                {/* Version list + that version's who/when/state/comment — moved here off the Field
                    Mapping tab so the mapping data gets the full dialog width, with the header's
                    version selector keeping both tabs pointed at the same version. */}
                <div className={clsx('shrink-0 flex flex-col gap-3 min-h-0', isCustomFmd ? 'w-[300px]' : 'w-[340px]')}>
                  <VersionListNav
                    className="flex-1" sortedVersions={sortedVersions} selectedId={selected?.id} latestId={latest?.id}
                    sortDir={sortDir} onToggleSort={() => setSortDir((d) => (d === 'newest' ? 'oldest' : 'newest'))} onSelect={setSelectedId}
                  />
                  {isCustomFmd && <VersionDetailsPane fmd={fmd} selected={selected} className="flex-1" />}
                </div>
                {!isCustomFmd ? (
                  <VersionDetailsPane fmd={fmd} selected={selected} className="flex-1 min-w-0" />
                ) : (
                <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3">
                  {!selected ? (
                    <p className="text-sm text-muted">Select a version to review.</p>
                  ) : !isGenerated ? (
                    <p className="text-sm text-muted py-8 text-center">This version has no generated mapping data to review.</p>
                  ) : reviewing ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <Sparkles size={26} className="text-violet-deep animate-pulse" />
                      <p className="text-sm font-semibold text-text">Reviewing mapping…</p>
                      <p className="text-2xs text-muted">Checking completeness and mapping-type rules for every row. This can take a while for a large FMD.</p>
                    </div>
                  ) : !selected.sheets.mappingReview ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                      <p className="text-sm text-muted">This version hasn't been reviewed yet.</p>
                      <p className="text-2xs text-muted">Click "Review Mapping" above to check it against the mapping rule policy.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3 shrink-0 flex-wrap">
                        <p className="text-2xs text-muted">
                          Reviewed by <span className="font-semibold text-text">{selected.sheets.mappingReview.reviewedBy}</span> on {fmtDateTime(selected.sheets.mappingReview.reviewedAt)}
                        </p>
                        {allFindings.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <MultiSelectFilter label="Message type" options={['error', 'warning']} selected={severityFilter} onChange={setSeverityFilter} />
                            <MultiSelectFilter label="Structure" options={structureOptions} selected={structureFilter} onChange={setStructureFilter} />
                            <MultiSelectFilter label="Field" options={fieldOptions} selected={fieldFilter} onChange={setFieldFilter} />
                            <ToolbarSearch value={findingSearch} onChange={setFindingSearch} placeholder="Search source field, structure, issue…" />
                          </div>
                        )}
                      </div>
                      {allFindings.length === 0 ? (
                        <p className="text-sm font-semibold text-green py-8 text-center">✓ No issues found — every row complies with the mapping rule policy.</p>
                      ) : (
                        <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-2">
                          {filteredFindings.length === 0 && (
                            <p className="text-sm text-muted py-8 text-center">
                              {findingFiltersActive ? 'No findings match these filters.' : 'No findings.'}
                            </p>
                          )}
                          {filteredFindings.map((f, i) => (
                            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-[8px] shadow-[inset_0_0_0_1px_var(--line)] shrink-0">
                              <Tag variant={f.severity === 'error' ? 'danger' : 'warn'} className="shrink-0 mt-0.5">{f.severity}</Tag>
                              <div className="text-sm2 min-w-0">
                                <span className="font-mono font-bold">{f.structureIdent}</span>
                                {f.field && <span className="text-muted"> · {f.field}</span>}
                                {(f.srcField || f.tgtField) && <span className="text-muted"> · {f.srcField || f.tgtField}</span>}
                                <div className="text-text">{f.issue}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                )}
              </div>
            ) : (
              <div className="h-full overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
                {goldenMode ? (
                  whereUsedLoading ? (
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
                  )
                ) : siblingsLoading ? (
                  <p className="text-sm text-muted p-4">Loading…</p>
                ) : !fmd.histSourceName ? (
                  <p className="text-sm text-muted p-8 text-center">This FMD wasn't produced by the AI historical converter, so there's no tracked source to find siblings from.</p>
                ) : siblings.length === 0 ? (
                  <p className="text-sm text-muted p-8 text-center">No other plants from the same source (<span className="font-mono">{fmd.histSourceName}</span>) yet.</p>
                ) : (
                  <table className="w-full border-collapse text-sm2">
                    <thead>
                      <tr>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3 py-2 text-left sticky top-0">ID</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3 py-2 text-left sticky top-0">Name</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3 py-2 text-left sticky top-0">Plant</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3 py-2 text-left sticky top-0">Reference</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-[#eef1f5] px-3 py-2 text-left sticky top-0">Version</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siblings.map((r) => (
                        <tr key={r.fmdId} className="border-t border-line">
                          <td className="px-3 py-2 font-mono">{r.displayId ?? '—'}</td>
                          <td className="px-3 py-2">{r.name}</td>
                          <td className="px-3 py-2 font-mono">{r.plant ?? '—'}</td>
                          <td className="px-3 py-2 font-mono">{r.reference}</td>
                          <td className="px-3 py-2 font-mono">{r.version ?? '—'}</td>
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

/** Who/when/state/comment for the selected version, plus which Golden/Reference version it was
 * built from. Lives on the Versions tab (under the version list for Custom FMDs, beside it for
 * everything else) rather than next to the mapping data, so the Field Mapping tab is nothing but
 * the mapping itself. */
function VersionDetailsPane({ fmd, selected, className }: { fmd: LibraryFmdRow; selected?: FmdVersion; className?: string }) {
  return (
    <div className={clsx('min-h-0 overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--line)] p-3.5', className)}>
      {selected ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-sm2 text-blue-deep w-fit bg-blue-pale px-2 py-0.5 rounded">{selected.version}</span>
            <Tag variant={STATE_VARIANT[selected.state]}>{selected.state}</Tag>
          </div>
          <div className="text-sm2"><span className="text-muted">Edited by</span> <span className="font-semibold">{selected.createdBy ?? '—'}</span></div>
          <div className="text-sm2"><span className="text-muted">On</span> {fmtDateTime(selected.createdAt)}</div>
          {selected.approvedBy && <div className="text-sm2"><span className="text-muted">Approved by</span> <span className="font-semibold">{selected.approvedBy}</span> · {fmtDateTime(selected.approvedAt)}</div>}
          {!!selected.sheets.generatedTables?.length && (
            <div className="text-sm2 flex items-center gap-1.5 flex-wrap">
              <span className="text-muted">Structures</span>
              {selected.sheets.generatedTables.map((t) => (
                <Tag key={t.structureId} variant="table" title={t.structureDescription}>{t.structureIdent}</Tag>
              ))}
            </div>
          )}
          {(fmd.goldenVersionLabel || fmd.standardRefVersionLabel) && (
            <div className="border-t border-line pt-2.5 flex flex-col gap-1">
              {fmd.goldenVersionLabel && (
                <div className="text-sm2 flex items-center gap-1.5">
                  <span className="text-muted">Golden FMD</span> <span className="font-mono font-semibold">{fmd.goldenVersionLabel}</span>
                  {fmd.goldenOutdated && <Tag variant="warn">Outdated</Tag>}
                </div>
              )}
              {fmd.standardRefVersionLabel && (
                <div className="text-sm2 flex items-center gap-1.5">
                  <span className="text-muted">Reference FMD</span> <span className="font-mono font-semibold">{fmd.standardRefVersionLabel}</span>
                  {fmd.standardRefOutdated && <Tag variant="warn">Outdated</Tag>}
                </div>
              )}
            </div>
          )}
          <div>
            <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1">Comment</div>
            <p className="text-sm2 whitespace-pre-wrap">{selected.comment || 'No comment provided'}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Select a version to see its details.</p>
      )}
    </div>
  );
}

/** The version list — sort toggle + one row per version. Selecting here is the same state the
 * header's version dropdown drives, so the Field Mapping tab follows along immediately. */
function VersionListNav({ sortedVersions, selectedId, latestId, sortDir, onToggleSort, onSelect, className }: {
  sortedVersions: FmdVersion[]; selectedId?: string; latestId?: string; sortDir: SortDir;
  onToggleSort: () => void; onSelect: (id: string) => void; className?: string;
}) {
  return (
    <div className={clsx('flex flex-col rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden min-h-0', className)}>
      <button
        onClick={onToggleSort}
        className="flex items-center gap-1.5 text-2xs font-semibold text-muted hover:text-text px-3 py-1.5 border-b border-line shrink-0"
      >
        {sortDir === 'newest' ? <ArrowDownAZ size={12} /> : <ArrowUpAZ size={12} />}
        {sortDir === 'newest' ? 'Newest first' : 'Oldest first'}
      </button>
      <div className="flex-1 min-h-0 overflow-auto">
        {sortedVersions.length === 0 && <p className="text-sm text-muted p-3">No versions yet.</p>}
        {sortedVersions.map((v) => (
          <button
            key={v.id} onClick={() => onSelect(v.id)}
            className={clsx('w-full text-left px-3 py-2 border-b border-line last:border-b-0', v.id === selectedId ? 'bg-blue-pale' : 'hover:bg-surface-2')}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm2 text-blue-deep">{v.version}</span>
              {v.id === latestId && <span className="text-2xs text-muted">latest</span>}
            </div>
            <div className="text-2xs text-muted truncate">{v.comment || 'No comment provided'}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

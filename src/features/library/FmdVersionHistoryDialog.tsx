import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../components/Select';
import { Button } from '../../components/Button';
import clsx from 'clsx';
import { CheckCircle2, Download, Sparkles } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { Tag } from '../../components/Tag';
import { MultiSelectFilter } from '../../components/MultiSelectFilter';
import { ToolbarSearch } from '../../components/ToolbarSearch';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../lib/auth';
import { canPublish } from '../../lib/rbac';
import { useCurrentRole } from '../../lib/queries/memberships';
import { useDefaultProgram } from '../../lib/queries/programme';
import { useEditFmdField, useFmdVersions, useGoldenFmdSummary, useGoldenWhereUsed, useHistoricalSiblings, useLatestFmdVersion, usePublishFmdVersion, type LibraryFmdRow } from '../../lib/queries/fmds';
import { useFmdFieldNotes, useFmdFieldNoteMutations } from '../../lib/queries/fmdFieldNotes';
import { useMigrationObjects, useScopeObjectOwners, scopeOwnerKey } from '../../lib/queries/scope';
import { diffTablesByStructure, rowKey, summariseVersionChange } from '../../lib/rowDiff';
import { useMappingReview, readMappingReviews } from '../../lib/queries/mappingReview';
import { fmtDateTime, fmdAuditLine } from '../../lib/format';
import { exportGeneratedFmdToExcel } from '../../lib/generatedFmdExport';
import { exportGoldenFmdToExcel } from '../../lib/goldenFmdExport';
import { GoldenFmdStructureView } from './GoldenFmdStructureView';
import { GeneratedFmdTableView, type ReviewCellFinding } from './GeneratedFmdTableView';
import { FieldDetailView } from './FieldDetailView';
import { AddReviewPointDialog, type ReviewPointTarget } from './AddReviewPointDialog';
import { ReviewPointThread } from './ReviewPointThread';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Pane } from '../../components/Pane';
import { SyncGoldenFmdDialog } from './SyncGoldenFmdDialog';
import { REVIEW_POINT_CATEGORIES } from '../../lib/reviewPointCategories';
import type { FmdFieldNote, FmdVersion, GovState, MappingReviewFinding } from '../../types/entities';

type Tab = 'mapping' | 'draft' | 'versions' | 'whereUsed';
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
 *  - Versions (& Review): that version's who/when/state/comment, and — Custom
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
  const [rawTab, setRawTab] = useState<SheetKey>('source');
  const [exporting, setExporting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [structureFilter, setStructureFilter] = useState<string[]>([]);
  const [fieldFilter, setFieldFilter] = useState<string[]>([]);
  const [findingSearch, setFindingSearch] = useState('');
  const [openField, setOpenField] = useState<{ structureId: string; rowIndex: number } | null>(null);
  const [pointTarget, setPointTarget] = useState<ReviewPointTarget | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [selectedChanges, setSelectedChanges] = useState<string[]>([]);
  const [syncOpen, setSyncOpen] = useState(false);
  /** Closed points are HIDDEN by default, not collapsed. On an FMD with a long review history the
   * done items are the majority, and a list of mostly-settled work buries the few things still
   * outstanding. They stay one click away rather than gone. */
  const [showClosedPoints, setShowClosedPoints] = useState(false);
  const { publish: publishVersion } = usePublishFmdVersion();
  const { saveField } = useEditFmdField(fmd?.id ?? '');
  const { review: reviewMapping, save: saveMappingReview } = useMappingReview();
  const { user } = useAuth();
  const isCustomFmd = fmd?.type === 'Custom';
  const goldenMode = fmd?.type === 'Golden';
  const siblingsMode = !goldenMode;
  const { data: whereUsed = [], isLoading: whereUsedLoading } = useGoldenWhereUsed(goldenMode ? fmd?.id : undefined, goldenMode ? versions[0]?.id : undefined);
  const { data: siblings = [], isLoading: siblingsLoading } = useHistoricalSiblings(siblingsMode ? fmd?.histSourceName : undefined, fmd?.id);
  const { data: objects = [] } = useMigrationObjects();
  const { data: scopeOwners = new Map<string, string>() } = useScopeObjectOwners();
  const { data: goldenSummary } = useGoldenFmdSummary();
  const { data: goldenLatest } = useLatestFmdVersion(fmd?.goldenOutdated ? goldenSummary?.id : undefined);
  const { data: fieldNotes = [] } = useFmdFieldNotes(fmd?.id);
  const fieldNoteMutations = useFmdFieldNoteMutations(fmd?.id ?? '');
  /** Raising and replying to review points is open to anyone with access to the FMD — review is a
   * collaborative act, and RLS already limits who can reach the FMD at all. Ownership gates
   * *editing* the mapping and publishing a version, not commenting on it. */
  const canAddNote = !!user?.email;
  /** Owner comes from the scope register (who owns this migration object in this subproject), not
   * from the FMD itself — see useScopeObjectOwners. Publishing is the owner's call. */
  const owner = scopeOwners.get(scopeOwnerKey(fmd?.subprojectId, fmd?.migrationObjectId));
  const isOwner = !!user?.email && !!owner && user.email === owner;
  const { data: defaultProgram } = useDefaultProgram();
  const { data: role = 'guest' } = useCurrentRole(defaultProgram?.id, fmd?.subprojectId);
  /** Publishing is the owner's call OR a governance role's — see canPublish. Gating on ownership
   * alone meant an object with no owner assigned in scope could never be published by anyone. */
  const mayPublish = canPublish(role, isOwner);
  /** Publishing and the AI mapping review both WRITE `sheets` on the same version row — a review
   * finishing after a publish would either be lost or land on a version that is now frozen. They're
   * mutually exclusive rather than merely discouraged, and the disabled control says which one is
   * running so it doesn't read as a bug. */
  const versionBusy = reviewing || publishing;
  const busyReason = reviewing ? 'A mapping review is running.' : publishing ? 'Publishing is in progress.' : '';

  useEffect(() => {
    setTab('mapping');
    setSelectedId(versions[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmd?.id, versions.length]);

  const latest = versions[0];
  /** The unpublished working version, if there is one. Null once everything is published. */
  const draftVersion = latest && !latest.publishedAt ? latest : undefined;
  /** What the draft would change for everyone else — i.e. versus the newest PUBLISHED version,
   * not merely the one before it. That's the question "should I publish this?" actually asks. */
  const lastPublished = versions.find((v) => !!v.publishedAt);
  const pendingChanges = draftVersion?.sheets.pendingChanges ?? [];
  useEffect(() => { setSelectedChanges(pendingChanges.map((c) => c.id)); }, [draftVersion?.id, pendingChanges.length]);
  const draftChangeSummary = draftVersion
    ? summariseVersionChange(lastPublished?.sheets.generatedTables, draftVersion.sheets.generatedTables)
    : null;
  const selected = versions.find((v) => v.id === selectedId) ?? latest;
  useEffect(() => { setRawTab('source'); setOpenField(null); }, [selected?.id]);
  useEffect(() => {
    setSeverityFilter([]); setStructureFilter([]); setFieldFilter([]); setFindingSearch('');
    setSelectedReviewId(null);
  }, [selected?.id]);
  // A version can be reviewed many times; null means "the most recent run", so a fresh review is
  // shown automatically without having to re-pick it.
  const reviews = useMemo(() => readMappingReviews(selected?.sheets), [selected]);
  const activeReview = reviews.find((r) => r.id && r.id === selectedReviewId) ?? reviews[reviews.length - 1];
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
    const findings = activeReview?.findings;
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
  // Notes are stored against (structureId, rowKey) and are version-independent, so they're resolved
  // against whichever version is on screen to recover a readable field label. A note whose row no
  // longer exists in this version still shows — with its raw row key — rather than silently
  // vanishing, since "the row this was written about is gone" is itself worth seeing.
  const resolvedNotes = useMemo(() => {
    const tables = selected?.sheets.generatedTables ?? [];
    const labelByKey = new Map<string, { structureIdent: string; label: string }>();
    for (const t of tables) {
      t.rows.forEach((r, i) => {
        labelByKey.set(`${t.structureId}::${rowKey(r, i)}`, {
          structureIdent: t.structureIdent,
          label: r.SRC_FIELD || r.TGT_FIELD || `Row ${i + 1}`,
        });
      });
    }
    // Top-level points only — replies render inside their parent's thread, not as list entries.
    return fieldNotes.filter((n) => !n.parentId && (showClosedPoints || !n.resolved)).map((n) => {
      const hit = labelByKey.get(`${n.structureId}::${n.rowKey}`);
      return { note: n, structureIdent: hit?.structureIdent, label: hit?.label ?? n.rowKey, orphaned: !hit };
    });
  }, [fieldNotes, selected, showClosedPoints]);
  const closedPointCount = fieldNotes.filter((n) => !n.parentId && n.resolved).length;
  /** structureId -> rowKey -> fields carrying a point, for the table's corner markers. */
  const reviewPointCellsByTable = useMemo(() => {
    const byTable = new Map<string, Map<string, Set<string>>>();
    for (const n of fieldNotes) {
      if (!n.field) continue;
      const byRow = byTable.get(n.structureId) ?? new Map<string, Set<string>>();
      const fields = byRow.get(n.rowKey) ?? new Set<string>();
      fields.add(n.field);
      byRow.set(n.rowKey, fields);
      byTable.set(n.structureId, byRow);
    }
    return byTable.size > 0 ? byTable : undefined;
  }, [fieldNotes]);
  const allFindings = activeReview?.findings ?? [];
  const errorCount = allFindings.filter((f) => f.severity === 'error').length;
  const warningCount = allFindings.length - errorCount;
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
            mappingReview: readMappingReviews(selected.sheets).slice(-1)[0],
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

  /** Edits always target the LATEST version — editing a superseded one would create a fork nobody
   * would ever see. If that version is published, saveField forks a fresh draft and we follow the
   * selection to it so the edit stays visible. */
  const handleSaveField = async (structureId: string, rowIndex: number, field: string, value: string) => {
    if (!latest || !fmd) return;
    try {
      const res = await saveField({ structureId, rowIndex, field, value });
      if (res.createdDraft) {
        setSelectedId(res.versionId);
        toast.success(`${latest.version} is published, so your changes are collecting in draft ${res.version}.`);
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Could not save that change.');
    }
  };

  const handlePublish = async () => {
    if (!draftVersion || !fmd) return;
    if (reviewing) { toast.error('Wait for the mapping review to finish before publishing.'); return; }
    setPublishing(true);
    try {
      const res = await publishVersion({
        draft: draftVersion, fmdId: fmd.id, selectedChangeIds: selectedChanges, basePublished: lastPublished,
      });
      setConfirmPublish(false);
      setTab('versions');
      toast.success(res.remaining > 0
        ? `${res.published} published. ${res.remaining} change${res.remaining === 1 ? '' : 's'} kept in a new draft.`
        : `${res.published} published — its content is now frozen.`);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not publish this version.');
    } finally {
      setPublishing(false);
    }
  };

  /** Opens the field-level view on the row a finding points at. The finding stores a row INDEX
   * against the version it was run on, which is exactly what the detail view navigates by, so this
   * needs no re-resolution — but it's guarded anyway, since a finding can outlive the row if the
   * version it was saved against isn't the one on screen. */
  const goToFinding = (f: MappingReviewFinding) => {
    const table = selected?.sheets.generatedTables?.find((t) => t.structureId === f.structureId);
    if (!table?.rows[f.rowIndex]) {
      toast.error('That row is not part of the version currently selected.');
      return;
    }
    setOpenField({ structureId: f.structureId, rowIndex: f.rowIndex });
    setTab('mapping');
  };

  /** Always reviews the LATEST version, never whichever one happens to be selected — reviewing a
   * superseded version and saving findings onto it produces a review nobody will act on, and the
   * selector makes that easy to do by accident. Selection follows along so the result is visible. */
  const handleReviewMapping = async () => {
    const target = latest;
    if (!target?.sheets.generatedColumns?.length || !target.sheets.generatedTables?.length) return;
    if (publishing) { toast.error('Wait for publishing to finish before running a review.'); return; }
    setReviewing(true);
    setSelectedId(target.id);
    setTab('versions');
    try {
      const findings = await reviewMapping(target.sheets.generatedColumns, target.sheets.generatedTables);
      await saveMappingReview(target.id, target.sheets, findings);
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
            className={clsx('px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px', tab === 'mapping' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
          >
            Field Mapping
          </button>
          {draftVersion && (
            <button
              onClick={() => setTab('draft')}
              className={clsx('px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px flex items-center gap-1.5', tab === 'draft' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
            >
              Draft <Tag variant="danger" size="sm">{draftVersion.version}</Tag>
            </button>
          )}
          <button
            onClick={() => setTab('versions')}
            className={clsx('px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px', tab === 'versions' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
          >
            {/* No counts on the tab labels. The structure count, version count, finding count and
                open-point count are all already stated inside their own panes, where they sit next
                to the thing they describe — repeating them here made the tab strip read as a
                dashboard and pushed the labels apart for no added information. */}
            {isCustomFmd ? 'Versions & Review' : 'Versions'}
          </button>
          <button
            onClick={() => setTab('whereUsed')}
            className={clsx('px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px', tab === 'whereUsed' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
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
                <Select
                  value={selected?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}
                  size="sm" mono
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>{v.version}{v.id === latest?.id ? ' · latest' : ''}</option>
                  ))}
                </Select>
              </label>
            )}
            <Button variant="quiet" size="sm" onClick={handleExport} disabled={exporting || !selected || (!isGoldenStructure && !isGenerated)}>
              <Download size={14} /> {exporting ? 'Exporting…' : 'Export to Excel'}
            </Button>
            {isCustomFmd && (
              <Button variant="ai" size="sm"
                onClick={handleReviewMapping}
                disabled={versionBusy || !latest?.sheets.generatedTables?.length}
                title={publishing ? busyReason : latest ? `Reviews ${latest.version}, the latest version` : undefined}
              >
                <Sparkles size={14} /> {reviewing ? 'Reviewing…' : 'Review Latest Version'}
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm2 text-muted">Loading…</p>
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
                        canEdit={isCustomFmd && selected?.id === latest?.id}
                        onSaveField={handleSaveField}
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
                        reviewPointCellsByTable={reviewPointCellsByTable}
                        onAddReviewPoint={(structureId, rowIndex, field) => {
                          const t = selected!.sheets.generatedTables!.find((x) => x.structureId === structureId);
                          const r = t?.rows[rowIndex];
                          if (!t || !r) return;
                          setPointTarget({
                            structureId, structureIdent: t.structureIdent, rowKey: rowKey(r, rowIndex),
                            rowLabel: r.SRC_FIELD || r.TGT_FIELD || `Row ${rowIndex + 1}`,
                            field, value: r[field],
                          });
                        }}
                      />
                    </div>
                  ) : selected && (selected.sheets.source?.length || selected.sheets.target?.length || selected.sheets.mapping?.length) ? (
                    <div className="h-full flex flex-col">
                      <div className="flex items-center gap-1 border-b border-line mb-3 shrink-0 px-2 pt-2">
                        {(Object.keys(SHEET_COLUMNS) as SheetKey[]).map((key) => (
                          <button
                            key={key} onClick={() => setRawTab(key)}
                            className={clsx('px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px', rawTab === key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
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
                                <th key={c} className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-2.5 py-2 sticky top-0 text-left">{c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rawRows.length === 0 && (
                              <tr><td colSpan={SHEET_COLUMNS[rawTab].length} className="px-2.5 py-6 text-center text-muted text-sm2">No rows on this sheet.</td></tr>
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
                    <p className="text-sm2 text-muted py-8 text-center">No data recorded for this version.</p>
                  )}
                </div>
              </div>
            ) : tab === 'draft' ? (
              <div className="h-full flex gap-4 min-h-0">
                {/* The changes ARE the content of this tab, so they get the space and the metadata
                    is reduced to a sidebar. The earlier layout led with version/author/comment and
                    pushed the list — the only thing you have to read to decide — below the fold. */}
                <Pane
                  title="Changes to publish" className="flex-1 min-w-0"
                  actions={
                    draftVersion && pendingChanges.length > 0 ? (
                      <>
                        <span className="text-2xs text-muted">{selectedChanges.length} of {pendingChanges.length} selected</span>
                        <button
                          onClick={() => setSelectedChanges(selectedChanges.length === pendingChanges.length ? [] : pendingChanges.map((c) => c.id))}
                          className="text-2xs font-semibold text-blue hover:underline ml-auto shrink-0"
                        >
                          {selectedChanges.length === pendingChanges.length ? 'Deselect all' : 'Select all'}
                        </button>
                      </>
                    ) : undefined
                  }
                >
                  {!draftVersion ? (
                    <p className="text-sm2 text-muted py-10 text-center">Everything is published — there are no unreleased changes.</p>
                  ) : pendingChanges.length === 0 ? (
                    <div className="p-4">
                      <p className="text-sm2 text-text">
                        {draftChangeSummary ?? 'This FMD has never been published — publishing releases it for the first time.'}
                      </p>
                      <p className="text-2xs text-muted mt-1.5">
                        This draft was generated rather than hand-edited, so it publishes as a whole.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {pendingChanges.map((c) => (
                        <label key={c.id} className="flex items-start gap-2.5 px-3 py-2.5 border-b border-line-soft last:border-b-0 cursor-pointer hover:bg-blue-pale">
                          <input
                            type="checkbox" className="w-3.5 h-3.5 accent-[var(--blue)] mt-0.5 shrink-0"
                            checked={selectedChanges.includes(c.id)}
                            onChange={() => setSelectedChanges((cur) => cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id])}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {c.structureIdent && <span className="text-sm2 font-mono font-semibold">{c.structureIdent}</span>}
                              <span className="text-sm2 font-mono text-muted">{c.rowLabel}</span>
                              <Tag variant="column" size="sm">{c.field}</Tag>
                              <span className="text-2xs text-muted ml-auto shrink-0">{c.by} · {fmtDateTime(c.at)}</span>
                            </div>
                            <div className="text-sm2 mt-1 flex items-baseline gap-1.5 flex-wrap">
                              <span className="text-red line-through decoration-1">{c.from || '—'}</span>
                              <span className="text-muted">→</span>
                              <span className="text-green font-semibold">{c.to || '—'}</span>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </Pane>

                {draftVersion && (
                  <Pane title="Draft" className="w-[300px] shrink-0" bodyClassName="p-3.5">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-semibold text-sm2 text-blue-deep bg-blue-pale px-2 py-0.5 rounded">{draftVersion.version}</span>
                        <Tag variant="danger" size="sm">Draft</Tag>
                      </div>
                      <div className="text-sm2"><span className="text-muted">Started by</span> <span className="font-semibold">{draftVersion.createdBy ?? '—'}</span></div>
                      <div className="text-sm2"><span className="text-muted">Last edit</span> {fmtDateTime(draftVersion.changedAt ?? draftVersion.createdAt)}</div>
                      {lastPublished && (
                        <div className="text-sm2"><span className="text-muted">Live now</span> <span className="font-mono font-semibold">{lastPublished.version}</span></div>
                      )}
                      {draftVersion.comment && (
                        <div>
                          <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1">Comment</div>
                          <p className="text-sm2 whitespace-pre-wrap">{draftVersion.comment}</p>
                        </div>
                      )}
                      <div className="border-t border-line pt-3 flex flex-col gap-2">
                        <Button
                          variant="primary" size="sm" className="w-full" onClick={() => setConfirmPublish(true)}
                          disabled={versionBusy || !mayPublish || (pendingChanges.length > 0 && selectedChanges.length === 0)}
                          title={reviewing ? busyReason : undefined}
                        >
                          <CheckCircle2 size={14} />
                          {pendingChanges.length > 0 ? `Publish ${selectedChanges.length} change${selectedChanges.length === 1 ? '' : 's'}` : `Publish ${draftVersion.version}`}
                        </Button>
                        <p className="text-2xs text-muted">
                          {reviewing
                            ? 'Waiting for the mapping review to finish — both write to the same version.'
                            : mayPublish
                            ? 'Publishing freezes this version — its mapping content can never be edited again.'
                            : `Only ${owner ?? 'the object owner (assign one in Scope > Criteria)'} or a programme lead can publish.`}
                        </p>
                      </div>
                    </div>
                  </Pane>
                )}
              </div>
            ) : tab === 'versions' ? (
              <div className="h-full flex gap-4 min-h-0">
                {/* Left: which version you're looking at (picked in the header dropdown) and its
                    audit trail. Right: the two kinds of review side by side — the AI's findings and
                    the points people wrote — since they're read together, not either/or. */}
                <VersionDetailsPane
                  fmd={fmd} selected={selected} owner={owner}
                  className={clsx('shrink-0', isCustomFmd ? 'w-[300px]' : 'flex-1 min-w-0')}
                  onSync={fmd.goldenOutdated ? () => setSyncOpen(true) : undefined}
                />
                {isCustomFmd && (
                <>
                <Pane
                  title="Auto review (AI)" className="flex-1 min-w-0" bodyClassName="p-3 flex flex-col gap-2.5"
                  actions={allFindings.length > 0 ? (
                    <>
                      {errorCount > 0 && <Tag variant="danger" size="sm">{errorCount} error{errorCount === 1 ? '' : 's'}</Tag>}
                      {warningCount > 0 && <Tag variant="warn" size="sm">{warningCount} warning{warningCount === 1 ? '' : 's'}</Tag>}
                    </>
                  ) : undefined}
                >
                  {!selected ? (
                    <p className="text-sm2 text-muted">Select a version to review.</p>
                  ) : !isGenerated ? (
                    <p className="text-sm2 text-muted py-8 text-center">This version has no generated mapping data to review.</p>
                  ) : reviewing ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <Sparkles size={26} className="text-violet-deep animate-pulse" />
                      <p className="text-sm2 font-semibold text-text">Reviewing mapping…</p>
                      <p className="text-2xs text-muted">Checking completeness and mapping-type rules for every row. This can take a while for a large FMD.</p>
                    </div>
                  ) : !activeReview ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                      <p className="text-sm2 text-muted">This version hasn't been reviewed yet.</p>
                      <p className="text-2xs text-muted">Click "Review Mapping" above to check it against the mapping rule policy.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3 shrink-0 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-2xs text-muted">
                            Reviewed by <span className="font-semibold text-text">{activeReview.reviewedBy}</span> on {fmtDateTime(activeReview.reviewedAt)}
                          </p>
                          {reviews.length > 1 && (
                            <Select
                              value={activeReview.id ?? ''} onChange={(e) => setSelectedReviewId(e.target.value || null)}
                              className="text-2xs px-2 py-1 rounded-[8px] border border-line-strong bg-surface"
                            >
                              {reviews.map((r, i) => (
                                <option key={r.id ?? i} value={r.id ?? ''}>
                                  Review {i + 1} of {reviews.length} · {fmtDateTime(r.reviewedAt)} · {r.findings.length} finding{r.findings.length === 1 ? '' : 's'}
                                </option>
                              ))}
                            </Select>
                          )}
                        </div>
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
                        <p className="text-sm2 font-semibold text-green py-8 text-center">✓ No issues found — every row complies with the mapping rule policy.</p>
                      ) : (
                        <div className="flex-1 min-h-0 overflow-auto flex flex-col">
                          {filteredFindings.length === 0 && (
                            <p className="text-sm2 text-muted py-8 text-center">
                              {findingFiltersActive ? 'No findings match these filters.' : 'No findings.'}
                            </p>
                          )}
                          {filteredFindings.map((f, i) => (
                            <button
                              key={i} onClick={() => goToFinding(f)}
                              title="Open this field"
                              className="flex items-start gap-2.5 p-2.5 border-b border-line-soft last:border-b-0 shrink-0 text-left hover:bg-blue-pale w-full"
                            >
                              <Tag variant={f.severity === 'error' ? 'danger' : 'warn'} className="shrink-0 mt-0.5">{f.severity}</Tag>
                              <div className="text-sm2 min-w-0">
                                <span className="font-mono font-bold">{f.structureIdent}</span>
                                {f.field && <span className="text-muted"> · {f.field}</span>}
                                {(f.srcField || f.tgtField) && <span className="text-muted"> · {f.srcField || f.tgtField}</span>}
                                <div className="text-text">{f.issue}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </Pane>

                <Pane
                  title="Review points" className="flex-1 min-w-0"
                  actions={
                    <>
                      <ReviewPointInsights notes={fieldNotes} />
                      {closedPointCount > 0 && (
                        <button
                          onClick={() => setShowClosedPoints((v) => !v)}
                          className="text-2xs font-semibold text-blue hover:underline ml-auto shrink-0"
                        >
                          {showClosedPoints ? `Hide ${closedPointCount} closed` : `Show ${closedPointCount} closed`}
                        </button>
                      )}
                    </>
                  }
                >
                  <ReviewPointsList
                    notes={resolvedNotes} allNotes={fieldNotes} hasClosed={closedPointCount > 0 && !showClosedPoints}
                    onReply={fieldNoteMutations.reply} onToggleResolved={fieldNoteMutations.setResolved}
                  />
                </Pane>
                </>
                )}
              </div>
            ) : (
              <div className="h-full overflow-auto rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
                {goldenMode ? (
                  whereUsedLoading ? (
                    <p className="text-sm2 text-muted p-4">Loading…</p>
                  ) : whereUsed.length === 0 ? (
                    <p className="text-sm2 text-muted p-8 text-center">
                      No FMDs reference this template yet. Use "Apply Golden Template" in a Standard FMD's editor (Scope &gt; FMD) to link one.
                    </p>
                  ) : (
                    <table className="w-full border-collapse text-sm2">
                      <thead>
                        <tr>
                          <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3 py-2 text-left sticky top-0">ID</th>
                          <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3 py-2 text-left sticky top-0">Name</th>
                          <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3 py-2 text-left sticky top-0">Object</th>
                          <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3 py-2 text-left sticky top-0">Reference</th>
                          <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3 py-2 text-left sticky top-0">Based on</th>
                          <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3 py-2 text-left sticky top-0">Status</th>
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
                  <p className="text-sm2 text-muted p-4">Loading…</p>
                ) : !fmd.histSourceName ? (
                  <p className="text-sm2 text-muted p-8 text-center">This FMD wasn't produced by the AI historical converter, so there's no tracked source to find siblings from.</p>
                ) : siblings.length === 0 ? (
                  <p className="text-sm2 text-muted p-8 text-center">No other plants from the same source (<span className="font-mono">{fmd.histSourceName}</span>) yet.</p>
                ) : (
                  <table className="w-full border-collapse text-sm2">
                    <thead>
                      <tr>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3 py-2 text-left sticky top-0">ID</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3 py-2 text-left sticky top-0">Name</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3 py-2 text-left sticky top-0">Plant</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3 py-2 text-left sticky top-0">Reference</th>
                        <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface-3 px-3 py-2 text-left sticky top-0">Version</th>
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
      <ConfirmDialog
        open={confirmPublish} title={`Publish ${draftVersion?.version ?? ''}`} busy={publishing}
        confirmLabel="Publish" onCancel={() => setConfirmPublish(false)} onConfirm={handlePublish}
        message={
          <>
            <p className="mb-2">This releases <span className="font-mono font-semibold">{draftVersion?.version}</span> as the active version for everyone with access to this FMD.</p>
            {pendingChanges.length > selectedChanges.length && (
              <p className="mb-2">
                The {pendingChanges.length - selectedChanges.length} change{pendingChanges.length - selectedChanges.length === 1 ? '' : 's'} you
                left unticked stay unpublished, in a new draft on top of this version.
              </p>
            )}
            <p className="text-muted">Its mapping content is frozen afterwards — further edits start a new draft instead. This can't be undone.</p>
          </>
        }
      />
      <SyncGoldenFmdDialog
        open={syncOpen} fmdId={fmd.id} fmdName={fmd.name} current={latest}
        goldenStructure={goldenLatest?.sheets.goldenStructure}
        goldenVersionId={goldenSummary?.latestVersionId} goldenVersionLabel={goldenSummary?.latestVersion}
        onClose={() => setSyncOpen(false)}
      />
      <AddReviewPointDialog
        target={pointTarget} canAdd={canAddNote} onClose={() => setPointTarget(null)}
        onSubmit={async (tagVal, body) => {
          if (!pointTarget) return;
          await fieldNoteMutations.add(pointTarget.structureId, pointTarget.rowKey, tagVal, body, pointTarget.field);
        }}
      />
    </Dialog>
  );
}

/** At-a-glance state of the review points: what's still outstanding, broken down by category, and
 * how much is already closed. Counts top-level points only — replies aren't work items. */
function ReviewPointInsights({ notes }: { notes: FmdFieldNote[] }) {
  const points = notes.filter((n) => !n.parentId);
  if (points.length === 0) return null;
  const open = points.filter((n) => !n.resolved);
  const resolved = points.length - open.length;
  const openByCategory = REVIEW_POINT_CATEGORIES
    .map((c) => ({ cat: c, n: open.filter((p) => p.tag === c.key).length }))
    .filter((x) => x.n > 0);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {openByCategory.map(({ cat, n }) => (
        <Tag key={cat.key} variant={cat.variant} title={`${n} open ${cat.label.toLowerCase()}`}>{n} {cat.label}</Tag>
      ))}
      {openByCategory.length === 0 && open.length === 0 && <Tag variant="accent">All closed</Tag>}
      {resolved > 0 && <span className="text-2xs text-muted">{resolved} closed</span>}
      <span className="text-2xs text-muted">· {points.length} total</span>
    </div>
  );
}

/** Every manually-written review point on this FMD, across all its fields — the counterpart to the
 * AI's findings in the same tab, and the in-app equivalent of the comments column in an Excel FMD.
 * Notes belong to the FMD rather than to one version, so this list is deliberately NOT filtered by
 * the selected version; only the field label is resolved against it. */
function ReviewPointsList({ notes, allNotes, hasClosed, onReply, onToggleResolved }: {
  notes: { note: FmdFieldNote; structureIdent?: string; label: string; orphaned: boolean }[];
  /** Unfiltered list, so a point's replies are found regardless of how the parent list is shown. */
  allNotes: FmdFieldNote[];
  /** Whether closed points exist but are filtered out — changes "nothing here" into "nothing left". */
  hasClosed: boolean;
  onReply: (parent: FmdFieldNote, body: string) => Promise<void>;
  onToggleResolved: (noteId: string, resolved: boolean) => Promise<void>;
}) {
  const repliesByParent = useMemo(() => {
    const m = new Map<string, FmdFieldNote[]>();
    for (const n of allNotes) {
      if (!n.parentId) continue;
      const list = m.get(n.parentId) ?? [];
      list.push(n);
      m.set(n.parentId, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return m;
  }, [allNotes]);

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm2 text-muted">{hasClosed ? 'Nothing outstanding.' : 'No review points yet.'}</p>
        <p className="text-2xs text-muted">
          {hasClosed
            ? 'Closed points are hidden — use "Show closed" above to see them.'
            : 'Open a field from the Field Mapping tab and add a review point against it.'}
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto flex flex-col">
      {notes.map(({ note: n, structureIdent, label, orphaned }) => (
        <ReviewPointThread
          key={n.id} point={n} replies={repliesByParent.get(n.id) ?? []}
          onReply={onReply} onToggleResolved={onToggleResolved} collapsible
          meta={
            <div className="flex items-center gap-1.5 flex-wrap text-sm2">
              {structureIdent && <span className="font-mono font-bold">{structureIdent}</span>}
              <span className={clsx('font-mono text-muted', orphaned && 'italic')}>· {label}</span>
              {orphaned && <Tag variant="neutral">not in this version</Tag>}
            </div>
          }
        />
      ))}
    </div>
  );
}

/** Who/when/state/comment for the selected version, plus which Golden/Reference version it was
 * built from. Lives on the Versions tab, beside the review panes for Custom FMDs and full-width for
 * everything else) rather than next to the mapping data, so the Field Mapping tab is nothing but
 * the mapping itself. */
function VersionDetailsPane({ fmd, selected, owner, className, onSync }: {
  fmd: LibraryFmdRow; selected?: FmdVersion; owner?: string; className?: string;
  /** Offered only when the FMD is behind the Golden template — the action that resolves the flag
   * sits with the flag, rather than in a toolbar where it'd be one more permanently-present button. */
  onSync?: () => void;
}) {
  return (
    <Pane title="Version details" className={className} bodyClassName="p-3.5">
      <div>
      {selected ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-sm2 text-blue-deep w-fit bg-blue-pale px-2 py-0.5 rounded">{selected.version}</span>
            <Tag variant={STATE_VARIANT[selected.state]}>{selected.state}</Tag>
          </div>
          <div className="text-sm2">
            <span className="text-muted">Owner</span>{' '}
            {owner ? <span className="font-semibold">{owner}</span> : <span className="text-muted">not assigned in scope</span>}
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
                <div className="text-sm2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted">Golden FMD</span> <span className="font-mono font-semibold">{fmd.goldenVersionLabel}</span>
                  {fmd.goldenOutdated && <Tag variant="warn" size="sm">Outdated</Tag>}
                  {fmd.goldenOutdated && onSync && (
                    <button onClick={onSync} className="text-2xs font-semibold text-blue hover:underline">Sync…</button>
                  )}
                </div>
              )}
              {fmd.standardRefVersionLabel && (
                <div className="text-sm2 flex items-center gap-1.5">
                  <span className="text-muted">Reference FMD</span> <span className="font-mono font-semibold">{fmd.standardRefVersionLabel}</span>
                  {fmd.standardRefOutdated && <Tag variant="warn" size="sm">Outdated</Tag>}
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
        <p className="text-sm2 text-muted">Select a version to see its details.</p>
      )}
      </div>
    </Pane>
  );
}


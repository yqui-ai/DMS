import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../components/Select';
import { Button } from '../../components/Button';
import clsx from 'clsx';
import { Download, ExternalLink, Sparkles } from 'lucide-react';
import { DocumentShell } from '../../components/DocumentShell';
import { useUnsavedGate } from '../../components/useUnsavedGate';
import { Tag } from '../../components/Tag';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../lib/auth';
import { canPublish } from '../../lib/rbac';
import { useCurrentRole } from '../../lib/queries/memberships';
import { useDefaultProgram } from '../../lib/queries/programme';
import { DRAFT_VERSION, DRAFT_VERSION_ID, draftOverlayVersion, nextPublishedVersion, useEditFmdField, useFmdVersions, useGoldenFmdSummary, useFmdUsage, useGoldenWhereUsed, useHistoricalSiblings, useLatestFmdVersion, usePublishFmdVersion, useAddFmdContent, type LibraryFmdRow } from '../../lib/queries/fmds';
import { useFmdFieldNotes, useFmdFieldNoteMutations } from '../../lib/queries/fmdFieldNotes';
import { useFmdPlantRules } from '../../lib/queries/fmdPlantRules';
import { useMigrationObjects, useScopeObjectOwners, scopeOwnerKey, type ScopeAssignment } from '../../lib/queries/scope';
import { usePlants, useSubprojectPlants } from '../../lib/queries/plants';
import { useLibraryPath } from '../../lib/libraryNav';
import { diffTablesByStructure, rowKey, summariseVersionChange } from '../../lib/rowDiff';
import { useMappingReview, readMappingReviews, findingKey } from '../../lib/queries/mappingReview';
import { analyseFmd } from '../../lib/fmdHealth';
import { criticalFieldsOf, outstandingIssue } from '../../lib/mappingRulePolicy';
import { isActionable } from '../../lib/reviewPointCategories';
import { exportGeneratedFmdToExcel } from '../../lib/generatedFmdExport';
import { exportGoldenFmdToExcel } from '../../lib/goldenFmdExport';
import { GoldenFmdStructureView } from './GoldenFmdStructureView';
import { GeneratedFmdTableView, type ReviewCellFinding } from './GeneratedFmdTableView';
import { FieldDetailView } from './FieldDetailView';
import { AddReviewPointDialog, type ReviewPointTarget } from './AddReviewPointDialog';
import { FmdWhereUsedTab } from './fmd/FmdWhereUsedTab';
import { FmdDraftTab } from './fmd/FmdDraftTab';
import { FmdReviewTab } from './fmd/FmdReviewTab';
import { FmdHealthTab } from './fmd/FmdHealthTab';
import { AddFmdContentDialog } from './fmd/AddFmdContentDialog';
import { PlantRulesDialog } from './fmd/PlantRulesDialog';
import type { MappingReviewFinding } from '../../types/entities';

type Tab = 'mapping' | 'draft' | 'versions' | 'health' | 'whereUsed';
type SheetKey = 'source' | 'target' | 'mapping';

const SHEET_COLUMNS: Record<SheetKey, string[]> = {
  source: ['field', 'desc', 'sample', 'sheet'],
  target: ['table', 'field', 'dataType'],
  mapping: ['source', 'target', 'dataType', 'rule', 'mandatory', 'defaultValue', 'dqRule', 'comments'],
};
const SHEET_LABEL: Record<SheetKey, string> = { source: 'Source', target: 'Target', mapping: 'Mapping' };

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
export function FmdVersionHistoryDialog({ fmd, onClose, asPage }: {
  fmd: LibraryFmdRow | null;
  onClose: () => void;
  /** Rendered as its own page rather than over the catalogue — see DocumentShell. */
  asPage?: boolean;
}) {
  const toast = useToast();
  const to = useLibraryPath();
  const { data: versions = [], isLoading } = useFmdVersions(fmd?.id);
  const [tab, setTab] = useState<Tab>('mapping');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rawTab, setRawTab] = useState<SheetKey>('source');
  const [exporting, setExporting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [openField, setOpenField] = useState<{ structureId: string; rowIndex: number } | null>(null);
  /** Where the field view was entered from, so Back returns there. The field view lives on the
   * Field Mapping tab, but a review point or finding opens it from a different tab entirely —
   * sending those back "to table" strands you on a screen you never chose. */
  const [fieldOrigin, setFieldOrigin] = useState<'table' | 'review'>('table');
  /** Uncommitted text inside the field-level view. Held here because the things that would throw it
   * away — the tab strip, the close button — live here, and they are state changes rather than
   * navigation, so nothing intercepts them on their own. */
  const [fieldEditDirty, setFieldEditDirty] = useState(false);
  const { gate, dialog: unsavedGate } = useUnsavedGate(fieldEditDirty, 'Your edits to this field');
  const [pointTarget, setPointTarget] = useState<ReviewPointTarget | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  /* Adding a custom field, row or structure. Custom FMDs only — a Standard FMD is the programme's
     generated reference and a Golden one is the template, so neither is somewhere to bolt an
     object-specific column onto. */
  const [addingContent, setAddingContent] = useState(false);
  /* Which row's per-plant rules are open. Holds the row's identity rather than its index: the grid
     can be sorted or filtered under the dialog, and an index would then point at a different row. */
  const [plantRuleTarget, setPlantRuleTarget] = useState<{ structureId: string; structureIdent?: string; rowKey: string; rowLabel: string; transformation?: string; technical?: string } | null>(null);
  const { publish: publishVersion } = usePublishFmdVersion();
  const { saveField } = useEditFmdField(fmd?.id ?? '');
  const { reorderRows } = useAddFmdContent(fmd?.id ?? '');
  const { review: reviewMapping, save: saveMappingReview, setAddressed } = useMappingReview();
  const { user } = useAuth();
  const isCustomFmd = fmd?.type === 'Custom';
  const goldenMode = fmd?.type === 'Golden';
  const siblingsMode = !goldenMode;
  /* The latest PUBLISHED version, not versions[0]. Where-used answers "is this FMD on the current
     template", and an unpublished draft is not the current template — passing it marked every row
     Outdated the moment anyone saved in the designer. */
  const goldenLivePublished = versions.find((v) => v.publishedAt);
  const { data: whereUsed = [], isLoading: whereUsedLoading } = useGoldenWhereUsed(goldenMode ? fmd?.id : undefined, goldenMode ? goldenLivePublished?.id : undefined);
  const { data: siblings = [], isLoading: siblingsLoading } = useHistoricalSiblings(siblingsMode ? fmd?.histSourceName : undefined, fmd?.id);
  const { data: usage } = useFmdUsage(fmd?.id);
  const { data: objects = [] } = useMigrationObjects(!!fmd);
  /* Placement context for the header — see placementSubtitle. Loaded only while a dialog is open. */
  const { data: plants = [] } = usePlants(false, !!fmd);
  const { data: subprojectPlants = new Map<string, string[]>() } = useSubprojectPlants(!!fmd);
  const { data: scopeOwners = new Map<string, ScopeAssignment>() } = useScopeObjectOwners(!!fmd);
  /** The FMD's object, from the catalogue this dialog already loaded — see FmdWhereUsedTab. */
  const usageObject = objects.find((o) => o.id === fmd?.migrationObjectId);

  const { data: goldenSummary } = useGoldenFmdSummary(!!fmd);
  const { data: goldenLatest } = useLatestFmdVersion(fmd?.goldenOutdated ? goldenSummary?.id : undefined);
  const { data: fieldNotes = [] } = useFmdFieldNotes(fmd?.id);
  const { data: plantRules = [] } = useFmdPlantRules(fmd?.id);
  /** Override counts per structure, for the grid's rule-cell marker. Keyed by structure because a
   * rowKey is only unique within one — see the prop's own note. */
  const plantRuleCountsByTable = useMemo(() => {
    const byTable = new Map<string, Map<string, number>>();
    for (const r of plantRules) {
      const byRow = byTable.get(r.structureId) ?? new Map<string, number>();
      byRow.set(r.rowKey, (byRow.get(r.rowKey) ?? 0) + 1);
      byTable.set(r.structureId, byRow);
    }
    return byTable.size > 0 ? byTable : undefined;
  }, [plantRules]);
  const fieldNoteMutations = useFmdFieldNoteMutations(fmd?.id ?? '');
  /** Raising and replying to review points is open to anyone with access to the FMD — review is a
   * collaborative act, and RLS already limits who can reach the FMD at all. Ownership gates
   * *editing* the mapping and publishing a version, not commenting on it. */
  const canAddNote = !!user?.email;
  /** Owner comes from the scope register (who owns this migration object in this subproject), not
   * from the FMD itself — see useScopeObjectOwners. Publishing is the owner's call. */
  const assignment = scopeOwners.get(scopeOwnerKey(fmd?.subprojectId, fmd?.migrationObjectId));
  const owner = assignment?.consultant;
  const etlDeveloper = assignment?.etlDeveloper;
  /** The consultant only. The ETL developer builds the pipeline; releasing a version of the
   * mapping document is not theirs to do. */
  const isOwner = !!user?.email && !!owner && user.email === owner;
  const { data: defaultProgram } = useDefaultProgram();
  const { data: role = 'guest' } = useCurrentRole(defaultProgram?.id, fmd?.subprojectId);
  /** The CONSULTANT's call, or a governance role's — see canPublish.
   *
   * Not the ETL developer's: they are responsible for building the pipeline, not for what the
   * mapping says, so releasing a version of the mapping document isn't theirs to do. Gating on the
   * assignment alone would leave an unassigned object publishable by nobody, which is why the
   * governance roles are an OR. */
  const mayPublish = canPublish(role, isOwner);
  /** Publishing and the AI mapping review both WRITE `sheets` on the same version row — a review
   * finishing after a publish would either be lost or land on a version that is now frozen. They're
   * mutually exclusive rather than merely discouraged, and the disabled control says which one is
   * running so it doesn't read as a bug. */
  const versionBusy = reviewing || publishing;
  const busyReason = reviewing ? 'A mapping review is running.' : publishing ? 'Publishing is in progress.' : '';

  /** null means "whatever the option list leads with" — the draft when there is one, the newest
   * version otherwise. Kept null rather than resolved to an id so publishing, which changes what
   * leads the list, doesn't strand the selection on something that no longer exists. */
  const resetView = () => {
    setRawTab('source'); setOpenField(null); setFieldOrigin('table'); setSelectedReviewId(null);
  };
  useEffect(() => {
    setTab('mapping');
    setSelectedId(null);
    resetView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmd?.id, versions.length]);

  const latest = versions[0];
  /** What the draft would change for everyone else — i.e. versus the newest PUBLISHED version,
   * not merely the one before it. That's the question "should I publish this?" actually asks. */
  const lastPublished = versions.find((v) => !!v.publishedAt);

  /** The unpublished working version, which is one of two things:
   *
   *  - an unreleased GENERATION, which is a real row in `versions`; or
   *  - uncommitted cell edits, which are not a row at all — they live on `fmd.draft` and are
   *    projected into version shape here, so every view below can render "the draft" without
   *    knowing it isn't a version.
   *
   * The second case is the whole point: editing a cell must not add an entry to an FMD's version
   * list. Nothing of this shape is stored. */
  const draftVersion = useMemo(() => {
    if (latest && !latest.publishedAt) return latest;
    if (!fmd?.draft?.pendingChanges.length || !lastPublished) return undefined;
    return draftOverlayVersion(lastPublished, fmd.draft);
  }, [latest, lastPublished, fmd?.draft]);
  const pendingChanges = draftVersion?.sheets.pendingChanges ?? [];
  /** From the version's own snapshot of the Golden template, not the live one — see criticalFieldsOf. */
  const criticalFields = useMemo(() => criticalFieldsOf(latest?.sheets.generatedColumns), [latest]);
  /** What publishing this draft would release it as — shown before publishing so the number is
   * never a surprise, and computed by the same function that writes it. */
  const draftNextVersion = draftVersion ? nextPublishedVersion(draftVersion, versions) : undefined;
  const draftChangeSummary = draftVersion
    ? summariseVersionChange(lastPublished?.sheets.generatedTables, draftVersion.sheets.generatedTables)
    : null;
  /** Everything the selector can show. The draft leads when one exists — it's the working document
   * — but it is an explicit CHOICE, not something that silently replaces a version's content.
   *
   * It has to be here rather than implied: showing draft values while the selector read
   * "v1.0.1 · live" meant the label and the content disagreed, and unpublished edits looked like
   * they were already released. An unreleased GENERATION is a real row and is already in
   * `versions`, so only the synthetic overlay is prepended. */
  const versionOptions = useMemo(
    () => (draftVersion?.id === DRAFT_VERSION_ID ? [draftVersion, ...versions] : versions),
    [draftVersion, versions],
  );
  const selected = versionOptions.find((v) => v.id === selectedId) ?? versionOptions[0];

  /** What each version is, in one word, in the selector.
   *
   * "Unpublished" alone was misleading for an OLD row that never got released: it reads as "waiting
   * to be published" when in fact a later version has long since overtaken it. `versions` is
   * newest-first, so anything published above a row in that list has superseded it — those are
   * **never published**, a dead end in the history, not pending work. Rows like this exist from
   * before drafts stopped being numbered; they are real history and stay listed, just labelled
   * honestly. */
  const versionNote = useMemo(() => {
    const notes = new Map<string, string>();
    versions.forEach((v, i) => {
      if (v.publishedAt) {
        notes.set(v.id, v.id === lastPublished?.id ? ' · live' : '');
        return;
      }
      const supersededByPublished = versions.slice(0, i).some((later) => !!later.publishedAt);
      notes.set(v.id, supersededByPublished ? ' · never published' : ' · unpublished');
    });
    return notes;
  }, [versions, lastPublished]);
  const showingDraft = selected?.id === DRAFT_VERSION_ID;
  /** Whether the content on screen may be edited at all.
   *
   * The newest version, published or not, plus the pending-edits overlay. Editing the LIVE version
   * is how a draft gets started, so it has to stay available — what must not be editable is an
   * older version, because an edit there would not touch what you are reading: `saveField` always
   * writes against the newest version, so it would silently change content you cannot see.
   *
   * One derivation for both the grid and the field-level view, so they cannot drift apart. */
  const canEditSelected = showingDraft || (!!selected && selected.id === latest?.id);
  /** Picking a version is a user action and clears the per-version view state. The automatic hop to
   * the draft on a first edit deliberately does NOT go through here — it isn't a change of subject,
   * and resetting there closed the field view mid-edit. */
  const pickVersion = (id: string) => { setSelectedId(id); resetView(); };
  // A version can be reviewed many times; null means "the most recent run", so a fresh review is
  // shown automatically without having to re-pick it.
  const reviews = useMemo(() => readMappingReviews(selected?.sheets), [selected]);
  const activeReview = reviews.find((r) => r.id && r.id === selectedReviewId) ?? reviews[reviews.length - 1];
  /** The real `fmd_versions` row that owns `activeReview` — where a "fixed" mark gets written.
   *
   * Normally that is the selected version. On the draft it is the published version the review was
   * inherited from, because the draft is a derived overlay with no row of its own. Undefined when
   * there is nothing to write to, which is what disables the control. */
  const reviewTarget = useMemo(() => {
    if (!selected) return undefined;
    if (!showingDraft) return selected;
    const fromId = activeReview?.inheritedFrom?.versionId;
    return fromId ? versions.find((v) => v.id === fromId) : undefined;
  }, [selected, showingDraft, activeReview, versions]);
  // `versions` is newest-first, so the version right after the selected one in that array is the
  // one immediately before it in time — what the selected version's changes are diffed against.
  const selectedIndex = versions.findIndex((v) => v.id === selected?.id);
  const previousVersion = selectedIndex >= 0 ? versions[selectedIndex + 1] : undefined;
  /** Which cells carry a value that isn't published yet.
   *
   * Same shape and same yellow as the version-to-version changed-cell highlight, and the same
   * meaning: "this differs from the version before it". For a draft the version before it is the
   * live one, so the highlight marks exactly the values nobody else can see. Without it the draft
   * and the live version were pixel-identical apart from a word in a dropdown. */
  const changedCellsByTable = useMemo(() => {
    if (showingDraft && pendingChanges.length) {
      const byTable = new Map<string, Map<string, Set<string>>>();
      for (const c of pendingChanges) {
        const table = selected?.sheets.generatedTables?.find((t) => t.structureId === c.structureId);
        const row = table?.rows[c.rowIndex];
        if (!row) continue;
        const rk = rowKey(row, c.rowIndex);
        const byRow = byTable.get(c.structureId) ?? new Map<string, Set<string>>();
        byRow.set(rk, new Set([...(byRow.get(rk) ?? []), c.field]));
        byTable.set(c.structureId, byRow);
      }
      return byTable;
    }
    return diffTablesByStructure(previousVersion?.sheets.generatedTables, selected?.sheets.generatedTables);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousVersion, selected, showingDraft, pendingChanges]);
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

    // A finding with rowIndex -1 is about the whole COLUMN ("blank in all 33 rows"). It resolves
    // against no row, so the loop above skips it and it was reported in the list but marked
    // nowhere — a third of the errors on screen with nothing to point at. Applying it to every
    // cell of that column puts the mark where the problem is: in the cells.
    for (const f of findings) {
      if (f.rowIndex >= 0 || !f.field) continue;
      const table = tables.find((t) => t.structureId === f.structureId);
      if (!table) continue;
      const byRow = byTable.get(f.structureId) ?? new Map<string, Map<string, ReviewCellFinding>>();
      table.rows.forEach((row, i) => {
        const rk = rowKey(row, i);
        const byField = byRow.get(rk) ?? new Map<string, ReviewCellFinding>();
        // A per-row finding on the same cell is more specific, so it wins.
        if (!byField.has(f.field!)) byField.set(f.field!, { severity: f.severity, issue: f.issue });
        byRow.set(rk, byField);
      });
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

  /** Review points counted per ROW, for the grid's left gutter.
   *
   * Deliberately not derived from the map above: that one is keyed by cell and skips every point
   * with no `field`, so a point raised about the mapping as a whole — which is most of them, since
   * the composer's default is the row — left no mark on the grid at all. Replies are excluded so a
   * thread counts once; `open` counts only unresolved ACTIONABLE points, matching the badge in the
   * review pane, so a remark never reads as work outstanding. */
  const reviewPointRowsByTable = useMemo(() => {
    const byTable = new Map<string, Map<string, { total: number; open: number }>>();
    for (const n of fieldNotes) {
      if (n.parentId) continue;
      const byRow = byTable.get(n.structureId) ?? new Map<string, { total: number; open: number }>();
      const tally = byRow.get(n.rowKey) ?? { total: 0, open: 0 };
      tally.total += 1;
      if (!n.resolved && isActionable(n.tag)) tally.open += 1;
      byRow.set(n.rowKey, tally);
      byTable.set(n.structureId, byRow);
    }
    return byTable.size > 0 ? byTable : undefined;
  }, [fieldNotes]);
  // Oldest first, for the exported Version History sheet — the on-screen list stays independently
  // sortable (sortedVersions) but the export always reads the same way regardless of that toggle.
  const exportVersions = useMemo(
    () => [...versions].reverse().map((v) => ({ version: v.version, changedBy: v.createdBy, changedAt: v.createdAt, comment: v.comment })),
    [versions],
  );

  if (!fmd) return null;

  const object = objects.find((o) => o.id === fmd.migrationObjectId);

  /* Where this document sits, under its name.
   *
   * An FMD is reusable — the same mapping gets adopted by another subproject, and a Custom one is
   * regenerated for a different wave — so this is a description of where it is being read FROM
   * today, not a property of the document. It is stated as an indicator rather than as data anyone
   * should key on, which is also why it is a subtitle and not a Fact row.
   *
   * A Standard or Golden FMD is programme-wide and has no placement at all; saying "Program-wide"
   * is the whole answer for those, and inventing a hierarchy for them would be a lie. */
  const fmdPlants = fmd.subprojectId ? (subprojectPlants.get(fmd.subprojectId) ?? []) : [];
  /** The plant RECORDS, in catalogue order — what the per-plant rules dialog lists. */
  const fmdPlantRecords = fmdPlants
    .map((id) => plants.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const plantLabels = fmdPlantRecords.map((p) => p.code);

  const placementSubtitle = fmd.subprojectId
    ? [fmd.programName, fmd.projectName, fmd.subprojectName].filter(Boolean).join(' › ')
      + (plantLabels.length ? `  ·  ${plantLabels.length === 1 ? 'Plant' : 'Plants'} ${plantLabels.join(', ')}` : '')
    : 'Program-wide — not tied to a project, subproject or plant';
  const isGoldenStructure = !!selected?.sheets.goldenStructure;
  const isGenerated = !!selected?.sheets.generatedColumns?.length && !!selected?.sheets.generatedTables?.length;
  const fieldViewOpen = !!(isGenerated && openField && openTable);
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
            // Of the version being EXPORTED, not the latest — an exported workbook has to describe
            // itself, and the tab only measures the latest because it is a live view.
            health: analyseFmd(selected, fieldNotes, pendingChanges.length) ?? undefined,
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
        // Follow the edit onto the draft — you are now working on it — but without resetVIew(),
        // which would close the field view you are typing in.
        setSelectedId(DRAFT_VERSION_ID);
        // info, not success: this reports where the edit went, it does not confirm a release.
        // Green here read as "published", which is the opposite of what it says.
        toast.info(`${latest.version} is published, so your changes are collecting in a draft. Publish it to release them as a new version.`);
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Could not save that change.');
    }
  };

  const handlePublish = async (selectedChangeIds: string[]) => {
    if (!draftVersion || !fmd) return;
    if (reviewing) { toast.error('Wait for the mapping review to finish before publishing.'); return; }
    setPublishing(true);
    try {
      const res = await publishVersion({
        draft: draftVersion, fmdId: fmd.id, selectedChangeIds, basePublished: lastPublished,
      });
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
    // rowIndex -1 marks a finding about the STRUCTURE rather than a row (a column blank in every
    // row), so there is nothing to open — say that instead of blaming the selected version.
    if (f.rowIndex < 0) {
      toast.info('That finding is about the whole structure, not one field.');
      return;
    }
    if (!table?.rows[f.rowIndex]) {
      toast.error('That row is not part of the version currently selected.');
      return;
    }
    setFieldOrigin('review');
    setOpenField({ structureId: f.structureId, rowIndex: f.rowIndex });
    setTab('mapping');
  };

  /** Same jump, from a manual review point. A point is anchored by `rowKey` rather than a row
   * index — that's what lets it survive regeneration — so the index has to be resolved against the
   * version on screen, and may genuinely not exist there. */
  const goToNote = (n: { structureId: string; rowKey: string }) => {
    const table = selected?.sheets.generatedTables?.find((t) => t.structureId === n.structureId);
    const idx = table?.rows.findIndex((r, i) => rowKey(r, i) === n.rowKey) ?? -1;
    if (!table || idx < 0) {
      toast.error('That row is not part of the version currently selected.');
      return;
    }
    setFieldOrigin('review');
    setOpenField({ structureId: n.structureId, rowIndex: idx });
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
    <DocumentShell
      asPage={asPage}
      open={!!fmd}
      onClose={gate(onClose)}
      title={fmd.name}
      subtitle={placementSubtitle}
      backTo={to('fmds')}
      backLabel="Back to Field Mapping"
    >
      {unsavedGate}
      <div className="h-full flex flex-col">
        {/* items-END, not center: the active tab marks itself with a border that has to sit ON
            the strip's line, and centring floated it off as soon as the taller action group grew
            the row. Bottom-aligned, the tabs stay welded to the line and the actions' own bottom
            margin is what lifts them clear of it. */}
        <div className="flex items-end gap-1 border-b border-line mb-3.5 shrink-0">
          <button
            onClick={gate(() => setTab('mapping'))}
            className={clsx('px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px', tab === 'mapping' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
          >
            Field Mapping
          </button>
          {/* After Field Mapping and before the review tabs: the mapping is the document, the health
              check is what it adds up to, and the reviews are what people said about it.
              CUSTOM only. Health grades a document somebody is building for a subproject — how much
              is filled in, how much is still open, whether it is behind the template. A Standard FMD
              is the programme-wide reference generated from Golden: nobody fills it in, it has no
              consultant and no review points, so most of what the tab measures is structurally zero
              and the rest reads as failure for work nobody intends to do. A Golden template has
              nothing to measure at all. */}
          {isCustomFmd && isGenerated && (
            <button
              onClick={gate(() => setTab('health'))}
              className={clsx('px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px', tab === 'health' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
            >
              Health Check
            </button>
          )}
          {draftVersion && (
            <button
              onClick={gate(() => setTab('draft'))}
              className={clsx('px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px flex items-center gap-1.5', tab === 'draft' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
            >
              Draft {pendingChanges.length > 0 && <Tag variant="danger" size="sm">{pendingChanges.length}</Tag>}
            </button>
          )}
          <button
            onClick={gate(() => setTab('versions'))}
            className={clsx('px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px', tab === 'versions' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
          >
            {/* No counts on the tab labels. The structure count, version count, finding count and
                open-point count are all already stated inside their own panes, where they sit next
                to the thing they describe — repeating them here made the tab strip read as a
                dashboard and pushed the labels apart for no added information. */}
            {isCustomFmd ? 'Versions & Review' : 'Versions'}
          </button>
          <button
            onClick={gate(() => setTab('whereUsed'))}
            className={clsx('px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px', tab === 'whereUsed' ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text')}
          >
            Where-Used
          </button>
          {/* On the tab row and right-aligned, but held clear of the border: the active tab
              marks itself by sitting ON that line, so anything else touching it reads as a tab. */}
          <div className="ml-auto flex items-center gap-2 mb-3">
            {/* One version selector for the whole dialog — the Field Mapping tab (table and
                field-level view alike) always renders whatever is picked here, so there's a single
                answer to "which version am I looking at" no matter which tab is open. */}
            {/* Hidden on Health check: that tab always measures the latest version, so a selector
                sitting above it would imply a choice it doesn't honour. */}
            {versions.length > 0 && tab !== 'health' && (
              <label className="flex items-center gap-1.5 text-2xs text-muted">
                Version
                {/* Not `mono`: each option is an identifier followed by prose, and setting the
                    whole control in the code face put "unpublished" in monospace beside two
                    sans-serif buttons. Version numbers stay mono everywhere they stand alone. */}
                <Select
                  value={selected?.id ?? ''} onChange={(e) => pickVersion(e.target.value)}
                  size="sm"
                >
                  {versionOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {/* "latest" used to mean newest by date, which labelled an unreleased
                          generation as latest while an older version was the one everyone else
                          could see. Newest and live are different questions: say which is live,
                          and say plainly when a version isn't published at all. */}
                      {v.id === DRAFT_VERSION_ID
                        ? `Draft · ${pendingChanges.length} unpublished`
                        : `${v.version}${versionNote.get(v.id) ?? ''}`}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {/* A second BROWSER tab, not an in-app "full screen".
                The complaint this answers is that a modal has to be closed to look at anything
                else — and an in-app full-screen mode would not fix that, because it still occupies
                the one window. A real tab does: the FMD stays open on its own URL while you use the
                rest of the app beside it. The address already exists (every Library deep view is a
                route); this is the affordance that makes it reachable without copying the URL out
                of the bar. */}
            {/* Hidden in page mode: you are already in that tab, and a button offering
                to open one more of the same document is an invitation to lose track of which is
                which. */}
            {!asPage && <Button
              variant="quiet" size="sm"
              onClick={() => window.open(`${window.location.origin}${to('view')}/fmd/${fmd.id}`, '_blank', 'noopener')}
              title="Open this FMD in a new browser tab, so you can keep it open while using other screens"
            >
              <ExternalLink size={14} /> New tab
            </Button>}
            <Button variant="quiet" size="sm" onClick={handleExport} disabled={exporting || !selected || (!isGoldenStructure && !isGenerated)}>
              <Download size={14} /> {exporting ? 'Exporting…' : 'Export to Excel'}
            </Button>
            {isCustomFmd && (
              <Button variant="ai" size="sm"
                onClick={handleReviewMapping}
                disabled={versionBusy || !latest?.sheets.generatedTables?.length}
                title={publishing ? busyReason : latest ? (latest.version === DRAFT_VERSION ? `Reviews the working draft` : `Reviews ${latest.version}, the latest version`) : undefined}
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
                {/* The frame is for views that are one flat surface — the structure list and the
                    grid, which would otherwise bleed into the dialog. The field view is already
                    built from bordered panels and bordered section cards, so the frame there is a
                    fourth outline around content that has three. */}
                <div
                  className={clsx(
                    'h-full min-w-0 overflow-auto rounded-lg',
                    !fieldViewOpen && 'shadow-[inset_0_0_0_1px_var(--line)]',
                  )}
                >
                  {isGoldenStructure ? (
                    <GoldenFmdStructureView structure={selected!.sheets.goldenStructure!} />
                  ) : fieldViewOpen ? (
                    <div className="h-full">
                      <FieldDetailView
                        columns={selected!.sheets.generatedColumns!} tables={selected!.sheets.generatedTables!}
                        structureId={openField.structureId} rowIndex={openField.rowIndex}
                        onOpen={(structureId, rowIndex) => setOpenField({ structureId, rowIndex })}
                        onBack={() => { setOpenField(null); if (fieldOrigin === 'review') setTab('versions'); }}
                        onDirtyChange={setFieldEditDirty}
                        backLabel={fieldOrigin === 'review' ? 'Back to review' : 'Back to table'}
                        findings={openFindings} notes={openNotes} canAddNote={canAddNote}
                        canEdit={isCustomFmd && canEditSelected}
                        onSaveField={handleSaveField}
                        onAddNote={async (tagVal, body) => { if (openRowKeyValue) await fieldNoteMutations.add(openField.structureId, openRowKeyValue, tagVal, body); }}
                        onReply={fieldNoteMutations.reply}
                        onToggleResolved={(noteId, resolved) => fieldNoteMutations.setResolved(noteId, resolved)}
                      />
                    </div>
                  ) : isGenerated ? (
                    <div className="h-full p-2">
                      <GeneratedFmdTableView
                        columns={selected!.sheets.generatedColumns!} tables={selected!.sheets.generatedTables!}
                        changedCellsByTable={changedCellsByTable} reviewFindingsByTable={reviewFindingsByTable}
                        onOpenField={(structureId, rowIndex) => { setFieldOrigin('table'); setOpenField({ structureId, rowIndex }); }}
                        canEdit={isCustomFmd && canEditSelected}
                        onSaveField={handleSaveField}
                        reviewPointCellsByTable={reviewPointCellsByTable}
                        reviewPointRowsByTable={reviewPointRowsByTable}
                        onAddContent={isCustomFmd && canEditSelected ? () => setAddingContent(true) : undefined}
                        onReorderRows={isCustomFmd && canEditSelected ? reorderRows : undefined}
                        /* Offered only where a rule COULD differ: a Custom FMD (the only kind tied
                           to a subproject) whose subproject covers more than one plant. With one
                           plant there is nothing to differ between, and the control would be an
                           invitation to record a distinction that cannot exist. */
                        onOpenPlantRules={isCustomFmd && fmdPlants.length > 1 ? (structureId, rowIndex) => {
                          const t = selected!.sheets.generatedTables!.find((x) => x.structureId === structureId);
                          const r = t?.rows[rowIndex];
                          if (!t || !r) return;
                          setPlantRuleTarget({
                            structureId, structureIdent: t.structureIdent,
                            rowKey: rowKey(r, rowIndex),
                            rowLabel: r.SRC_FIELD || r.TGT_FIELD || `Row ${rowIndex + 1}`,
                            transformation: r.TRANSFORMATION_RULE, technical: r.TECHNICAL_RULE,
                          });
                        } : undefined}
                        plantRuleCountsByTable={plantRuleCountsByTable}
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
                                <th key={c} className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface border-b border-line px-2.5 py-2 sticky top-0 text-left">{c}</th>
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
              <FmdDraftTab
                draftVersion={draftVersion} lastPublished={lastPublished} nextVersion={draftNextVersion}
                pendingChanges={pendingChanges} draftChangeSummary={draftChangeSummary}
                mayPublish={mayPublish} publishing={publishing} reviewing={reviewing} owner={owner}
                onPublish={handlePublish}
              />
            ) : tab === 'health' ? (
              <FmdHealthTab
                fmd={fmd} latest={latest} notes={fieldNotes}
                pendingChanges={pendingChanges.length} versionLabel={latest?.version}
                goldenStructure={goldenLatest?.sheets.goldenStructure}
                goldenVersionId={goldenSummary?.latestVersionId} goldenVersionLabel={goldenSummary?.latestVersion}
              />
            ) : tab === 'versions' ? (
              <FmdReviewTab
                fmd={fmd} selected={selected} owner={owner} etlDeveloper={etlDeveloper}
                objectIdent={usageObject?.objectId}
                isCustomFmd={isCustomFmd} isGenerated={isGenerated} reviewing={reviewing}
                reviews={reviews} activeReview={activeReview} onSelectReview={setSelectedReviewId}
                fieldNotes={fieldNotes}
                onReply={fieldNoteMutations.reply} onToggleResolved={fieldNoteMutations.setResolved}
                onGoToFinding={goToFinding} onGoToNote={goToNote}
                // Withheld while a review or publish is running: both rewrite the same `sheets`,
                // so a mark saved mid-run would be overwritten by whichever finished last.
                //
                // It DOES work on the draft. The draft has no row of its own, but an inherited
                // review belongs to the published version it ran against, and that row is where the
                // mark goes — see `reviewTarget`. Marking findings off while looking at the draft is
                // the actual workflow: you fix a cell, then tick the finding it came from.
                onToggleAddressed={selected && reviewTarget && !versionBusy
                  ? async (key, addressed) => {
                      try {
                        // Verify before accepting the claim. Checked against the DRAFT when there
                        // is one — that's where a fix lives before it's published, and it's exactly
                        // what "fixed and waiting to be released" means.
                        if (addressed) {
                          const finding = activeReview?.findings.find((f, i) => findingKey(f, i) === key);
                          const current = draftVersion?.sheets.generatedTables ?? latest?.sheets.generatedTables ?? [];
                          const still = finding ? outstandingIssue(finding, current, criticalFields) : null;
                          if (still) {
                            toast.error(`Not fixed yet — ${still}`);
                            return;
                          }
                        }
                        await setAddressed(reviewTarget.id, reviewTarget.sheets, activeReview?.id, key, addressed);
                      } catch (err: any) {
                        toast.error(err.message ?? 'Could not update that finding.');
                      }
                    }
                  : undefined}
              />
            ) : (
              <FmdWhereUsedTab
                usage={usage}
                fmdId={fmd.id}
                fmdType={fmd.type}
                fmdSubprojectId={fmd.subprojectId}
                object={usageObject}
                ownNames={{ programName: fmd.programName, projectName: fmd.projectName, subprojectName: fmd.subprojectName }}
                whereUsed={whereUsed}
                whereUsedLoading={whereUsedLoading}
                siblings={siblings}
                siblingsLoading={siblingsLoading}
                histSourceName={fmd.histSourceName}
              />
            )}
          </div>
        )}
      </div>
      {/* Rendered against the LATEST version's shape, not the selected one: adding always lands in
          the draft on top of the latest, so offering the sections and structures of a superseded
          version would let you add a column to a document that no longer looks like that. */}
      <AddFmdContentDialog
        open={addingContent}
        fmdId={fmd.id}
        tables={latest?.sheets.generatedTables ?? []}
        activeStructureId={openField?.structureId}
        onClose={() => setAddingContent(false)}
      />

      <PlantRulesDialog
        open={!!plantRuleTarget}
        fmdId={fmd.id}
        structureId={plantRuleTarget?.structureId ?? ''}
        structureIdent={plantRuleTarget?.structureIdent}
        rowKey={plantRuleTarget?.rowKey ?? ''}
        rowLabel={plantRuleTarget?.rowLabel ?? ''}
        baseTransformation={plantRuleTarget?.transformation}
        baseTechnical={plantRuleTarget?.technical}
        plants={fmdPlantRecords}
        rules={plantRules}
        // Same gate as editing the mapping: an override IS the mapping for that plant, so it is
        // the owner's call, not anyone's who can see the document.
        canEdit={canEditSelected}
        onClose={() => setPlantRuleTarget(null)}
      />

      <AddReviewPointDialog
        target={pointTarget} canAdd={canAddNote} onClose={() => setPointTarget(null)}
        onSubmit={async (tagVal, body) => {
          if (!pointTarget) return;
          await fieldNoteMutations.add(pointTarget.structureId, pointTarget.rowKey, tagVal, body, pointTarget.field);
        }}
      />
    </DocumentShell>
  );
}

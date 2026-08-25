import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, FileSpreadsheet, RefreshCw, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { AiButton } from '../../components/AiButton';
import { Field } from '../../components/Field';
import { Tag } from '../../components/Tag';
import { useToast } from '../../components/Toast';
import { useDefaultProgram, useProjects, useSubprojects } from '../../lib/queries/programme';
import {
  useFmdVersions, useGoldenFmdSummary, useGenerateFmdMutation, useHistoricalSourceNames, findHistoricalLineage,
} from '../../lib/queries/fmds';
import { useConvertHistoricalFmd } from '../../lib/queries/aiHistoricalConvert';
import { sanitizeName } from '../../lib/sanitize';
import { parseHistoricalFile } from '../../lib/parseHistoricalFile';
import { findDeterministicSourceMatch, findFuzzySourceMatch } from '../../lib/fileNameMatch';
import { buildDiffSummary } from '../../lib/rowDiff';
import { SUGGESTED_SHEET_PATTERN, extractPlants, sliceForPlant } from '../../lib/plantSplit';
import { fmtDate } from '../../lib/format';
import type { GeneratedColumn, GeneratedTable, HistoricalRaw } from '../../types/entities';

type Step = 'upload' | 'match' | 'sheets' | 'plan' | 'compare' | 'converting' | 'review';
/** null (the no-plant-detected single-FMD case) keyed as ''. */
const plantKeyOf = (plant: string | null): string => plant ?? '';

interface PendingUpdate {
  plant: string | null; name: string; columns: GeneratedColumn[]; tables: GeneratedTable[];
  summary: string; skip: boolean;
}

/** Structured form of one line of buildDiffSummary()'s deterministic output (src/lib/rowDiff.ts) —
 * parsed back out of the plain-text comment so the review step can highlight the row/field it names
 * instead of showing a wall of text. A line that doesn't match any known shape (e.g. a user's own
 * free-text edit) degrades gracefully to 'plain' rather than being dropped. */
type DiffEntry =
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'added'; label: string }
  | { kind: 'removed'; label: string }
  | { kind: 'changed'; label: string; field: string; was: string; now: string }
  | { kind: 'plain'; text: string };

const RENAME_RE = /^Source file renamed from "(.+)" to "(.+)"\.$/;
const ADDED_RE = /^- (.+): new field mapping added$/;
const REMOVED_RE = /^- (.+): field mapping removed$/;
const CHANGED_RE = /^- (.+): (.+) changed \(was: "([\s\S]*)", now: "([\s\S]*)"\)$/;

function parseDiffSummary(text: string): DiffEntry[] {
  return text.split('\n').filter((l) => l.trim()).map((line): DiffEntry => {
    const rename = line.match(RENAME_RE);
    if (rename) return { kind: 'rename', from: rename[1], to: rename[2] };
    const changed = line.match(CHANGED_RE);
    if (changed) return { kind: 'changed', label: changed[1], field: changed[2], was: changed[3], now: changed[4] };
    const added = line.match(ADDED_RE);
    if (added) return { kind: 'added', label: added[1] };
    const removed = line.match(REMOVED_RE);
    if (removed) return { kind: 'removed', label: removed[1] };
    return { kind: 'plain', text: line };
  });
}

/** Groups changed/added/removed entries under their shared row label (AKSTL, FKOKR, ...) so every
 * field touched on the same row reads as one card instead of scattered bullet lines; rename notices
 * and unparseable free text stay standalone above the grouped cards. */
function groupDiffEntries(entries: DiffEntry[]): { standalone: DiffEntry[]; byLabel: Map<string, DiffEntry[]> } {
  const standalone: DiffEntry[] = [];
  const byLabel = new Map<string, DiffEntry[]>();
  for (const e of entries) {
    if (e.kind === 'changed' || e.kind === 'added' || e.kind === 'removed') {
      const list = byLabel.get(e.label) ?? [];
      list.push(e);
      byLabel.set(e.label, list);
    } else {
      standalone.push(e);
    }
  }
  return { standalone, byLabel };
}

/** Historical FMD → Golden template, end to end, with nothing persisted until real Custom FMDs
 * come out the other end. Steps: upload & parse (checking whether this filename — or, via AI, a
 * likely-renamed variant of it — is already a tracked source) → pick which parsed sheets actually
 * matter → a deterministic Plant scan builds a plan (checkboxes to pick which plants to actually
 * generate) → convert. A brand-new plant saves immediately (nothing to review yet); a plant that
 * already has a tracked FMD instead gets converted, deterministically diffed against its previous
 * version (src/lib/rowDiff.ts — no AI, so it can't come back empty or malformed), and queued for
 * review — you see and can edit the change summary before it's saved as a new version.
 * Each FMD is named `FMD_<file>_<plant>` (or `FMD_<file>` with no plant split) and auto-references
 * the Golden FMD's structure. Identity for "is this the same source, updated" is (source file,
 * plant) — tracked via fmds.hist_source_name/hist_plant, not the editable display name. */
export function ConvertHistoricalFmdWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { subprojectId: paramSubprojectId } = useParams();
  const { data: program } = useDefaultProgram();
  const { data: projects = [] } = useProjects(program?.id);
  const projectIds = useMemo(() => projects.map((r) => r.id), [projects]);
  const { data: subprojects = [] } = useSubprojects(projectIds);
  const { data: golden } = useGoldenFmdSummary();
  const { data: goldenVersions = [] } = useFmdVersions(golden?.id);
  const goldenStructure = goldenVersions[0]?.sheets.goldenStructure;
  const { data: knownSourceNames = [] } = useHistoricalSourceNames();
  const { convert } = useConvertHistoricalFmd();
  const generateMutation = useGenerateFmdMutation();

  const [step, setStep] = useState<Step>('upload');
  const [subprojectId, setSubprojectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const [baseName, setBaseName] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [matchNotice, setMatchNotice] = useState<{ matchedName: string; confidence: string; certain: boolean } | null>(null);
  const [historicalRaw, setHistoricalRaw] = useState<HistoricalRaw | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [plants, setPlants] = useState<string[]>([]);
  const [selectedPlants, setSelectedPlants] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] }>({ done: 0, total: 0, failed: [] });
  const [created, setCreated] = useState(0);
  const [pendingUpdates, setPendingUpdates] = useState<PendingUpdate[]>([]);
  const [savingUpdates, setSavingUpdates] = useState(false);

  // Per-plant "does a tracked FMD already exist for this?" — checked once, up front, when the plan
  // is built (goToPlan), keyed by plantKeyOf(plant), so the plan step can show an Existing/New
  // badge instead of that only being revealed silently during the final conversion.
  const [plantLineage, setPlantLineage] = useState<Record<string, { fmdId: string; rows: GeneratedTable[] } | null>>({});
  const [checkingLineage, setCheckingLineage] = useState(false);
  // Cache of a plant's converted result, keyed by plantKeyOf(plant) — populated by "Compare" so
  // generate() can reuse it instead of paying for the same AI-calling conversion twice.
  const [convertCache, setConvertCache] = useState<Record<string, { columns: GeneratedColumn[]; tables: GeneratedTable[] }>>({});
  const [compareTarget, setCompareTarget] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareSummary, setCompareSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('upload');
    setSubprojectId(''); setFile(null); setBusy(false);
    setBaseName(''); setUploadedFileName(''); setMatchNotice(null); setHistoricalRaw(null);
    setSelectedSheets(new Set()); setPlants([]); setSelectedPlants(new Set());
    setProgress({ done: 0, total: 0, failed: [] }); setCreated(0); setPendingUpdates([]); setSavingUpdates(false);
    setPlantLineage({}); setCheckingLineage(false); setConvertCache({});
    setCompareTarget(null); setComparing(false); setCompareSummary(null);
  }, [open]);

  const effectiveSubprojectId = paramSubprojectId || subprojectId || null;

  const parseFile = async () => {
    if (!file) { toast.error('Choose a file first.'); return; }
    setBusy(true);
    try {
      // Filename-similarity check happens BEFORE the (potentially large) file is actually parsed —
      // it only needs file.name, so there's no reason to pay ExcelJS parse time or, for the AI
      // fallback, any token cost for content nobody's going to look at.
      const ownName = sanitizeName(file.name.replace(/\.[^./\\]+$/, '') || 'Historical_FMD');
      setUploadedFileName(ownName);
      setMatchNotice(null);

      // Tracked locally, not just via setMatchNotice, so the step decision below can use it
      // immediately — React state updates aren't visible synchronously within the same function.
      let pendingMatch: { matchedName: string; confidence: string; certain: boolean } | null = null;
      if (!knownSourceNames.includes(ownName) && knownSourceNames.length > 0) {
        // Exact match after stripping a revision suffix (e.g. "_v2") first — the common case.
        // Falls back to token-overlap similarity for renames that don't fit that pattern (changed
        // separators, reworded filename, etc). Both are plain JS — no AI call, no network
        // dependency, so this can never silently fail to fire the way an Edge Function round-trip
        // could (and did — the previous AI-based fallback proved unreliable in practice).
        const deterministic = findDeterministicSourceMatch(ownName, knownSourceNames);
        if (deterministic) {
          pendingMatch = { matchedName: deterministic, confidence: 'high', certain: true };
        } else {
          const fuzzy = findFuzzySourceMatch(ownName, knownSourceNames);
          if (fuzzy) pendingMatch = { matchedName: fuzzy.name, confidence: fuzzy.certain ? 'high' : 'medium', certain: fuzzy.certain };
        }
      }

      const raw = await parseHistoricalFile(file);
      setHistoricalRaw(raw);
      setSelectedSheets(new Set(raw.sheets.filter((s) => SUGGESTED_SHEET_PATTERN.test(s.name)).map((s) => s.name)));

      if (pendingMatch) {
        // A detected match — certain or AI-suggested — is a real decision (update the existing
        // tracked source vs. start a new one), so it gets its own step before sheet selection
        // rather than a banner tucked into another step. baseName is only set once the user
        // explicitly confirms (confirmSameSource/confirmNewSource), never assumed here.
        setMatchNotice(pendingMatch);
        setStep('match');
      } else {
        setBaseName(ownName);
        setStep('sheets');
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const confirmSameSource = () => {
    if (!matchNotice) return;
    setBaseName(matchNotice.matchedName);
    setMatchNotice(null);
    setStep('sheets');
  };
  const confirmNewSource = () => {
    setBaseName(uploadedFileName);
    setMatchNotice(null);
    setStep('sheets');
  };

  const toggleSheet = (name: string) => setSelectedSheets((s) => {
    const next = new Set(s);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const selectAllSheets = () => setSelectedSheets(new Set(historicalRaw?.sheets.map((s) => s.name) ?? []));
  const deselectAllSheets = () => setSelectedSheets(new Set());

  const goToPlan = async () => {
    if (!historicalRaw || selectedSheets.size === 0) { toast.error('Pick at least one sheet.'); return; }
    const found = extractPlants(historicalRaw, selectedSheets);
    setPlants(found);
    setSelectedPlants(new Set(found));
    setStep('plan');

    // Check upfront which of these plants already have a tracked FMD, so the plan can show it —
    // rather than that only being discovered silently once conversion actually starts.
    setCheckingLineage(true);
    try {
      const targets = found.length === 0 ? [null] : found;
      const entries = await Promise.all(targets.map(async (p) => [plantKeyOf(p), await findHistoricalLineage(baseName, p)] as const));
      setPlantLineage(Object.fromEntries(entries));
    } catch {
      setPlantLineage({});
    } finally {
      setCheckingLineage(false);
    }
  };

  const togglePlant = (plant: string) => setSelectedPlants((s) => {
    const next = new Set(s);
    if (next.has(plant)) next.delete(plant); else next.add(plant);
    return next;
  });
  const selectAllPlants = () => setSelectedPlants(new Set(plants));
  const deselectAllPlants = () => setSelectedPlants(new Set());

  const fmdName = (plant: string | null) => sanitizeName(`FMD_${baseName}${plant ? `_${plant}` : ''}`);
  const targetPlants = plants.length === 0 ? [null] : plants.filter((p) => selectedPlants.has(p));
  const plannedNames = targetPlants.map(fmdName);

  // Standard .xlsx files don't record per-cell change authorship (that needs Track Changes /
  // shared-workbook history, which isn't something a normal export carries) — the closest reliable
  // signal is workbook-level metadata: who last saved the file, and when. Surfaced on every
  // save (not just the first) so a re-upload's version comment still answers "who touched this".
  const fileMetaLine = () => {
    const meta = historicalRaw?.fileMeta;
    if (!meta) return '';
    const parts: string[] = [];
    if (meta.lastModifiedBy) parts.push(`last modified by: ${meta.lastModifiedBy}`);
    else if (meta.author) parts.push(`author: ${meta.author}`);
    if (meta.modified) parts.push(`modified: ${fmtDate(meta.modified)}`);
    else if (meta.created) parts.push(`created: ${fmtDate(meta.created)}`);
    return parts.join(' · ');
  };

  const initialComment = () => {
    const meta = historicalRaw?.fileMeta;
    const goldenLabel = `Golden FMD ${golden?.latestVersion ?? 'v1.0.0'}`;
    if (!meta) return `Generated from ${goldenLabel}`;
    const parts = [`Converted from "${meta.fileName}"`];
    if (meta.author) parts.push(`author: ${meta.author}`);
    if (meta.lastModifiedBy && meta.lastModifiedBy !== meta.author) parts.push(`last modified by: ${meta.lastModifiedBy}`);
    if (meta.created) parts.push(`created: ${fmtDate(meta.created)}`);
    if (meta.modified && meta.modified !== meta.created) parts.push(`modified: ${fmtDate(meta.modified)}`);
    return `${parts.join(' · ')} — ${goldenLabel}`;
  };

  /** Runs the real conversion for one plant and diffs it against its already-tracked version, shown
   * on its own step rather than folded into the plan — this is a preview only (nothing is saved),
   * so you can decide whether an "existing" plant's update actually looks right before including it.
   * The converted result is cached so clicking Confirm & Generate afterward doesn't pay for the same
   * AI-calling conversion a second time. */
  const openCompare = async (plant: string | null) => {
    const key = plantKeyOf(plant);
    const lineage = plantLineage[key];
    if (!lineage || !historicalRaw || !goldenStructure) return;
    setCompareTarget(key);
    setCompareSummary(null);
    setComparing(true);
    setStep('compare');
    try {
      const slice = sliceForPlant(historicalRaw, selectedSheets, plant);
      const result = await convert({ historicalRaw: slice, goldenStructure });
      setConvertCache((c) => ({ ...c, [key]: { columns: result.columns, tables: result.tables } }));
      const oldRows = lineage.rows.flatMap((t) => t.rows);
      const newRows = result.tables.flatMap((t) => t.rows);
      const renamed = uploadedFileName !== baseName;
      setCompareSummary(buildDiffSummary(oldRows, newRows, renamed ? baseName : undefined, renamed ? uploadedFileName : undefined));
    } catch (err: any) {
      toast.error(err.message ?? 'Could not build the comparison.');
      setStep('plan');
    } finally {
      setComparing(false);
    }
  };

  const generate = async () => {
    if (!historicalRaw || !golden?.latestVersionId || !goldenStructure) return;
    if (targetPlants.length === 0) { toast.error('Pick at least one plant.'); return; }
    setStep('converting');
    setProgress({ done: 0, total: targetPlants.length, failed: [] });
    let newlyCreated = 0;
    const updates: PendingUpdate[] = [];
    const failed: string[] = [];

    for (const plant of targetPlants) {
      const name = fmdName(plant);
      const key = plantKeyOf(plant);
      try {
        // Reuse what the plan step (lineage) and an optional Compare (conversion) already did,
        // rather than re-checking/re-converting from scratch — cheaper, and avoids a second AI call.
        const existing = key in plantLineage ? plantLineage[key] : await findHistoricalLineage(baseName, plant);
        const slice = sliceForPlant(historicalRaw, selectedSheets, plant);
        const result = convertCache[key] ?? await convert({ historicalRaw: slice, goldenStructure });

        if (existing) {
          const oldRows = existing.rows.flatMap((t) => t.rows);
          const newRows = result.tables.flatMap((t) => t.rows);
          const renamed = uploadedFileName !== baseName;
          const metaLine = fileMetaLine();
          const summary = [metaLine && `Re-uploaded file — ${metaLine}.`, buildDiffSummary(oldRows, newRows, renamed ? baseName : undefined, renamed ? uploadedFileName : undefined)]
            .filter(Boolean).join('\n');
          updates.push({ plant, name, columns: result.columns, tables: result.tables, summary, skip: false });
        } else {
          await generateMutation.generate({
            migrationObjectId: null, name, type: 'Custom', class: 'Global', subprojectId: effectiveSubprojectId,
            goldenVersionId: golden.latestVersionId, goldenVersionLabel: golden.latestVersion ?? 'v1.0.0',
            columns: result.columns, tables: result.tables, aiGenerated: true,
            histSourceName: baseName, histPlant: plant, comment: initialComment(),
          });
          newlyCreated += 1;
        }
      } catch (err: any) {
        failed.push(`${name}${err?.message ? ` (${err.message})` : ''}`);
      }
      setProgress((p) => ({ ...p, done: p.done + 1, failed: [...failed] }));
    }

    setCreated(newlyCreated);
    setPendingUpdates(updates);

    if (updates.length > 0) {
      setStep('review');
      return;
    }
    finish(newlyCreated, 0, failed);
  };

  const finish = (createdCount: number, updatedCount: number, failed: string[]) => {
    const total = createdCount + updatedCount + failed.length;
    if (createdCount + updatedCount > 0) {
      const parts = [createdCount > 0 && `${createdCount} new`, updatedCount > 0 && `${updatedCount} updated`].filter(Boolean).join(', ');
      toast.success(`${parts} Custom FMD${total === 1 ? '' : 's'} from ${baseName}.${failed.length ? ` ${failed.length} failed.` : ''}`);
    } else {
      toast.error(`Could not convert any structures from ${baseName}.${failed[0] ? ` ${failed[0]}` : ''}`);
    }
    onClose();
  };

  const updateSummary = (plant: string | null, summary: string) => setPendingUpdates((u) => u.map((x) => (x.plant === plant ? { ...x, summary } : x)));
  const toggleSkipUpdate = (plant: string | null) => setPendingUpdates((u) => u.map((x) => (x.plant === plant ? { ...x, skip: !x.skip } : x)));

  const saveUpdates = async () => {
    if (!golden?.latestVersionId) return;
    setSavingUpdates(true);
    let updatedCount = 0;
    const failed: string[] = [];
    for (const u of pendingUpdates) {
      if (u.skip) continue;
      try {
        await generateMutation.generate({
          migrationObjectId: null, name: u.name, type: 'Custom', class: 'Global', subprojectId: effectiveSubprojectId,
          goldenVersionId: golden.latestVersionId, goldenVersionLabel: golden.latestVersion ?? 'v1.0.0',
          columns: u.columns, tables: u.tables, aiGenerated: true,
          histSourceName: baseName, histPlant: u.plant, comment: u.summary,
        });
        updatedCount += 1;
      } catch (err: any) {
        failed.push(`${u.name}${err?.message ? ` (${err.message})` : ''}`);
      }
    }
    setSavingUpdates(false);
    finish(created, updatedCount, [...progress.failed, ...failed]);
  };

  return (
    <Dialog
      open={open} onClose={onClose} title="Convert Historical FMD" size={step === 'review' ? 'win' : 'lg'} variant="ai"
      processing={busy || step === 'converting' || savingUpdates}
    >
      {step === 'upload' && (
        <div className="flex flex-col gap-3.5 min-h-[420px]">
          <div className="flex items-start gap-2.5 p-3 rounded-[8px] bg-gradient-to-r from-[#eff6ff] to-[#faf5ff]">
            <Sparkles size={16} className="text-[#7c3aed] shrink-0 mt-0.5" />
            <p className="text-sm2 text-text">
              Bring an old Excel-based FMD in — nothing is saved until the converted result is. One Custom FMD per Plant found in the data, or one overall if no Plant is detected.
            </p>
          </div>
          {!paramSubprojectId && (
            <Field label="Subproject" hint="Optional — leave blank to keep the result program-wide.">
              <select value={subprojectId} onChange={(e) => setSubprojectId(e.target.value)} className="w-full text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 min-h-[38px]">
                <option value="">No subproject</option>
                {subprojects.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          )}
          <label className="flex-1 min-h-[160px] border-[1.5px] border-dashed border-violet-bg rounded-[10px] p-7 text-center cursor-pointer hover:border-violet-deep hover:bg-violet-bg/30 transition-colors flex flex-col items-center justify-center">
            <FileSpreadsheet size={26} className="text-violet-deep mx-auto mb-2" />
            <p className="text-sm text-muted">{file?.name || 'Drag and drop the legacy Excel file, or click to browse'}</p>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <AiButton onClick={parseFile} disabled={busy || !file}>{busy ? 'Reading…' : 'Parse File'}</AiButton>
          </div>
        </div>
      )}

      {step === 'match' && matchNotice && (
        <div className="flex flex-col gap-3.5 min-h-[420px]">
          <div className="flex items-start gap-2.5 p-3 rounded-[8px] bg-gradient-to-r from-[#eff6ff] to-[#faf5ff]">
            <RefreshCw size={16} className="text-[#7c3aed] shrink-0 mt-0.5" />
            <p className="text-sm2 text-text">
              {matchNotice.certain
                ? 'This filename looks like a renamed or updated copy of a source we already track.'
                : `Based on the filename, this might be a renamed or updated copy of a source we already track (${matchNotice.confidence} confidence — not an exact match, so please confirm).`}
            </p>
          </div>
          <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] p-4">
            <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1">Detected existing source</div>
            <div className="font-mono font-bold text-sm2 text-text">{matchNotice.matchedName}</div>
          </div>
          <p className="text-sm text-muted">
            Choose <b className="text-text">Yes</b> if this upload is an updated version of that same source — we'll create a <b className="text-text">new version</b> of "{matchNotice.matchedName}"'s already-tracked FMD(s), keeping their full version history intact instead of duplicating them.
            <br />
            Choose <b className="text-text">No</b> if this is actually a different, unrelated source — we'll create <b className="text-text">brand-new FMD(s)</b> from it instead.
          </p>
          <div className="flex-1" />
          <div className="flex justify-between gap-2.5">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <div className="flex gap-2.5">
              <Button variant="secondary" onClick={confirmNewSource}>No, different file</Button>
              <AiButton onClick={confirmSameSource}>Yes, same source</AiButton>
            </div>
          </div>
        </div>
      )}

      {step === 'sheets' && historicalRaw && (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">Pick which parsed sheets actually contain field-mapping data — likely candidates are pre-checked.</p>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={selectAllSheets} className="text-2xs font-semibold text-blue hover:underline">Select all</button>
              <button onClick={deselectAllSheets} className="text-2xs font-semibold text-blue hover:underline">Deselect all</button>
            </div>
          </div>
          <SheetGroup
            title="Suggested" sheets={historicalRaw.sheets.filter((s) => SUGGESTED_SHEET_PATTERN.test(s.name))}
            selected={selectedSheets} onToggle={toggleSheet}
          />
          <SheetGroup
            title="Other sheets" sheets={historicalRaw.sheets.filter((s) => !SUGGESTED_SHEET_PATTERN.test(s.name))}
            selected={selectedSheets} onToggle={toggleSheet}
          />
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <AiButton onClick={goToPlan} disabled={selectedSheets.size === 0}>Continue</AiButton>
          </div>
        </div>
      )}

      {step === 'plan' && (
        <div className="flex flex-col gap-3.5">
          {!golden?.latestVersionId || !goldenStructure ? (
            <p className="text-sm text-muted py-6 text-center">No Golden FMD structure exists yet — design one first in Library &gt; Field Mapping.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-text">
                  {plants.length === 0
                    ? 'No Plant was detected in the selected sheets — this will create one FMD.'
                    : `Found ${plants.length} distinct Plant${plants.length === 1 ? '' : 's'} — pick which ones to generate an FMD for.`}
                </p>
                {plants.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={selectAllPlants} className="text-2xs font-semibold text-blue hover:underline">Select all</button>
                    <button onClick={deselectAllPlants} className="text-2xs font-semibold text-blue hover:underline">Deselect all</button>
                  </div>
                )}
              </div>
              <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] max-h-72 overflow-auto">
                {plants.length === 0 ? (
                  <div className="flex items-center gap-2.5 px-3 py-2 text-sm2">
                    <CheckCircle2 size={14} className="text-green shrink-0" />
                    <span className="font-mono flex-1">{plannedNames[0]}</span>
                    <PlanLineageBadge checking={checkingLineage} lineage={plantLineage['']} onCompare={() => openCompare(null)} />
                  </div>
                ) : (
                  plants.map((p) => (
                    <label key={p} className={clsx('flex items-center gap-2.5 px-3 py-2 border-b border-line last:border-b-0 cursor-pointer hover:bg-blue-pale', selectedPlants.has(p) && 'bg-blue-pale')}>
                      <input type="checkbox" checked={selectedPlants.has(p)} onChange={() => togglePlant(p)} className="w-3.5 h-3.5 accent-[var(--blue)] shrink-0" />
                      <span className="text-sm2 font-mono flex-1">{fmdName(p)}</span>
                      <PlanLineageBadge checking={checkingLineage} lineage={plantLineage[plantKeyOf(p)]} onCompare={() => openCompare(p)} />
                    </label>
                  ))
                )}
              </div>
              <p className="text-2xs text-muted">A plant with no existing FMD is generated and saved right away. One that already has a tracked FMD is converted and diffed against its previous version first — you'll review the field-by-field change summary before it saves as a new version. Click <b>Compare</b> to preview that diff now, before generating.</p>
            </>
          )}
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setStep('sheets')}>Back</Button>
            <AiButton onClick={generate} disabled={!golden?.latestVersionId || !goldenStructure || plannedNames.length === 0}>
              <Sparkles size={14} /> Confirm & Generate {plannedNames.length} FMD{plannedNames.length === 1 ? '' : 's'}
            </AiButton>
          </div>
        </div>
      )}

      {step === 'compare' && (
        <div className="flex flex-col gap-3.5">
          <h3 className="text-sm font-bold text-text">
            Comparing {fmdName(compareTarget === '' ? null : compareTarget)}
          </h3>
          {comparing ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Sparkles size={26} className="text-violet-deep animate-pulse" />
              <p className="text-sm font-semibold text-text">Converting and comparing with the tracked version…</p>
            </div>
          ) : (
            <>
              <div>
                <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1.5">Source file</div>
                <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] p-3.5 grid grid-cols-2 gap-x-6 gap-y-2">
                  <MetaField label="File name" value={historicalRaw?.fileMeta?.fileName} />
                  <MetaField label="Author" value={historicalRaw?.fileMeta?.author} />
                  <MetaField label="Last modified by" value={historicalRaw?.fileMeta?.lastModifiedBy} />
                  <MetaField label="Created" value={historicalRaw?.fileMeta?.created ? fmtDate(historicalRaw.fileMeta.created) : undefined} />
                  <MetaField label="Modified" value={historicalRaw?.fileMeta?.modified ? fmtDate(historicalRaw.fileMeta.modified) : undefined} />
                </div>
              </div>
              <div>
                <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1.5">What changed vs. the tracked version</div>
                <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] p-3.5 max-h-[280px] overflow-auto">
                  <p className="text-sm2 whitespace-pre-wrap">{compareSummary || 'No field-level changes detected.'}</p>
                </div>
              </div>
              <p className="text-2xs text-muted">This is a preview only — nothing is saved. If it looks right, go back and make sure this plant stays checked, then Confirm &amp; Generate.</p>
            </>
          )}
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setStep('plan')} disabled={comparing}>Back to plan</Button>
          </div>
        </div>
      )}

      {step === 'converting' && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Sparkles size={28} className="text-violet-deep animate-pulse" />
          <p className="text-sm font-semibold text-text">Converting {progress.done} of {progress.total}…</p>
          <div className="w-64 h-1.5 rounded-full bg-blue-light overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#3b82f6] to-[#a855f7] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          {progress.failed.length > 0 && <p className="text-2xs text-red">{progress.failed.length} failed so far</p>}
        </div>
      )}

      {step === 'review' && (
        <div className="h-full flex flex-col gap-3.5">
          <p className="text-sm text-text shrink-0">
            {created > 0 && <>{created} new FMD{created === 1 ? '' : 's'} already saved. </>}
            Review what changed for the {pendingUpdates.length} plant{pendingUpdates.length === 1 ? '' : 's'} that already had a tracked FMD before saving the update.
          </p>
          <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-4 pr-1">
            {pendingUpdates.map((u) => (
              <div key={u.plant ?? 'single'} className={clsx('rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden', u.skip && 'opacity-50')}>
                <div className="flex items-center justify-between gap-2 px-4 py-3 bg-[#eef1f5] border-b border-line">
                  <span className="text-md font-mono font-bold text-text">{u.name}</span>
                  <button onClick={() => toggleSkipUpdate(u.plant)} className="text-2xs font-semibold text-blue hover:underline shrink-0">
                    {u.skip ? 'Include this update' : 'Skip this one'}
                  </button>
                </div>
                <div className="p-4 flex flex-col gap-4">
                  <div>
                    <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-2">What changed</div>
                    <DiffSummaryPreview summary={u.summary} />
                  </div>
                  <div>
                    <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1.5">Version comment (edit before saving)</div>
                    <textarea
                      value={u.summary} onChange={(e) => updateSummary(u.plant, e.target.value)} rows={4} disabled={u.skip}
                      className="w-full text-sm2 bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 resize-y disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2.5 shrink-0">
            <Button variant="secondary" onClick={onClose} disabled={savingUpdates}>Cancel remaining</Button>
            <AiButton onClick={saveUpdates} disabled={savingUpdates}>
              {savingUpdates ? 'Saving…' : `Save ${pendingUpdates.filter((u) => !u.skip).length} Update${pendingUpdates.filter((u) => !u.skip).length === 1 ? '' : 's'}`}
            </AiButton>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Existing/New status for one plant row on the plan step, plus (only when existing) a Compare
 * link — wrapped in stopPropagation since these rows are inside a <label>, where any click
 * (including a nested button) would otherwise also toggle that row's checkbox. */
function PlanLineageBadge({ checking, lineage, onCompare }: {
  checking: boolean; lineage: { fmdId: string; rows: GeneratedTable[] } | null | undefined; onCompare: () => void;
}) {
  if (checking) return <span className="text-2xs text-muted shrink-0">Checking…</span>;
  if (lineage === undefined) return null;
  if (!lineage) return <Tag variant="neutral" className="shrink-0">New</Tag>;
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <Tag variant="warn">Existing</Tag>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCompare(); }}
        className="text-2xs font-semibold text-blue hover:underline"
      >
        Compare
      </button>
    </span>
  );
}

function MetaField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted">{label}</div>
      <div className="text-sm2 text-text">{value}</div>
    </div>
  );
}

/** Highlighted, field-grouped rendering of a buildDiffSummary() comment (src/lib/rowDiff.ts) — one
 * card per row (SRC_FIELD/TGT_FIELD) with every column that changed on it underneath, each column
 * name badged so the field that actually moved stands out instead of getting lost in prose. Purely
 * a read-only preview of whatever the editable comment below it currently says. */
function DiffSummaryPreview({ summary }: { summary: string }) {
  const entries = useMemo(() => parseDiffSummary(summary), [summary]);
  const { standalone, byLabel } = useMemo(() => groupDiffEntries(entries), [entries]);
  const isEmpty = entries.length === 0 || (entries.length === 1 && entries[0].kind === 'plain' && /no field-level changes/i.test(entries[0].text));

  if (isEmpty) return <p className="text-sm2 text-muted">No field-level changes detected.</p>;

  return (
    <div className="flex flex-col gap-2.5">
      {standalone.map((e, i) => (
        <p key={i} className="text-sm2 text-text">
          {e.kind === 'rename'
            ? <>Source file renamed from <span className="font-mono font-semibold">{e.from}</span> to <span className="font-mono font-semibold">{e.to}</span>.</>
            : e.text}
        </p>
      ))}
      {[...byLabel.entries()].map(([label, changes]) => (
        <div key={label} className="rounded-[8px] shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
          <div className="flex items-center gap-2 bg-blue-pale px-3 py-1.5 border-b border-line">
            <Tag variant="table">{label}</Tag>
            <span className="text-2xs text-muted">{changes.length} field{changes.length === 1 ? '' : 's'} changed</span>
          </div>
          <div className="flex flex-col divide-y divide-line">
            {changes.map((c, i) => (
              <div key={i} className="px-3 py-2.5">
                {c.kind === 'changed' ? (
                  <div className="flex flex-col gap-1.5">
                    <Tag variant="column" className="w-fit">{c.field}</Tag>
                    <div className="grid grid-cols-[36px_1fr] gap-x-2 gap-y-1 items-baseline">
                      <span className="text-2xs font-bold text-red-ink">Was</span>
                      <span className="text-sm2 text-red-ink line-through decoration-1">{c.was || '—'}</span>
                      <span className="text-2xs font-bold text-green">Now</span>
                      <span className="text-sm2 text-green font-semibold">{c.now || '—'}</span>
                    </div>
                  </div>
                ) : c.kind === 'added' ? (
                  <span className="inline-flex items-center gap-[5px] text-xs font-semibold px-2.5 py-[3px] rounded-pill bg-green-bg text-green">+ New field mapping</span>
                ) : (
                  <Tag variant="danger">− Field mapping removed</Tag>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SheetGroup({ title, sheets, selected, onToggle }: { title: string; sheets: { name: string; headers: string[]; rows: string[][] }[]; selected: Set<string>; onToggle: (name: string) => void }) {
  if (sheets.length === 0) return null;
  return (
    <div>
      <div className="text-2xs font-bold uppercase tracking-[.04em] text-muted mb-1.5">{title} ({sheets.length})</div>
      <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
        {sheets.map((s) => (
          <label key={s.name} className={clsx('flex items-center gap-2.5 px-3 py-2 border-b border-line last:border-b-0 cursor-pointer hover:bg-blue-pale', selected.has(s.name) && 'bg-blue-pale')}>
            <input type="checkbox" checked={selected.has(s.name)} onChange={() => onToggle(s.name)} className="w-3.5 h-3.5 accent-[var(--blue)] shrink-0" />
            <span className="font-semibold text-sm2 text-text">{s.name}</span>
            <span className="text-2xs text-muted ml-auto shrink-0">{s.rows.length} rows · {s.headers.length} cols</span>
          </label>
        ))}
      </div>
    </div>
  );
}

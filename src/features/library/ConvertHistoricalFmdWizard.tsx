import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, FileSpreadsheet, RefreshCw, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { AiButton } from '../../components/AiButton';
import { Field } from '../../components/Field';
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

type Step = 'upload' | 'sheets' | 'plan' | 'converting' | 'review';

interface PendingUpdate {
  plant: string | null; name: string; columns: GeneratedColumn[]; tables: GeneratedTable[];
  summary: string; skip: boolean;
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

  useEffect(() => {
    if (!open) return;
    setStep('upload');
    setSubprojectId(''); setFile(null); setBusy(false);
    setBaseName(''); setUploadedFileName(''); setMatchNotice(null); setHistoricalRaw(null);
    setSelectedSheets(new Set()); setPlants([]); setSelectedPlants(new Set());
    setProgress({ done: 0, total: 0, failed: [] }); setCreated(0); setPendingUpdates([]); setSavingUpdates(false);
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
      let name = ownName;

      if (!knownSourceNames.includes(ownName) && knownSourceNames.length > 0) {
        // Exact match after stripping a revision suffix (e.g. "_v2") first — the common case.
        // Falls back to token-overlap similarity for renames that don't fit that pattern (changed
        // separators, reworded filename, etc). Both are plain JS — no AI call, no network
        // dependency, so this can never silently fail to fire the way an Edge Function round-trip
        // could (and did — the previous AI-based fallback proved unreliable in practice).
        const deterministic = findDeterministicSourceMatch(ownName, knownSourceNames);
        if (deterministic) {
          name = deterministic;
          setMatchNotice({ matchedName: deterministic, confidence: 'high', certain: true });
        } else {
          const fuzzy = findFuzzySourceMatch(ownName, knownSourceNames);
          if (fuzzy) {
            if (fuzzy.certain) name = fuzzy.name;
            setMatchNotice({ matchedName: fuzzy.name, confidence: fuzzy.certain ? 'high' : 'medium', certain: fuzzy.certain });
          }
        }
      }

      const raw = await parseHistoricalFile(file);
      setHistoricalRaw(raw);
      setBaseName(name);
      setSelectedSheets(new Set(raw.sheets.filter((s) => SUGGESTED_SHEET_PATTERN.test(s.name)).map((s) => s.name)));
      setStep('sheets');
    } catch (err: any) {
      toast.error(err.message ?? 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const acceptSuggestedMatch = () => {
    if (!matchNotice) return;
    setBaseName(matchNotice.matchedName);
    setMatchNotice(null);
  };
  const useNewSourceInstead = () => {
    setBaseName(uploadedFileName);
    setMatchNotice(null);
  };

  const toggleSheet = (name: string) => setSelectedSheets((s) => {
    const next = new Set(s);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const goToPlan = () => {
    if (!historicalRaw || selectedSheets.size === 0) { toast.error('Pick at least one sheet.'); return; }
    const found = extractPlants(historicalRaw, selectedSheets);
    setPlants(found);
    setSelectedPlants(new Set(found));
    setStep('plan');
  };

  const togglePlant = (plant: string) => setSelectedPlants((s) => {
    const next = new Set(s);
    if (next.has(plant)) next.delete(plant); else next.add(plant);
    return next;
  });

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
      try {
        const existing = await findHistoricalLineage(baseName, plant);
        const slice = sliceForPlant(historicalRaw, selectedSheets, plant);
        const result = await convert({ historicalRaw: slice, goldenStructure });

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
      open={open} onClose={onClose} title="Convert Historical FMD" size="lg" variant="ai"
      processing={busy || step === 'converting' || savingUpdates}
    >
      {step === 'upload' && (
        <div className="flex flex-col gap-3.5">
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
          <label className="border-[1.5px] border-dashed border-violet-bg rounded-[10px] p-7 text-center cursor-pointer hover:border-violet-deep hover:bg-violet-bg/30 transition-colors">
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

      {step === 'sheets' && historicalRaw && (
        <div className="flex flex-col gap-3.5">
          {matchNotice && (
            <div className="flex items-start gap-2.5 p-3 rounded-[8px] bg-gradient-to-r from-[#eff6ff] to-[#faf5ff]">
              <RefreshCw size={15} className="text-[#7c3aed] shrink-0 mt-0.5" />
              <div className="text-sm2 text-text flex-1">
                {matchNotice.certain ? (
                  <>
                    Detected: this filename is a renamed re-upload of the already-tracked source <span className="font-mono font-bold">{matchNotice.matchedName}</span> — plants from that source will be updated with new versions instead of duplicated.
                    <button onClick={useNewSourceInstead} className="block mt-1 text-2xs font-semibold text-blue hover:underline">No, treat this as a new, unrelated source</button>
                  </>
                ) : (
                  <>
                    AI thinks ({matchNotice.confidence} confidence) this filename might be a rename of the already-tracked source <span className="font-mono font-bold">{matchNotice.matchedName}</span>.
                    <div className="flex gap-3 mt-1.5">
                      <button onClick={acceptSuggestedMatch} className="text-2xs font-semibold text-blue hover:underline">Yes, same source — merge with existing</button>
                      <button onClick={() => setMatchNotice(null)} className="text-2xs font-semibold text-muted hover:underline">No, treat as new</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          <p className="text-sm text-muted">Pick which parsed sheets actually contain field-mapping data — likely candidates are pre-checked.</p>
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
              <p className="text-sm text-text">
                {plants.length === 0
                  ? 'No Plant was detected in the selected sheets — this will create one FMD.'
                  : `Found ${plants.length} distinct Plant${plants.length === 1 ? '' : 's'} — pick which ones to generate an FMD for.`}
              </p>
              <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] max-h-72 overflow-auto">
                {plants.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-sm2 font-mono">
                    <CheckCircle2 size={14} className="text-green shrink-0" /> {plannedNames[0]}
                  </div>
                ) : (
                  plants.map((p) => (
                    <label key={p} className={clsx('flex items-center gap-2.5 px-3 py-2 border-b border-line last:border-b-0 cursor-pointer hover:bg-blue-pale', selectedPlants.has(p) && 'bg-blue-pale')}>
                      <input type="checkbox" checked={selectedPlants.has(p)} onChange={() => togglePlant(p)} className="w-3.5 h-3.5 accent-[var(--blue)] shrink-0" />
                      <span className="text-sm2 font-mono">{fmdName(p)}</span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-2xs text-muted">A plant with no existing FMD is generated and saved right away. One that already has a tracked FMD is converted and diffed against its previous version first — you'll review the field-by-field change summary before it saves as a new version.</p>
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
        <div className="flex flex-col gap-3.5">
          <p className="text-sm text-text">
            {created > 0 && <>{created} new FMD{created === 1 ? '' : 's'} already saved. </>}
            Review what changed for the {pendingUpdates.length} plant{pendingUpdates.length === 1 ? '' : 's'} that already had a tracked FMD before saving the update.
          </p>
          <div className="flex flex-col gap-3 max-h-[420px] overflow-auto">
            {pendingUpdates.map((u) => (
              <div key={u.plant ?? 'single'} className={clsx('rounded-lg shadow-[inset_0_0_0_1px_var(--line)] p-3', u.skip && 'opacity-50')}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm2 font-mono font-bold">{u.name}</span>
                  <button onClick={() => toggleSkipUpdate(u.plant)} className="text-2xs font-semibold text-blue hover:underline shrink-0">
                    {u.skip ? 'Include this update' : 'Skip this one'}
                  </button>
                </div>
                <textarea
                  value={u.summary} onChange={(e) => updateSummary(u.plant, e.target.value)} rows={3} disabled={u.skip}
                  className="w-full text-sm2 bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 resize-y disabled:opacity-60"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2.5">
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

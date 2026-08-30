import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Field';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
import {
  resetTotal, useTestDataReset, type ResetCounts, type ResetMode,
} from '../../lib/queries/testReset';

/* TEMPORARY — see src/lib/queries/testReset.ts. Remove with it. */

/** Hierarchy rows first, because they are the bigger thing being removed, and shown only in the
 * mode that removes them. */
const ROWS: { key: keyof ResetCounts; label: string; from?: ResetMode }[] = [
  { key: 'programs', label: 'Programs', from: 'everything' },
  { key: 'projects', label: 'Projects', from: 'hierarchy' },
  { key: 'subprojects', label: 'Subprojects', from: 'hierarchy' },
  { key: 'cycles', label: 'Cycles', from: 'hierarchy' },
  { key: 'fmds', label: 'Field Mappings' },
  { key: 'rules', label: 'Rules' },
  { key: 'xrefs', label: 'Cross Reference tables' },
  { key: 'scopeObjects', label: 'Scope objects' },
  { key: 'candidates', label: 'Scope candidates' },
  { key: 'waivers', label: 'Dependency waivers' },
  { key: 'plants', label: 'Plants', from: 'everything' },
  { key: 'archiveRequests', label: 'Archive requests', from: 'everything' },
  { key: 'changeLog', label: 'Change log entries', from: 'everything' },
];

const MODES: { value: ResetMode; label: string; detail: string }[] = [
  {
    value: 'data',
    label: 'Working data only',
    detail: 'Scope, Field Mappings, rules and XREF. Projects and subprojects stay, so the same waves can be walked again.',
  },
  {
    value: 'hierarchy',
    label: 'Projects and subprojects too',
    detail: 'Everything above, plus the projects, subprojects and cycles themselves. Only the program survives.',
  },
  {
    value: 'everything',
    label: 'Everything, every program',
    detail: 'The whole system: all programs, plants, archive requests, the change log, and every Field Mapping including Golden and Standard. Only the SAP object catalogue and your sign-in survive.',
  },
];

/** Empties one programme so a test run can be walked again from the top.
 *
 * Four things make this safe enough to keep in the app while it is being built: it is scoped to one
 * programme rather than everything you can see, the destructive scope is an explicit choice rather
 * than an assumption, it counts what it will remove BEFORE asking, and it requires the programme's
 * code typed out — a confirm button alone is muscle memory by the third time you use it. */
export function ResetTestDataDialog({ open, programs, onClose }: {
  open: boolean;
  programs: { id: string; code: string; name: string }[];
  onClose: () => void;
}) {
  const toast = useToast();
  const { previewReset, previewResetEverything, resetProgram } = useTestDataReset();

  const [programId, setProgramId] = useState('');
  const [mode, setMode] = useState<ResetMode>('data');
  const [counts, setCounts] = useState<ResetCounts | null>(null);
  /** Why the count failed, when it did.
   *
   * Tracked separately from `counts` because conflating them was a real bug: a failed preview left
   * `counts` null, and the panel rendered null exactly like zero — so a dialog that could not read
   * the database told you the program was already empty. In a delete dialog that is the worst thing
   * to get wrong, because the reasonable next move is to go and delete something by hand. */
  const [countError, setCountError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const program = programs.find((p) => p.id === programId);

  useEffect(() => {
    if (!open) return;
    setProgramId((current) => current || programs[0]?.id || '');
    setTyped('');
    setMode('data');
  }, [open, programs]);

  // Recounted on programme AND mode: 'everything' counts the whole system rather than one
  // programme, so the numbers on screen always describe the button directly below them.
  useEffect(() => {
    if (!open || !programId) { setCounts(null); setCountError(null); return; }
    let cancelled = false;
    setLoading(true);
    setCounts(null);
    setCountError(null);
    (mode === 'everything' ? previewResetEverything() : previewReset(programId))
      .then((c) => { if (!cancelled) setCounts(c); })
      .catch((err: any) => {
        if (cancelled) return;
        // Shown in the panel, not only as a toast — a toast is gone in four seconds, and this is
        // the one fact that decides whether the button below can be trusted.
        setCountError(err?.message || 'The database did not say why.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // previewReset and toast are stable; re-running on their identity would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, programId, mode]);

  const total = counts ? resetTotal(counts, mode) : 0;
  /* A row appears in the mode that introduces it and every larger mode: data < hierarchy <
     everything. Keeps the panel showing exactly what the chosen mode removes, so switching mode
     visibly changes the list rather than only the total. */
  const RANK: Record<ResetMode, number> = { data: 0, hierarchy: 1, everything: 2 };
  const rows = ROWS.filter((r) => (
    RANK[mode] >= RANK[r.from ?? 'data'] && (counts?.[r.key] ?? 0) > 0
  ));
  /* What has to be typed. The programme code is the right gate for a programme-scoped reset, but
     it is far too small a word for one that empties the system — the phrase makes the scale of the
     action something you have to spell out. */
  const phrase = mode === 'everything' ? 'DELETE EVERYTHING' : (program?.code ?? '');
  const confirmed = !!phrase && typed.trim().toUpperCase() === phrase.toUpperCase();
  // Never runnable on a failed count: not knowing what is there is exactly when not to delete it.
  const canRun = confirmed && !busy && !loading && !countError && total > 0;

  const run = async () => {
    if (!canRun || !program) return;
    setBusy(true);
    try {
      const removed = await resetProgram(program.id, mode);
      toast.success(mode === 'everything'
        ? `System reset — ${resetTotal(removed, mode)} records removed. The SAP object catalogue is untouched.`
        : `${program.code} reset — ${resetTotal(removed, mode)} records removed.`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Could not reset the program.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reset test data"
      subtitle="Temporary — for rebuilding a test program from scratch"
      /* Two columns at `lg` rather than one at `sm`. Stacked in 440px this ran nearly the full
         viewport height, which put the choice of how much to delete and the count of what that
         means several screens apart — the two things a person needs to weigh against each other.
         Side by side, changing the mode visibly changes the list beside it. */
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="primary"
            onClick={run}
            disabled={!canRun}
            className="bg-red hover:bg-red text-white hover:brightness-110"
          >
            {busy ? 'Deleting…' : 'Delete these records'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2.5 rounded border border-red/30 bg-red-light px-3.5 py-2.5">
          <AlertTriangle size={15} className="shrink-0 mt-px text-red-ink" />
          <p className="text-sm2 text-red-ink">
            This permanently deletes working data. It cannot be undone from inside the app — unlike
            Archive, nothing is recoverable afterwards.
          </p>
        </div>

        {/* Decision on the left, consequence on the right. `items-start` so the two columns keep
            their own heights instead of one stretching to match the other. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">

          <div className="flex flex-col gap-3.5 min-w-0">
            {/* Disabled rather than hidden in 'everything' mode: a control that vanishes leaves
                you wondering whether the scope narrowed, where a greyed one with a reason states
                plainly that the programme no longer decides anything. */}
            <Field
              label="Program"
              htmlFor="reset-program"
              hint={mode === 'everything' ? 'Not used — this mode reaches every program.' : undefined}
            >
              <Select
                id="reset-program" value={programId} disabled={mode === 'everything'}
                onChange={(e) => setProgramId(e.target.value)}
              >
                {programs.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>

            <Field label="How much to delete">
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="How much to delete">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    onClick={() => setMode(m.value)}
                    aria-checked={mode === m.value}
                    className={clsx(
                      'flex items-start gap-2.5 text-left rounded-lg border px-3 py-2.5 transition-colors',
                      mode === m.value
                        ? 'border-red bg-red-light'
                        : 'border-line bg-surface hover:bg-surface-2',
                    )}
                  >
                    {/* A real radio mark. The previous cards signalled selection with a tinted
                        border alone, which on a destructive choice is too quiet to be sure of. */}
                    <span className={clsx(
                      'mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 grid place-items-center',
                      mode === m.value ? 'border-red' : 'border-line-strong',
                    )}>
                      {mode === m.value && <span className="w-1.5 h-1.5 rounded-full bg-red" />}
                    </span>
                    <span className="min-w-0">
                      <span className={clsx('block text-sm2 font-semibold', mode === m.value && 'text-red-ink')}>
                        {m.label}
                      </span>
                      <span className="block text-2xs text-muted mt-0.5">{m.detail}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div className="flex flex-col gap-3 min-w-0">
            <div className="rounded-lg border border-line overflow-hidden">
              <div className="flex items-baseline justify-between px-3.5 py-2 bg-surface-3">
                <span className="text-2xs font-semibold uppercase tracking-[.06em] text-muted">
                  Will be deleted
                </span>
                {!loading && !countError && total > 0 && (
                  <span className="text-2xs text-muted tabular-nums">{total} records</span>
                )}
              </div>
              <div className="flex flex-col">
                {loading ? (
                  <p className="px-3.5 py-4 text-sm2 text-muted">Counting…</p>
                ) : countError ? (
                  /* Never "nothing to delete" on a failure — that reads as an all-clear and is the
                     one wrong conclusion this panel can lead someone to. */
                  <p className="px-3.5 py-4 text-sm2 text-red-ink">
                    Could not read what is there — {countError} Nothing has been deleted, and the
                    button below stays disabled until this succeeds.
                  </p>
                ) : rows.length > 0 ? (
                  <>
                    {rows.map((r) => (
                      <div key={r.key} className="flex items-baseline justify-between px-3.5 py-[7px] border-t border-line-soft first:border-t-0">
                        <span className="text-sm2">{r.label}</span>
                        <span className="font-mono text-sm2 font-bold tabular-nums">{counts![r.key]}</span>
                      </div>
                    ))}
                    {/* The magnitude, without making anyone add up six numbers to find it. */}
                    <div className="flex items-baseline justify-between px-3.5 py-2 border-t border-line bg-surface-2">
                      <span className="text-sm2 font-semibold">Total</span>
                      <span className="font-mono text-sm2 font-bold tabular-nums text-red-ink">{total}</span>
                    </div>
                  </>
                ) : (
                  <p className="px-3.5 py-4 text-sm2 text-muted">
                    Nothing to delete — this program has no{' '}
                    {mode === 'hierarchy' ? 'projects or subprojects' : 'scope, mappings, rules or XREF tables'} yet.
                  </p>
                )}
              </div>
            </div>

            {/* Named explicitly rather than left to be discovered. "Deletes all FMDs" and "deletes
                all FMDs except the ones you spent a day designing" are very different promises. */}
            <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
              <ShieldCheck size={15} className="shrink-0 mt-px text-green" />
              {mode === 'everything' ? (
                <p className="text-2xs text-muted">
                  <strong className="text-text">Kept:</strong> the SAP object catalogue (442
                  objects and their structures and fields), users and roles. Everything else goes,
                  including the Golden FMD, every Standard FMD and the Golden XREF.
                  <br /><br />
                  The catalogue is <em>owned</em> by a program through a cascading key, so the
                  programs holding it survive as empty shells rather than being deleted — losing
                  them would take the catalogue too, and it only comes back from a re-seed.
                </p>
              ) : (
                <p className="text-2xs text-muted">
                  <strong className="text-text">Kept either way:</strong> the program itself, the
                  Golden FMD, every Standard FMD, the Golden XREF, your plants and the SAP object
                  catalogue. Those are program-wide or system-wide records, and neither of these
                  two modes can reach them.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Last, spanning both columns: the gate comes after both halves have been read.
            The input is sized to the thing being typed — a six-character code in a 960px field
            reads as a form to fill in rather than as the deliberate act it is. */}
        {total > 0 && !countError && (
          <div className="flex items-center gap-3 border-t border-line pt-3.5">
            <label htmlFor="reset-confirm" className="text-sm2 shrink-0">
              Type <span className="font-mono text-text">{phrase}</span> to confirm
            </label>
            {/* Width lives on a wrapper, not on the Input. `Input` bakes in `w-full`, and two
                width utilities on one element are settled by stylesheet order rather than by the
                order they are written — which is how this ended up full-bleed and pushed a
                horizontal scrollbar across the whole dialog. */}
            <div className={clsx('shrink-0', mode === 'everything' ? 'w-[220px]' : 'w-[150px]')}>
              <Input
                id="reset-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={phrase}
                className="font-mono uppercase"
                autoComplete="off"
              />
            </div>
            {confirmed && (
              <span className="text-2xs text-green font-semibold">Confirmed</span>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

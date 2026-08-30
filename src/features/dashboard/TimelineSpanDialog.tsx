import { useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Select } from '../../components/Select';
import { MAX_SPAN_MONTHS, spanFromMonths, spanMonths, type Span } from './programTimeline';

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'short' }));

/** Years offered in the pickers: a decade around now, which covers every programme this app plans
 * without turning the dropdown into a scroll. */
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 12 }, (_, i) => THIS_YEAR - 3 + i);

/** How far the chart looks, and how finely it is ruled.
 *
 * The chart fits itself to the data by default, which is right until one cycle a year out stretches
 * every other bar into a sliver. This is the way back: pick the months you actually want to read.
 *
 * Deliberately not a date picker — the chart is ruled in months, so offering days would let someone
 * choose a range the chart then silently rounds. Month and year is what it can honour exactly. */
export function TimelineSpanDialog({ open, span, showWeekBands, onApply, onClose }: {
  open: boolean;
  /** The span currently drawn — including the one the chart derived for itself, so opening this
   * starts from what is on screen rather than from an arbitrary default. */
  span: Span | null;
  showWeekBands: boolean;
  onApply: (span: Span, showWeekBands: boolean) => void;
  onClose: () => void;
}) {
  const [fromMonth, setFromMonth] = useState(0);
  const [fromYear, setFromYear] = useState(THIS_YEAR);
  const [toMonth, setToMonth] = useState(11);
  const [toYear, setToYear] = useState(THIS_YEAR);
  const [bands, setBands] = useState(showWeekBands);

  // Reseeded each time it opens: the chart may have re-fitted itself since last time, and a dialog
  // that opens on stale values makes Done look like it moved something it did not.
  useEffect(() => {
    if (!open) return;
    const from = span?.from ?? new Date(THIS_YEAR, 0, 1);
    const to = span?.to ?? new Date(THIS_YEAR, 11, 31);
    setFromMonth(from.getMonth()); setFromYear(from.getFullYear());
    setToMonth(to.getMonth()); setToYear(to.getFullYear());
    setBands(showWeekBands);
  }, [open, span, showWeekBands]);

  const next = spanFromMonths(fromYear, fromMonth, toYear, toMonth);
  const months = spanMonths(next);
  const invalid = months < 1
    ? 'The end month is before the start month.'
    : months > MAX_SPAN_MONTHS
      ? `That is ${Math.round(months / 12 * 10) / 10} years. Month columns get too narrow to read past ${MAX_SPAN_MONTHS / 12}.`
      : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Calendar"
      subtitle="The date span shown on the chart above."
      size="sm"
      footer={
        <div className="flex justify-end">
          <Button onClick={() => { onApply(next, bands); onClose(); }} disabled={!!invalid}>Done</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <span className="block text-2xs font-bold uppercase tracking-[.08em] text-muted mb-1.5">From</span>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Month">
              <Select value={fromMonth} onChange={(e) => setFromMonth(Number(e.target.value))} className="w-full">
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </Select>
            </Field>
            <Field label="Year">
              <Select value={fromYear} onChange={(e) => setFromYear(Number(e.target.value))} className="w-full">
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
          </div>
        </div>

        <div>
          <span className="block text-2xs font-bold uppercase tracking-[.08em] text-muted mb-1.5">To</span>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Month">
              <Select value={toMonth} onChange={(e) => setToMonth(Number(e.target.value))} className="w-full">
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </Select>
            </Field>
            <Field label="Year">
              <Select value={toYear} onChange={(e) => setToYear(Number(e.target.value))} className="w-full">
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
          </div>
        </div>

        {/* The span in words, right where it is being chosen — the pickers alone never say how long
            the result is, which is the one thing that decides whether the chart stays readable. */}
        <p className={invalid ? 'text-2xs text-red' : 'text-2xs text-muted'}>
          {invalid ?? `${months} month${months === 1 ? '' : 's'} · maximum span is ${MAX_SPAN_MONTHS / 12} years`}
        </p>

        <label className="flex items-center gap-2 text-sm2 cursor-pointer">
          <input
            type="checkbox"
            checked={bands}
            onChange={(e) => setBands(e.target.checked)}
            className="accent-[var(--blue)] w-4 h-4"
          />
          Show week bands
        </label>
      </div>
    </Dialog>
  );
}

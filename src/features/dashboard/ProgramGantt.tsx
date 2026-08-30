import { useMemo } from 'react';
import { Snowflake, Star } from 'lucide-react';
import clsx from 'clsx';
import { EmptyState } from '../../components/EmptyState';
import {
  daysBetween, formatMonthYear, parseDate, useProgramTimeline,
  type MarkerKind, type Span, type TaskRow,
} from './programTimeline';

/** Rail width. Wide enough for a wave name plus the two or three legend lines under it, and fixed
 * so every row's bar starts on the same edge — the alignment is what makes the chart scannable. */
const RAIL = 220;

/** Glyph and colour per marker kind, used by the chart AND by the legend above it, so a symbol
 * cannot appear on the chart in a colour the legend does not explain. */
const MARKER: Record<MarkerKind, { Icon: typeof Snowflake; className: string; dot: string; legend: string }> = {
  // `dot` is spelled out rather than derived from `className` — Tailwind only ships classes it can
  // find in the source, so a class built at runtime by swapping "text-" for "bg-" resolves to
  // nothing and the legend dots come out invisible.
  'data-freeze': { Icon: Snowflake, className: 'text-blue-mid', dot: 'bg-blue-mid', legend: 'Data freeze' },
  'fmd-freeze': { Icon: Snowflake, className: 'text-amber', dot: 'bg-amber', legend: 'FMD freeze' },
  milestone: { Icon: Star, className: 'text-amber-ink', dot: 'bg-amber-ink', legend: 'Milestone' },
};

/** The programme structure as a Gantt: every wave and cycle, its span, and the deadlines on it.
 *
 * The rows and the date window come from `useProgramTimeline` — this file only draws them. The
 * layout is a two-part row: a rail naming the record and, under it, what each thing on its bar
 * MEANS, then the plotted track. Naming the elements per row is what lets the chart stay legible
 * once a wave carries a window, a freeze and two milestones at once; a shared legend at the top can
 * say what a gold snowflake is, but not that this particular row has one.
 *
 * `span` bounds what is drawn. Passing null fits the window to the data, which is the right default
 * but the wrong permanent behaviour: one cycle sitting a year out stretches every other bar into a
 * sliver. The Calendar dialog exists to override it. */
export function ProgramGantt({ programId, highlightSubprojectId, span, showWeekBands = false }: {
  programId?: string;
  highlightSubprojectId?: string;
  /** The window to draw. Null fits it to the data. */
  span?: Span | null;
  showWeekBands?: boolean;
}) {
  const { program, rows, autoSpan, isLoading } = useProgramTimeline(programId, highlightSubprojectId);
  const window = span ?? autoSpan;

  const total = window ? Math.max(1, daysBetween(window.from, window.to)) : 1;

  /** Position as a PERCENTAGE, not pixels. The track then fits whatever width it is given instead
   * of needing a horizontal scrollbar sized from a guessed pixels-per-day. */
  const pct = useMemo(() => (d: Date) => {
    if (!window) return 0;
    return Math.min(100, Math.max(0, (daysBetween(window.from, d) / total) * 100));
  }, [window, total]);

  const inWindow = (d: Date) => !!window && d >= window.from && d <= window.to;

  /** Month columns, and the year headings above them. A programme spanning a year boundary needs
   * the year said once over its months rather than repeated in every column label. */
  const { months, years } = useMemo(() => {
    if (!window) return { months: [], years: [] as { label: string; left: number; width: number }[] };
    const months: { key: string; label: string; left: number; width: number; year: number }[] = [];
    const cursor = new Date(window.from);
    while (cursor <= window.to) {
      const startOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const endOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const left = pct(startOfMonth);
      const right = pct(endOfMonth > window.to ? window.to : endOfMonth);
      months.push({
        key: `${startOfMonth.getFullYear()}-${startOfMonth.getMonth()}`,
        label: startOfMonth.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
        left, width: Math.max(0, right - left),
        year: startOfMonth.getFullYear(),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const years = [...new Set(months.map((m) => m.year))].map((y) => {
      const mine = months.filter((m) => m.year === y);
      const left = mine[0].left;
      const last = mine[mine.length - 1];
      return { label: String(y), left, width: last.left + last.width - left };
    });
    return { months, years };
  }, [window, pct]);

  /** Faint weekly stripes. Off by default: over three years they are 150-odd bands and become
   * texture rather than a scale. On a single quarter they are what lets you read a bar to the week. */
  const weeks = useMemo(() => {
    if (!window || !showWeekBands) return [];
    const out: { key: number; left: number; width: number }[] = [];
    const cursor = new Date(window.from);
    // Start from the Monday on or before the window, so bands line up with real weeks rather than
    // with whichever weekday the window happens to open on.
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    let i = 0;
    while (cursor <= window.to) {
      const end = new Date(cursor);
      end.setDate(end.getDate() + 7);
      const left = pct(cursor < window.from ? window.from : cursor);
      const right = pct(end > window.to ? window.to : end);
      if (i % 2 === 0 && right > left) out.push({ key: i, left, width: right - left });
      cursor.setDate(cursor.getDate() + 7);
      i += 1;
    }
    return out;
  }, [window, showWeekBands, pct]);

  if (!isLoading && rows.length === 0) {
    return (
      <EmptyState
        title="No program to chart yet"
        description="Create a program with projects and subprojects, and their dates will appear here."
      />
    );
  }
  if (!window) {
    return (
      <EmptyState
        title="No dates set yet"
        description="Give the projects and subprojects start and end dates, and the timeline draws itself from them."
      />
    );
  }

  const today = new Date();
  const todayPct = inWindow(today) ? pct(today) : null;

  const programStart = parseDate(program?.startDate);
  const programEnd = parseDate(program?.endDate);

  return (
    <div className="border border-line rounded-[var(--r)] bg-surface overflow-hidden">
      {/* What the chart is, and what its symbols mean — one strip, so neither is hunted for. */}
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-3.5 py-2.5 border-b border-line">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <span className="text-sm2 font-bold text-text truncate">{program?.name ?? 'Programme'}</span>
          <span className="text-2xs text-muted whitespace-nowrap">
            {programStart ? formatMonthYear(programStart) : formatMonthYear(window.from)}
            {' – '}
            {program?.endDate && !programEnd
              ? 'open-ended'
              : formatMonthYear(programEnd ?? window.to)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted">
          {(Object.keys(MARKER) as MarkerKind[]).map((k) => {
            const { Icon, className, legend } = MARKER[k];
            return (
              <span key={k} className="inline-flex items-center gap-1.5">
                <Icon size={11} className={className} /> {legend}
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 border-t-2 border-red inline-block" /> Today
          </span>
        </div>
      </div>

      {/* Month scale. The year sits above its own months rather than being repeated in each label. */}
      <div className="flex border-b border-line bg-surface-2">
        <div className="shrink-0 border-r border-line" style={{ width: RAIL }} />
        <div className="relative flex-1">
          <div className="relative h-4">
            {years.map((y) => (
              <span
                key={y.label}
                className="absolute inset-y-0 flex items-center justify-center text-2xs font-bold tracking-[.06em] text-muted"
                style={{ left: `${y.left}%`, width: `${y.width}%` }}
              >
                {y.label}
              </span>
            ))}
          </div>
          <div className="relative h-5">
            {months.map((m) => (
              <span
                key={m.key}
                className="absolute inset-y-0 flex items-center justify-center overflow-hidden text-2xs tracking-[.06em] text-muted border-l border-line"
                style={{ left: `${m.left}%`, width: `${m.width}%` }}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        {/* Grid and the today line are drawn ONCE behind every row, not per row — a gridline
            reassembled out of 30 row-height segments never quite lines up. */}
        <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ left: RAIL }}>
          {weeks.map((w) => (
            <div
              key={w.key}
              className="absolute inset-y-0 bg-surface-2/70"
              style={{ left: `${w.left}%`, width: `${w.width}%` }}
            />
          ))}
          {months.map((m) => (
            <div key={m.key} className="absolute inset-y-0 border-l border-line" style={{ left: `${m.left}%` }} />
          ))}
          {todayPct !== null && (
            <div
              className="absolute inset-y-0 border-l-2 border-red z-20"
              style={{ left: `${todayPct}%` }}
              title={`Today — ${today.toLocaleDateString()}`}
            />
          )}
        </div>

        {rows.map((r) => (
          r.type === 'group' ? (
            <div
              key={r.id}
              className="relative z-10 flex items-center h-7 px-3.5 bg-blue-pale border-y border-line text-2xs font-bold uppercase tracking-[.08em] text-blue-deep"
            >
              <span className="truncate" title={r.label}>{r.label}</span>
            </div>
          ) : (
            <GanttRow key={r.id} row={r} pct={pct} inWindow={inWindow} />
          )
        ))}
      </div>
    </div>
  );
}

/** One record: its name and per-element legend on the left, its bar and deadlines on the right. */
function GanttRow({ row, pct, inWindow }: {
  row: TaskRow;
  pct: (d: Date) => number;
  inWindow: (d: Date) => boolean;
}) {
  const hasBar = !!row.start;
  const left = row.start ? pct(row.start) : 0;
  const right = row.end ? pct(row.end) : left;

  /* The row's own legend: the bar, then each deadline on it, in the colour it is drawn in. Built
     from the row's markers rather than written out, so a row cannot claim a marker it does not
     have — or stay silent about one it does. */
  const legend = [
    ...(hasBar ? [{ label: row.barLabel, className: row.level === 'CYCL' ? 'bg-blue' : 'bg-blue-deep' }] : []),
    ...row.markers.map((m) => ({ label: m.label, className: MARKER[m.kind].dot })),
  ];

  return (
    <div className={clsx('relative flex border-b border-line-soft last:border-b-0', row.highlight && 'bg-blue-light/40')}>
      <div
        className="shrink-0 min-w-0 px-3.5 py-2 border-r border-line relative z-10"
        style={{ width: RAIL, paddingLeft: row.level === 'CYCL' ? 26 : 14 }}
      >
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span
            className={clsx('text-sm2 font-semibold truncate', row.highlight ? 'text-blue-deep' : 'text-text')}
            title={row.code ? `${row.code} · ${row.name}` : row.name}
          >
            {row.name}
          </span>
        </div>
        <div className="mt-1 flex flex-col gap-[3px]">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-2xs text-muted min-w-0">
              <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', l.className)} />
              <span className="truncate">{l.label}</span>
            </span>
          ))}
          {!hasBar && <span className="text-2xs text-muted italic">No dates set</span>}
        </div>
      </div>

      <div className="relative flex-1 py-2">
        {/* The bar sits low in the row so the markers above it have their own band and never
            overlap it — a deadline is a moment, and drawing it inside the duration it falls in
            would say the wrong thing. */}
        {hasBar && (
          <div
            className={clsx(
              'absolute bottom-2 h-2.5 rounded-[3px] z-10',
              row.level === 'CYCL' ? 'bg-blue' : 'bg-blue-deep',
            )}
            style={{ left: `${left}%`, width: `${Math.max(0.5, right - left)}%` }}
            title={`${row.name}${row.start ? ` · ${row.start.toLocaleDateString()}` : ''}${row.end ? ` → ${row.end.toLocaleDateString()}` : ' → open-ended'}`}
          />
        )}

        {row.markers.filter((m) => inWindow(m.at)).map((m, i) => {
          const { Icon, className } = MARKER[m.kind];
          return (
            <span
              key={`${m.label}-${i}`}
              className="absolute top-1.5 -translate-x-1/2 z-10"
              style={{ left: `${pct(m.at)}%` }}
              title={`${m.label} — ${m.at.toLocaleDateString()}`}
            >
              <Icon size={13} className={className} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

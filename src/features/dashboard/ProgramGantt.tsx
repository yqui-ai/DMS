import { useMemo } from 'react';
import { Snowflake, Star } from 'lucide-react';
import clsx from 'clsx';
import { EmptyState } from '../../components/EmptyState';
import { isOpenEnded } from '../../lib/hierarchyForm';
import { useHierarchy } from '../../lib/queries/hierarchy';
import { useTimelineCategories, useTimelineEntries } from '../../lib/queries/timelineAdmin';
import { LEVEL_ICON } from '../programme/hierarchyLevels';
import type { HierarchyLevel } from '../../types/entities';

const DAY = 86_400_000;
const parse = (iso?: string) => (iso && !isOpenEnded(iso) ? new Date(iso + 'T00:00:00') : null);
const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

/** One row of the chart: a record with a span, plus the moments that matter on it. */
interface Row {
  id: string;
  level: HierarchyLevel;
  /** 0 = program, 1 = project, 2 = subproject, 3 = cycle. Drives the indent, nothing else. */
  depth: number;
  code?: string;
  name: string;
  start: Date | null;
  end: Date | null;
  /** Named dates drawn ON the bar. A freeze is a deadline, not a duration — it is a point. */
  markers: { at: Date; label: string; kind: 'freeze' | 'milestone' }[];
  highlight?: boolean;
}

/** The programme structure as a Gantt: every level, its span, and the deadlines on it.
 *
 * Built from the hierarchy's own dates rather than from a separate timeline table. Programs,
 * projects, subprojects and cycles all already carry start and end dates, and subprojects and
 * cycles carry freeze dates on top — so the shape of the programme is data that exists, not
 * something anyone has to re-enter. A chart fed by a parallel table would drift from the hierarchy
 * the first time a date moved.
 *
 * Configured milestones (Program Admin → Timelines) are drawn ON TOP of that, matched to a row by
 * its label. They are for the things the hierarchy has no column for — a steering committee, a
 * go/no-go, a business blackout.
 *
 * `9999-12-31` means open-ended (see isOpenEnded) and is treated as no end date rather than as a
 * bar running to the year 9999, which is what made the old strip unreadable whenever one existed. */
export function ProgramGantt({ programId, highlightSubprojectId }: {
  programId?: string;
  highlightSubprojectId?: string;
}) {
  const { data: programs = [], isLoading } = useHierarchy();
  const { data: categories = [] } = useTimelineCategories(programId);
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  const { data: entries = [] } = useTimelineEntries(categoryIds);

  const rows = useMemo((): Row[] => {
    const program = programs.find((p) => p.id === programId) ?? programs[0];
    if (!program) return [];

    /* Configured milestones, keyed by the row label they name. `row_label` is free text typed in
       the admin screen, so it is matched case- and space-insensitively against a code or a name —
       an exact match would fail on "wave 1" vs "Wave 1" and give no clue why. */
    const key = (s: string) => s.trim().toLowerCase();
    const extra = new Map<string, { at: Date; label: string; kind: 'milestone' }[]>();
    for (const e of entries) {
      const at = parse(e.startDate);
      if (!at) continue;
      const k = key(e.rowLabel);
      extra.set(k, [...(extra.get(k) ?? []), { at, label: e.name, kind: 'milestone' }]);
    }
    const extrasFor = (...names: (string | undefined)[]) =>
      names.filter(Boolean).flatMap((n) => extra.get(key(n!)) ?? []);

    const out: Row[] = [{
      id: program.id, level: 'PRGM', depth: 0, code: program.code, name: program.name,
      start: parse(program.startDate), end: parse(program.endDate),
      markers: extrasFor(program.code, program.name),
    }];

    for (const pj of program.projects) {
      out.push({
        id: pj.id, level: 'PRJT', depth: 1, code: pj.code, name: pj.name,
        start: parse(pj.startDate), end: parse(pj.endDate),
        markers: extrasFor(pj.code, pj.name),
      });

      for (const sp of pj.subprojects) {
        const freeze = parse(sp.freezeDate);
        out.push({
          id: sp.id, level: 'SPRJ', depth: 2, code: sp.code, name: sp.name,
          // Preparation starts before the wave proper, so the bar spans whichever comes first —
          // a subproject whose prep began in January does not start in March.
          start: parse(sp.prepStartDate) ?? parse(sp.startDate),
          end: parse(sp.endDate) ?? parse(sp.prepEndDate),
          markers: [
            ...(freeze ? [{ at: freeze, label: 'Field Mapping freeze', kind: 'freeze' as const }] : []),
            ...extrasFor(sp.code, sp.name),
          ],
          highlight: sp.id === highlightSubprojectId,
        });

        for (const cy of sp.cycles) {
          const dataFreeze = parse(cy.dataFreeze);
          out.push({
            id: cy.id, level: 'CYCL', depth: 3, code: cy.code, name: cy.name,
            start: parse(cy.migStart) ?? parse(cy.startDate),
            end: parse(cy.migEnd) ?? parse(cy.endDate),
            markers: [
              ...(dataFreeze ? [{ at: dataFreeze, label: 'Source data freeze', kind: 'freeze' as const }] : []),
              ...extrasFor(cy.code, cy.name),
            ],
          });
        }
      }
    }
    return out;
  }, [programs, programId, entries, highlightSubprojectId]);

  /** The window every bar is positioned in. Derived from the dates present — a fixed window would
   * either clip a programme or leave most of the chart empty. */
  const window = useMemo(() => {
    const all = rows.flatMap((r) => [r.start, r.end, ...r.markers.map((m) => m.at)])
      .filter((d): d is Date => !!d);
    if (all.length === 0) return null;
    const min = new Date(Math.min(...all.map((d) => d.getTime())));
    const max = new Date(Math.max(...all.map((d) => d.getTime())));
    // Snapped to month boundaries so the header reads as months rather than as arbitrary offsets.
    const from = new Date(min.getFullYear(), min.getMonth(), 1);
    const to = new Date(max.getFullYear(), max.getMonth() + 1, 0);
    return { from, to, total: Math.max(1, days(from, to)) };
  }, [rows]);

  /** Position as a PERCENTAGE, not pixels. The chart then fits whatever width it is given instead
   * of needing a horizontal scrollbar sized from a guessed pixels-per-day. */
  const pct = (d: Date) => {
    if (!window) return 0;
    return Math.min(100, Math.max(0, (days(window.from, d) / window.total) * 100));
  };

  const months = useMemo(() => {
    if (!window) return [];
    const out: { label: string; left: number; width: number }[] = [];
    const cursor = new Date(window.from);
    while (cursor <= window.to) {
      const startOfMonth = new Date(cursor);
      const endOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const left = pct(startOfMonth);
      const right = pct(endOfMonth > window.to ? window.to : endOfMonth);
      out.push({
        label: startOfMonth.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        left, width: Math.max(0, right - left),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }, [window]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const todayPct = today >= window.from && today <= window.to ? pct(today) : null;

  return (
    <div className="flex flex-col">
      {/* Month scale. Sticky so it stays readable while a long programme scrolls. */}
      <div className="flex items-end gap-3 pb-1.5 border-b border-line">
        <div className="w-[240px] shrink-0" />
        <div className="relative flex-1 h-4">
          {months.map((m) => (
            <span
              key={m.label + m.left}
              className="absolute text-2xs text-muted border-l border-line pl-1 truncate"
              style={{ left: `${m.left}%`, width: `${m.width}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative flex flex-col">
        {/* One line for today, drawn once across every row rather than per row. */}
        {todayPct !== null && (
          <div
            className="absolute top-0 bottom-0 border-l border-dashed border-red/60 z-10 pointer-events-none"
            style={{ left: `calc(240px + 0.75rem + ${todayPct}% * (100% - 240px - 0.75rem) / 100%)` }}
            title={`Today — ${today.toLocaleDateString()}`}
          />
        )}

        {rows.map((r) => {
          const Icon = LEVEL_ICON[r.level];
          const hasBar = !!r.start;
          const left = r.start ? pct(r.start) : 0;
          const right = r.end ? pct(r.end) : left;
          return (
            <div
              key={r.id}
              className={clsx(
                'flex items-center gap-3 h-8 border-b border-line-soft last:border-b-0',
                r.highlight && 'bg-blue-pale',
              )}
            >
              <div
                className="w-[240px] shrink-0 flex items-center gap-1.5 min-w-0"
                style={{ paddingLeft: r.depth * 14 }}
              >
                <Icon size={12} className="shrink-0 text-muted" />
                {r.code && <span className="font-mono text-2xs text-muted shrink-0">{r.code}</span>}
                <span className={clsx('text-sm2 truncate min-w-0', r.highlight ? 'text-blue-deep' : 'text-text')} title={r.name}>
                  {r.name}
                </span>
              </div>

              <div className="relative flex-1 h-5">
                {hasBar ? (
                  <div
                    className={clsx(
                      'absolute top-1 h-3 rounded-xs',
                      // Depth reads as weight rather than as hue: the programme bar is the ground,
                      // its waves sit on top. Colour here would compete with the freeze markers,
                      // which are the only thing on this chart that needs attention.
                      r.depth === 0 ? 'bg-blue-deep'
                        : r.depth === 1 ? 'bg-blue'
                          : r.depth === 2 ? 'bg-blue-mid' : 'bg-blue-mid/60',
                    )}
                    style={{ left: `${left}%`, width: `${Math.max(0.6, right - left)}%` }}
                    title={`${r.name}${r.start ? ` · ${r.start.toLocaleDateString()}` : ''}${r.end ? ` → ${r.end.toLocaleDateString()}` : ' → open-ended'}`}
                  />
                ) : (
                  <span className="absolute top-0.5 left-0 text-2xs text-muted italic">No dates set</span>
                )}

                {/* Markers sit above the bar, never inside it — a deadline is a moment, and drawing
                    it as a segment of the duration it falls in would say the wrong thing. */}
                {r.markers.map((m, i) => (
                  <span
                    key={`${m.label}-${i}`}
                    className="absolute top-0 -translate-x-1/2 z-[5]"
                    style={{ left: `${pct(m.at)}%` }}
                    title={`${m.label} — ${m.at.toLocaleDateString()}`}
                  >
                    {m.kind === 'freeze'
                      ? <Snowflake size={12} className="text-blue-deep" />
                      : <Star size={12} className="text-amber-ink" />}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 pt-2.5 text-2xs text-muted">
        <span className="inline-flex items-center gap-1.5"><Snowflake size={11} className="text-blue-deep" /> Freeze date</span>
        <span className="inline-flex items-center gap-1.5"><Star size={11} className="text-amber-ink" /> Milestone</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 border-t border-dashed border-red/60 inline-block" /> Today
        </span>
      </div>
    </div>
  );
}

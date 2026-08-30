import { useMemo } from 'react';
import { isOpenEnded } from '../../lib/hierarchyForm';
import { useHierarchy } from '../../lib/queries/hierarchy';
import { useTimelineCategories, useTimelineEntries } from '../../lib/queries/timelineAdmin';

/* The programme timeline as data, with no chart in it.
 *
 * ProgramGantt draws it and the Calendar dialog bounds it, and both need the same two answers:
 * what the rows are, and what date span the programme actually occupies. Deriving that twice —
 * once to draw and once to seed the date pickers — is how the picker ends up offering a range the
 * chart never had. It lives here so there is one derivation and both read it. */

const DAY = 86_400_000;

/** `9999-12-31` is the open-ended sentinel (see isOpenEnded); it is not a date to plot. Reading it
 * literally is what once drew a bar running to the year 9999 and flattened every real bar into a
 * hairline. */
export const parseDate = (iso?: string) => (iso && !isOpenEnded(iso) ? new Date(iso + 'T00:00:00') : null);
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

/** What a moment on the chart means. The kind picks the glyph AND its colour, and the legend is
 * generated from the same three values — so a marker cannot appear on the chart in a colour the
 * legend does not explain. */
export type MarkerKind = 'fmd-freeze' | 'data-freeze' | 'milestone';

export interface Marker { at: Date; label: string; kind: MarkerKind }

/** A record with a span: one bar, its deadlines, and the words for both. */
export interface TaskRow {
  type: 'task';
  id: string;
  level: 'SPRJ' | 'CYCL';
  code?: string;
  name: string;
  start: Date | null;
  end: Date | null;
  /** What the bar itself is — a wave's working window, a cycle's load window. Named in the row's
   * own legend, because a bar with no label only says "something happens here". */
  barLabel: string;
  markers: Marker[];
  highlight?: boolean;
}

/** A band that separates the rows below it. Structure, not a record with dates of its own. */
export interface GroupRow { type: 'group'; id: string; label: string }

export type TimelineRow = GroupRow | TaskRow;

/** The date window the chart is drawn in, always whole months. */
export interface Span { from: Date; to: Date }

/** Three years. Past that the month columns are a few pixels wide and the chart stops being
 * readable at all, so the Calendar dialog refuses rather than rendering something useless. */
export const MAX_SPAN_MONTHS = 36;

/** Whole months from `from` to `to` inclusive — 'Jan 2026 → Dec 2026' is 12, not 11. */
export const spanMonths = (s: Span) =>
  (s.to.getFullYear() - s.from.getFullYear()) * 12 + (s.to.getMonth() - s.from.getMonth()) + 1;

/** A span from month/year pickers. `to` is the LAST day of its month (day 0 of the next), so a
 * range ending in December covers December rather than stopping at midnight on the 1st. */
export const spanFromMonths = (fromYear: number, fromMonth: number, toYear: number, toMonth: number): Span => ({
  from: new Date(fromYear, fromMonth, 1),
  to: new Date(toYear, toMonth + 1, 0),
});

/** Snaps any two dates out to the month boundaries around them. */
export const snapToMonths = (min: Date, max: Date): Span =>
  spanFromMonths(min.getFullYear(), min.getMonth(), max.getFullYear(), max.getMonth());

export const formatMonthYear = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

/** The programme's rows and the span they occupy.
 *
 * Rows come from the hierarchy's own date columns rather than from a parallel timeline table:
 * programs, projects, subprojects and cycles already carry start and end dates, and subprojects and
 * cycles carry freeze dates on top. A chart fed by its own copy of those dates would disagree with
 * the hierarchy the first time one moved.
 *
 * Configured milestones (Program Admin → Timelines) are drawn on top of that, for the moments the
 * hierarchy has no column for — a steering committee, a go/no-go, a business blackout. */
export function useProgramTimeline(programId?: string, highlightSubprojectId?: string) {
  const { data: programs = [], isLoading } = useHierarchy();
  const { data: categories = [] } = useTimelineCategories(programId);
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  const { data: entries = [] } = useTimelineEntries(categoryIds);

  const program = useMemo(
    () => programs.find((p) => p.id === programId) ?? programs[0],
    [programs, programId],
  );

  const rows = useMemo((): TimelineRow[] => {
    if (!program) return [];

    /* Configured milestones, keyed by the row label they name. `row_label` is free text typed in
       the admin screen, so it is matched case- and space-insensitively against a code or a name —
       an exact match would fail on "wave 1" vs "Wave 1" and give no clue why. */
    const key = (s: string) => s.trim().toLowerCase();
    const extra = new Map<string, Marker[]>();
    for (const e of entries) {
      const at = parseDate(e.startDate);
      if (!at) continue;
      const k = key(e.rowLabel);
      extra.set(k, [...(extra.get(k) ?? []), { at, label: e.name, kind: 'milestone' }]);
    }
    const extrasFor = (...names: (string | undefined)[]) =>
      names.filter(Boolean).flatMap((n) => extra.get(key(n!)) ?? []);

    const out: TimelineRow[] = [];

    /* The program itself gets no row. Its span is the chart's own heading, and a full-width bar
       underneath repeating it was the one bar on the chart that told you nothing you could act on.
       Projects become the bands that separate the work; the work is subprojects and cycles. */
    for (const pj of program.projects) {
      out.push({ type: 'group', id: pj.id, label: pj.code ? `${pj.code} · ${pj.name}` : pj.name });

      for (const sp of pj.subprojects) {
        const freeze = parseDate(sp.freezeDate);
        out.push({
          type: 'task', id: sp.id, level: 'SPRJ', code: sp.code, name: sp.name,
          // Preparation starts before the wave proper, so the bar spans whichever comes first —
          // a subproject whose prep began in January does not start in March.
          start: parseDate(sp.prepStartDate) ?? parseDate(sp.startDate),
          end: parseDate(sp.endDate) ?? parseDate(sp.prepEndDate),
          barLabel: 'Design & build window',
          markers: [
            ...(freeze ? [{ at: freeze, label: 'FMD freeze', kind: 'fmd-freeze' as const }] : []),
            ...extrasFor(sp.code, sp.name),
          ],
          highlight: sp.id === highlightSubprojectId,
        });

        for (const cy of sp.cycles) {
          const dataFreeze = parseDate(cy.dataFreeze);
          out.push({
            type: 'task', id: cy.id, level: 'CYCL', code: cy.code, name: cy.name,
            start: parseDate(cy.migStart) ?? parseDate(cy.startDate),
            end: parseDate(cy.migEnd) ?? parseDate(cy.endDate),
            barLabel: 'Load window',
            markers: [
              ...(dataFreeze ? [{ at: dataFreeze, label: 'Source data freeze', kind: 'data-freeze' as const }] : []),
              ...extrasFor(cy.code, cy.name),
            ],
          });
        }
      }
    }
    return out;
  }, [program, entries, highlightSubprojectId]);

  /** The span the data occupies, snapped to whole months. Null when nothing carries a date — which
   * is a different thing from an empty programme, and the chart says so differently. */
  const autoSpan = useMemo((): Span | null => {
    const all = rows.flatMap((r) => (r.type === 'task' ? [r.start, r.end, ...r.markers.map((m) => m.at)] : []))
      .filter((d): d is Date => !!d);
    // The program's own dates count even when no row carries one, so a programme whose waves are
    // undated still opens on its own year rather than on nothing.
    const programStart = parseDate(program?.startDate);
    const programEnd = parseDate(program?.endDate);
    if (programStart) all.push(programStart);
    if (programEnd) all.push(programEnd);
    if (all.length === 0) return null;
    const min = new Date(Math.min(...all.map((d) => d.getTime())));
    const max = new Date(Math.max(...all.map((d) => d.getTime())));
    const span = snapToMonths(min, max);
    // A programme running longer than the cap opens on its first three years rather than being
    // squeezed into an unreadable chart; the Calendar dialog is how you reach the rest.
    if (spanMonths(span) <= MAX_SPAN_MONTHS) return span;
    return spanFromMonths(
      span.from.getFullYear(), span.from.getMonth(),
      span.from.getFullYear(), span.from.getMonth() + MAX_SPAN_MONTHS - 1,
    );
  }, [rows, program]);

  return { program, rows, autoSpan, isLoading };
}

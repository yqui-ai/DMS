import { useMemo } from 'react';
import { Snowflake, Star } from 'lucide-react';
import clsx from 'clsx';
import { useDefaultProgram } from '../../lib/queries/programme';
import { useTimelineCategories, useTimelineEntries } from '../../lib/queries/timelineAdmin';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';

const DAY_MS = 86_400_000;
const PX_PER_DAY = 3;
const parseD = (iso?: string) => (iso ? new Date(iso + 'T00:00:00') : null);
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);
const ICON = { star: Star, snowflake: Snowflake } as const;
const ICON_COLOR: Record<string, string> = { 'freeze-yellow': 'var(--amber)', 'freeze-blue': 'var(--blue-mid)', 'freeze-red': 'var(--red)', 'star-yellow': 'var(--amber)' };

/** Read-only programme milestone gantt, admin-edited from Program Settings → Timelines. */
export function TimelineGantt() {
  const { data: program } = useDefaultProgram();
  const { data: categories = [] } = useTimelineCategories(program?.id);
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  const { data: entries = [] } = useTimelineEntries(categoryIds);

  const { windowStart, totalDays } = useMemo(() => {
    const dates = entries.flatMap((e) => [parseD(e.startDate), parseD(e.endDate)]).filter((d): d is Date => !!d);
    const now = new Date();
    if (dates.length === 0) return { windowStart: now, totalDays: 1 };
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    const s = new Date(min.getFullYear(), min.getMonth(), 1);
    return { windowStart: s, totalDays: Math.max(30, daysBetween(s, max) + 20) };
  }, [entries]);

  const xOf = (d: Date) => Math.max(0, daysBetween(windowStart, d)) * PX_PER_DAY;

  if (categories.length === 0) {
    return <EmptyState title="No program milestones yet" description="Configure them in Program Settings → Timelines." />;
  }

  return (
    <Card>
      <div className="text-sm2 font-bold uppercase tracking-[.05em] text-muted mb-3">Program Timeline</div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: totalDays * PX_PER_DAY + 160 }}>
          {categories.map((cat) => {
            const catEntries = entries.filter((e) => e.categoryId === cat.id);
            const rows = Array.from(new Set(catEntries.map((e) => e.rowLabel)));
            return (
              <div key={cat.id} className="mb-3">
                <div className="text-2xs font-bold text-muted mb-1">{cat.name}</div>
                {rows.map((row) => (
                  <div key={row} className="flex items-center h-7 relative">
                    <span className="w-40 shrink-0 text-sm2 truncate pr-2">{row}</span>
                    <div className="flex-1 relative h-5">
                      {catEntries.filter((e) => e.rowLabel === row).map((e) => {
                        const start = parseD(e.startDate);
                        if (!start) return null;
                        const end = parseD(e.endDate) ?? start;
                        const Icon = e.icon ? ICON[e.icon.split('-')[0] as keyof typeof ICON] : null;
                        if (e.kind === 'range') {
                          return (
                            <div
                              key={e.id} title={e.name}
                              className="absolute h-4 top-0.5 rounded-xs bg-blue text-white text-2xs px-1.5 flex items-center truncate"
                              style={{ left: xOf(start), width: Math.max(6, xOf(end) - xOf(start)) }}
                            >
                              {e.name}
                            </div>
                          );
                        }
                        return (
                          <div key={e.id} title={e.name} className="absolute top-0" style={{ left: xOf(start) }}>
                            {Icon ? <Icon size={13} color={ICON_COLOR[e.icon!] ?? 'var(--amber)'} /> : <span className={clsx('w-2 h-2 rounded-full bg-amber-ink block')} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Plus, Snowflake, Star, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Input } from '../../components/Field';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { fmtDate } from '../../lib/format';
import { dateForInput, useHierarchy, useHierarchyMutations } from '../../lib/queries/hierarchy';
import {
  useTimelineAdminMutations, useTimelineCategories, useTimelineEntries,
} from '../../lib/queries/timelineAdmin';
import { LEVEL_ICON } from '../programme/hierarchyLevels';
import type { HierarchyLevel } from '../../types/entities';

/** Which dated columns each level actually has.
 *
 * Freeze dates are the reason this dialog exists and they are NOT one thing: the Field Mapping
 * freeze is a subproject column, the source data freeze is a cycle column, and a code freeze has
 * no column at all. The first two are edited here as structure; the third is a milestone, which is
 * what the second tab is for. */
const DATE_FIELDS: Record<Exclude<HierarchyLevel, 'PRGM'>, { key: string; label: string; freeze?: boolean }[]> = {
  PRJT: [
    { key: 'start_date', label: 'Start' },
    { key: 'end_date', label: 'End' },
  ],
  SPRJ: [
    { key: 'prep_start_date', label: 'Prep start' },
    { key: 'prep_end_date', label: 'Prep end' },
    { key: 'start_date', label: 'Start' },
    { key: 'end_date', label: 'End' },
    { key: 'freeze_date', label: 'FMD freeze', freeze: true },
  ],
  CYCL: [
    { key: 'start_date', label: 'Start' },
    { key: 'end_date', label: 'End' },
    { key: 'mig_start', label: 'Migration start' },
    { key: 'mig_end', label: 'Migration end' },
    { key: 'data_freeze', label: 'Data freeze', freeze: true },
  ],
};

const camel = (snake: string) => snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

type Tab = 'structure' | 'milestones';

/** Everything that shapes the programme timeline, in one place.
 *
 * Two tabs because the timeline is built from two genuinely different things, and pretending
 * otherwise would mean either editing a subproject's freeze date in a free-text milestone list or
 * inventing hierarchy columns for a steering committee:
 *
 *   Structure   phases and cycles as they really are — the start, end, preparation, migration and
 *               freeze dates that live ON the program, project, subproject and cycle records. The
 *               Gantt is drawn from these, so editing them here moves the bars.
 *   Milestones  everything the hierarchy has no column for — a code freeze, a go/no-go, a business
 *               blackout. Free-form, attached to a row by its label.
 *
 * Saved per field on blur rather than behind one Save button: this is a grid of forty dates across
 * a dozen records, and a single Save would either write every record on every change or need
 * change-tracking nobody asked for. */
export function ConfigureTimelineDialog({ open, programId, onClose }: {
  open: boolean;
  programId?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('structure');
  const { data: programs = [] } = useHierarchy();
  const { setDates } = useHierarchyMutations();
  const program = programs.find((p) => p.id === programId) ?? programs[0];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Configure timeline"
      subtitle={program ? `${program.code} · ${program.name}` : undefined}
      size="win"
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-1 border-b border-line mb-4 shrink-0">
          {([
            { key: 'structure', label: 'Phases & cycles' },
            { key: 'milestones', label: 'Milestones & freezes' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'px-3.5 py-2 text-sm2 font-semibold border-b-2 -mb-px',
                tab === t.key ? 'border-blue text-blue' : 'border-transparent text-muted hover:text-text',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {!program ? (
            <EmptyState title="No program" description="Create a program first — the timeline is drawn from what is under it." />
          ) : tab === 'structure' ? (
            <StructureDates
              program={program}
              onSave={async (level, id, dates) => {
                try {
                  await setDates.mutateAsync({ level, id, dates });
                } catch (err: any) {
                  toast.error(err?.message ?? 'Could not save that date.');
                }
              }}
            />
          ) : (
            <Milestones programId={program.id} />
          )}
        </div>
      </div>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────── phases, cycles and their real dates */

function StructureDates({ program, onSave }: {
  program: ReturnType<typeof useHierarchy>['data'] extends (infer T)[] | undefined ? T : never;
  onSave: (level: HierarchyLevel, id: string, dates: Record<string, string | null>) => Promise<void>;
}) {
  const rows = useMemo(() => {
    const out: { level: Exclude<HierarchyLevel, 'PRGM'>; id: string; depth: number; code?: string; name: string; rec: any }[] = [];
    for (const pj of program.projects) {
      out.push({ level: 'PRJT', id: pj.id, depth: 0, code: pj.code, name: pj.name, rec: pj });
      for (const sp of pj.subprojects) {
        out.push({ level: 'SPRJ', id: sp.id, depth: 1, code: sp.code, name: sp.name, rec: sp });
        for (const cy of sp.cycles) {
          out.push({ level: 'CYCL', id: cy.id, depth: 2, code: cy.code, name: cy.name, rec: cy });
        }
      }
    }
    return out;
  }, [program]);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing to schedule yet"
        description="Add projects and subprojects from Migration Project, then their dates are edited here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-2xs text-muted">
        These are the records&apos; own dates — the Gantt is drawn from them, so a change here moves
        the bars. Each field saves when you leave it.
      </p>
      {rows.map((r) => {
        const Icon = LEVEL_ICON[r.level];
        return (
          <div key={r.id} className="flex flex-col gap-1.5" style={{ paddingLeft: r.depth * 20 }}>
            <div className="flex items-center gap-1.5">
              <Icon size={12} className="text-muted shrink-0" />
              {r.code && <span className="font-mono text-2xs text-muted">{r.code}</span>}
              <span className="text-sm2 text-text">{r.name}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {DATE_FIELDS[r.level].map((f) => (
                <DateCell
                  key={f.key}
                  label={f.label}
                  freeze={f.freeze}
                  value={dateForInput(r.rec[camel(f.key)] as string | undefined) ?? ''}
                  onCommit={(v) => onSave(r.level, r.id, { [f.key]: v || null })}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One date, saved on blur — and only when it actually changed. */
function DateCell({ label, value, freeze, onCommit }: {
  label: string; value: string; freeze?: boolean; onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  // Re-seeded when the record reloads, so a save elsewhere is reflected rather than overwritten by
  // whatever this input was holding.
  useEffect(() => { setLocal(value); }, [value]);

  return (
    <label className="flex flex-col gap-0.5">
      <span className={clsx('text-2xs flex items-center gap-1', freeze ? 'text-blue-deep' : 'text-muted')}>
        {freeze && <Snowflake size={10} />}
        {label}
      </span>
      <Input
        type="date"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        // Only writes when the value moved. Without this, tabbing across a dozen dates would issue
        // a dozen identical updates and a dozen change-log entries saying nothing happened.
        onBlur={() => { if (local !== value) onCommit(local); }}
        className={clsx('w-[150px]', freeze && 'border-blue-mid')}
      />
    </label>
  );
}

/* ──────────────────────────────────────────────── milestones the hierarchy has no column for */

/** A group on the left, its milestones on the right.
 *
 * The first version stacked two unrelated forms at the top — one to add a milestone, one to add a
 * group — with the group control wedged between the add form and the list it fed. Three things
 * competing to be the first thing you did, and the list pushed below all of them.
 *
 * Groups are navigation, so they sit in a rail. Adding a milestone happens INSIDE the group it
 * belongs to, which removes the Group dropdown entirely: the group you are looking at is the
 * answer. Empty groups no longer spend a full row saying they are empty — the rail carries a count. */
function Milestones({ programId }: { programId: string }) {
  const toast = useToast();
  const { data: categories = [] } = useTimelineCategories(programId);
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  const { data: entries = [] } = useTimelineEntries(categoryIds);
  const mutations = useTimelineAdminMutations(programId);

  const [activeId, setActiveId] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [adding, setAdding] = useState({ rowLabel: '', name: '', startDate: '', endDate: '' });

  // Falls back to the first group rather than showing an empty right pane before you click.
  const active = categories.find((c) => c.id === activeId) ?? categories[0];
  const mine = entries.filter((e) => e.categoryId === active?.id);
  const countOf = (id: string) => entries.filter((e) => e.categoryId === id).length;

  const addGroup = async () => {
    if (!newGroup.trim()) return;
    try {
      await mutations.addCategory(newGroup.trim(), categories.length + 1);
      setNewGroup('');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not add that group.');
    }
  };

  const add = async () => {
    if (!active || !adding.name.trim() || !adding.startDate) return;
    try {
      await mutations.addEntry(active.id, {
        // Blank means "the programme itself" — the Gantt matches on this, and defaulting it to the
        // milestone's own name would silently attach it to a row that does not exist.
        rowLabel: adding.rowLabel.trim(),
        name: adding.name.trim(),
        // A milestone is a moment; give it an end date and it becomes a phase. Same record, and the
        // Gantt draws the two differently — a star, or a bar.
        kind: adding.endDate ? 'range' : 'point',
        startDate: adding.startDate,
        endDate: adding.endDate || undefined,
      });
      setAdding({ rowLabel: '', name: '', startDate: '', endDate: '' });
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not add that milestone.');
    }
  };

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-5 items-start">
      <div className="flex flex-col gap-1.5">
        <span className="text-2xs font-semibold uppercase tracking-[.06em] text-muted px-1">Groups</span>
        <div className="flex flex-col gap-0.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={clsx(
                'flex items-baseline gap-2 text-left rounded px-2.5 py-1.5 transition-colors',
                c.id === active?.id ? 'bg-blue-light text-blue-deep' : 'hover:bg-surface-2 text-text',
              )}
            >
              <span className="text-sm2 truncate min-w-0 flex-1">{c.name}</span>
              <span className="text-2xs text-muted tabular-nums shrink-0">{countOf(c.id)}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 pt-1.5 mt-1 border-t border-line">
          <Input
            value={newGroup}
            placeholder="New group"
            onChange={(e) => setNewGroup(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addGroup(); }}
            className="flex-1 min-w-0"
          />
          <button
            type="button"
            onClick={addGroup}
            disabled={!newGroup.trim()}
            title="Add group"
            aria-label="Add group"
            className="w-8 h-8 grid place-items-center rounded shrink-0 text-blue hover:bg-blue-light disabled:opacity-40 disabled:pointer-events-none"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {!active ? (
        <EmptyState
          title="No groups yet"
          description="Name a group on the left — Cutover, Cycles, Design &amp; build — and its milestones go inside it."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm2 font-semibold text-text">{active.name}</span>
            <span className="text-2xs text-muted">
              {mine.length} milestone{mine.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={async () => {
                try { await mutations.removeCategory(active.id); setActiveId(''); }
                catch (err: any) { toast.error(err?.message ?? 'Could not remove that group.'); }
              }}
              className="ml-auto text-2xs text-red hover:underline"
            >
              Remove group
            </button>
          </div>

          <div className="rounded-lg border border-line overflow-hidden">
            {mine.length === 0 ? (
              <p className="px-3.5 py-4 text-sm2 text-muted">Nothing here yet — add the first one below.</p>
            ) : mine.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-3.5 py-2 border-b border-line-soft last:border-b-0">
                {/* A bar for a span, a star for a moment — the same two shapes the Gantt uses, so
                    the list and the chart never say different things about one entry. */}
                {e.kind === 'range'
                  ? <span className="w-4 h-2 rounded-xs bg-blue shrink-0" title="Phase" />
                  : <Star size={13} className="text-amber-ink shrink-0" />}
                <span className="text-sm2 min-w-0 flex-1 truncate">{e.name}</span>
                <span
                  className="font-mono text-2xs text-muted shrink-0 w-[100px] truncate text-right"
                  title={e.rowLabel || 'Programme'}
                >
                  {e.rowLabel || 'Programme'}
                </span>
                <span className="text-2xs text-muted tabular-nums shrink-0 w-[180px] text-right">
                  {fmtDate(e.startDate)}{e.endDate ? ` → ${fmtDate(e.endDate)}` : ''}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    try { await mutations.removeEntry(e.id); }
                    catch (err: any) { toast.error(err?.message ?? 'Could not remove that milestone.'); }
                  }}
                  title={`Remove ${e.name}`}
                  aria-label={`Remove ${e.name}`}
                  className="w-7 h-7 grid place-items-center rounded text-muted hover:text-red hover:bg-red-light shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Inside the group, at the foot of its list — so what is being added, and where, is
              positional rather than something a dropdown has to state. */}
          <div className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 border border-line p-2.5">
            <Field label="Name">
              <Input
                value={adding.name} placeholder="Code freeze"
                onChange={(e) => setAdding((f) => ({ ...f, name: e.target.value }))}
                className="w-[200px]"
              />
            </Field>
            <Field label="Applies to">
              <Input
                value={adding.rowLabel} placeholder="W1A — or blank"
                onChange={(e) => setAdding((f) => ({ ...f, rowLabel: e.target.value }))}
                className="w-[130px]"
              />
            </Field>
            <Field label="Date">
              <Input
                type="date" value={adding.startDate}
                onChange={(e) => setAdding((f) => ({ ...f, startDate: e.target.value }))}
                className="w-[150px]"
              />
            </Field>
            <Field label="Until — makes it a phase">
              <Input
                type="date" value={adding.endDate}
                onChange={(e) => setAdding((f) => ({ ...f, endDate: e.target.value }))}
                className="w-[150px]"
              />
            </Field>
            <Button variant="primary" onClick={add} disabled={!adding.name.trim() || !adding.startDate}>
              <Plus size={14} /> Add
            </Button>
          </div>

          <p className="text-2xs text-muted">
            <strong className="text-text">Applies to</strong> puts the milestone on a Gantt row,
            matched by that row&apos;s code or name. Leave it blank and it sits on the programme.
          </p>
        </div>
      )}
    </div>
  );
}

/** A label above a control. Local because these are inline grid cells rather than form rows — the
 * shared `Field` adds its own block spacing and would break the wrap. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-2xs text-muted">{label}</span>
      {children}
    </label>
  );
}

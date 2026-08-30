import { useEffect, useMemo, useState } from 'react';
import { Plus, Snowflake, Star, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { Input } from '../../components/Field';
import { Select } from '../../components/Select';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
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

function Milestones({ programId }: { programId: string }) {
  const toast = useToast();
  const { data: categories = [] } = useTimelineCategories(programId);
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  const { data: entries = [] } = useTimelineEntries(categoryIds);
  const mutations = useTimelineAdminMutations(programId);

  const [group, setGroup] = useState('');
  const [form, setForm] = useState({ categoryId: '', rowLabel: '', name: '', startDate: '', endDate: '' });

  const addGroup = async () => {
    if (!group.trim()) return;
    try {
      await mutations.addCategory(group.trim(), categories.length + 1);
      setGroup('');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not add that group.');
    }
  };

  const add = async () => {
    if (!form.categoryId || !form.name.trim() || !form.startDate) return;
    try {
      await mutations.addEntry(form.categoryId, {
        rowLabel: form.rowLabel.trim() || form.name.trim(),
        name: form.name.trim(),
        // A milestone is a moment; give it an end date and it becomes a phase. Same record, and the
        // Gantt draws the two differently — a star, or a bar.
        kind: form.endDate ? 'range' : 'point',
        startDate: form.startDate,
        endDate: form.endDate || undefined,
      });
      setForm({ categoryId: form.categoryId, rowLabel: '', name: '', startDate: '', endDate: '' });
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not add that milestone.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-2xs text-muted">
        For the dates the structure has no column for — a code freeze, a go/no-go, a business
        blackout. <strong className="text-text">Applies to</strong> matches a milestone to a row on
        the Gantt by its code or name; leave it blank to attach it to the programme.
      </p>

      <div className="rounded-lg border border-line p-3 flex flex-wrap items-end gap-2">
        <Field label="Group">
          <Select
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            className="w-[170px]"
          >
            <option value="">Choose…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Applies to">
          <Input
            value={form.rowLabel} placeholder="W1A, or blank"
            onChange={(e) => setForm((f) => ({ ...f, rowLabel: e.target.value }))}
            className="w-[130px]"
          />
        </Field>
        <Field label="Name">
          <Input
            value={form.name} placeholder="Code freeze"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-[190px]"
          />
        </Field>
        <Field label="Date">
          <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="w-[150px]" />
        </Field>
        <Field label="Until (optional)">
          <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="w-[150px]" />
        </Field>
        <Button
          variant="primary"
          onClick={add}
          disabled={!form.categoryId || !form.name.trim() || !form.startDate}
        >
          <Plus size={14} /> Add
        </Button>
      </div>

      {categories.length === 0 ? (
        <div className="flex items-end gap-2">
          <Field label="First, name a group">
            <Input
              value={group} placeholder="Programme milestones"
              onChange={(e) => setGroup(e.target.value)}
              className="w-[240px]"
            />
          </Field>
          <Button variant="secondary" onClick={addGroup} disabled={!group.trim()}>
            <Plus size={14} /> Add group
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <Field label="Add another group">
            <Input value={group} onChange={(e) => setGroup(e.target.value)} className="w-[240px]" />
          </Field>
          <Button variant="secondary" onClick={addGroup} disabled={!group.trim()}>
            <Plus size={14} /> Add group
          </Button>
        </div>
      )}

      {categories.map((c) => {
        const mine = entries.filter((e) => e.categoryId === c.id);
        return (
          <div key={c.id} className="rounded-lg border border-line overflow-hidden">
            <div className="px-3.5 py-2 bg-surface-3 text-2xs font-semibold uppercase tracking-[.06em] text-muted">
              {c.name}
            </div>
            {mine.length === 0 ? (
              <p className="px-3.5 py-3 text-sm2 text-muted">Nothing in this group yet.</p>
            ) : mine.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-3.5 py-2 border-t border-line-soft">
                {e.kind === 'range'
                  ? <span className="w-4 h-2 rounded-xs bg-blue shrink-0" />
                  : <Star size={13} className="text-amber-ink shrink-0" />}
                <span className="text-sm2 min-w-0 flex-1 truncate">{e.name}</span>
                <span className="font-mono text-2xs text-muted shrink-0">{e.rowLabel}</span>
                <span className="text-2xs text-muted tabular-nums shrink-0">
                  {e.startDate}{e.endDate ? ` → ${e.endDate}` : ''}
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
        );
      })}
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

import type { HierarchyLevel, RefStatus } from '../types/entities';

/* The hierarchy's pure form and date rules, with no database client near them.

   Split out of queries/hierarchy.ts for the same reason as changeLogText: that module imports the
   Supabase client, which reads import.meta.env and cannot load outside Vite, so logic that is pure
   arithmetic over a form was untestable purely by association.

   Both rules here have already been the cause of a real bug — the 9999 sentinel leaking into a
   date input, and  being rewritten to 1 on every save. Tests are in hierarchyForm.test.ts.

   queries/hierarchy.ts re-exports these, so no caller needs to know about the split. */
/** `end_date` defaults to `9999-12-31` (migration 0001) and means OPEN-ENDED, not a date.
 *
 * It has to be stripped everywhere it surfaces: printed in a list it reads as a data error
 * ("Jan 05, 2026 – Dec 31, 9999"), and loaded into a date input it turns an unset end date into
 * one the user then has to clear by hand — or worse, saves back unnoticed. */
export const isOpenEnded = (iso?: string) => !iso || iso.startsWith('9999');

/** An open-ended date as an empty form value, so a date input shows blank rather than 9999. */
export const dateForInput = (iso?: string) => (isOpenEnded(iso) ? '' : iso);

export const statusName = (statuses: RefStatus[], type: HierarchyLevel, code?: string): string =>
  statuses.find((s) => s.type === type && s.code === code)?.name ?? code ?? '—';

export const isClosedStatus = (statuses: RefStatus[], type: HierarchyLevel, code?: string): boolean =>
  !!statuses.find((s) => s.type === type && s.code === code)?.isClosed;

export interface HierarchyForm {
  code: string; name: string; description?: string; status?: string;
  startDate?: string; endDate?: string;
  owner?: string; coLead?: string;
  prepStartDate?: string; prepEndDate?: string; freezeDate?: string;
  migStart?: string; migEnd?: string; dataFreeze?: string;
  seq?: number;
}

/** Empty string → null. A date input clears to '', and '' is not a date; Postgres rejects it
 * rather than treating it as absent, which surfaces as an opaque 22007 on save. */
export const d = (v?: string) => (v && v.trim() ? v : null);

export const payloadFor = (level: HierarchyLevel, form: HierarchyForm): Record<string, unknown> => {
  const base: Record<string, unknown> = {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description?.trim() || null,
    status: form.status || null,
    start_date: d(form.startDate),
    end_date: d(form.endDate),
  };
  /* `seq` is deliberately absent.
   *
   * It used to be sent as `form.seq ?? 1`, and nothing ever set `form.seq` — so every project,
   * subproject and cycle was written with seq = 1, and every EDIT rewrote it to 1 again. Since the
   * lists order by seq, that meant the hierarchy had no stable order at all: equal keys leave
   * Postgres free to return rows however it likes, and the answer could differ between two
   * refetches of the same data.
   *
   * The column is `not null default 1`, so inserts are covered without sending it, and leaving it
   * out of updates means a value that does become meaningful can never be clobbered by someone
   * editing a name. Ordering is `seq, code` at every call site — stable, and readable when seq is
   * uniform. */
  if (level === 'PRGM') return { ...base, owner: form.owner?.trim() || null, co_lead: form.coLead?.trim() || null };
  if (level === 'PRJT') return base;
  if (level === 'SPRJ') {
    return {
      ...base,
      prep_start_date: d(form.prepStartDate), prep_end_date: d(form.prepEndDate),
      freeze_date: d(form.freezeDate),
    };
  }
  return {
    ...base,
    mig_start: d(form.migStart), mig_end: d(form.migEnd), data_freeze: d(form.dataFreeze),
  };
};


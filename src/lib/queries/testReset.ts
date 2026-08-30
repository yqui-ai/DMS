import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   TEMPORARY — test-data reset.
   Delete this file, ResetTestDataDialog.tsx and the button in HierarchyPage before this app is
   used against anything real. It exists so a test programme can be emptied and re-walked from
   scratch, and it has no place in a production build.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

/** How much to remove.
 *
 * `data` clears what the subprojects produced and leaves the shape of the programme standing, so
 * the same waves can be re-walked. `hierarchy` additionally removes the projects and subprojects
 * themselves, for starting the structure over. Two modes rather than one because they answer
 * different questions, and a delete dialog should never make the larger one the only option. */
export type ResetMode = 'data' | 'hierarchy' | 'everything';

export interface ResetCounts {
  programs: number;
  plants: number;
  archiveRequests: number;
  changeLog: number;
  projects: number;
  subprojects: number;
  cycles: number;
  fmds: number;
  rules: number;
  xrefs: number;
  scopeObjects: number;
  candidates: number;
  waivers: number;
}

const DATA_KEYS = ['fmds', 'rules', 'xrefs', 'scopeObjects', 'candidates', 'waivers'] as const;
const HIERARCHY_KEYS = ['projects', 'subprojects', 'cycles'] as const;
const EVERYTHING_KEYS = ['programs', 'plants', 'archiveRequests', 'changeLog'] as const;

/** What a given mode would actually remove — the hierarchy counts only apply to `hierarchy`. */
export const resetTotal = (c: ResetCounts, mode: ResetMode): number => {
  const keys = mode === 'everything'
    ? [...EVERYTHING_KEYS, ...HIERARCHY_KEYS, ...DATA_KEYS]
    : mode === 'hierarchy' ? [...HIERARCHY_KEYS, ...DATA_KEYS] : DATA_KEYS;
  return keys.reduce((n, k) => n + c[k], 0);
};

export const EMPTY_COUNTS: ResetCounts = {
  programs: 0, plants: 0, archiveRequests: 0, changeLog: 0,
  projects: 0, subprojects: 0, cycles: 0,
  fmds: 0, rules: 0, xrefs: 0, scopeObjects: 0, candidates: 0, waivers: 0,
};

/** A PostgREST error with something in it a person can act on.
 *
 * A `head: true` request has no response body, so supabase-js has no message to parse out and
 * `error.message` comes back empty — which surfaced as a toast with an icon and no words. Falls
 * through everything the error object might carry before giving up, and names the table so the
 * failure points somewhere. */
const describeError = (table: string, error: any): Error => {
  const detail = [error?.message, error?.details, error?.hint, error?.code]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(' · ');
  return new Error(`${table}: ${detail || 'the database gave no reason.'}`);
};

async function idsOf(table: string, column: string, values: string[]): Promise<string[]> {
  if (values.length === 0) return [];
  const { data, error } = await supabase.from(table).select('id').in(column, values);
  if (error) throw describeError(table, error);
  return (data ?? []).map((r: any) => r.id as string);
}

const countIn = async (table: string, column: string, values: string[]): Promise<number> => {
  if (values.length === 0) return 0;
  // `*`, not `id`. `scope_waivers` is keyed by (subproject_id, migration_object_id,
  // requires_object_id) and has no `id` column at all, so counting on one threw and took the whole
  // preview down with it — which the dialog then rendered as "nothing to delete".
  // `head: true` returns no rows, so the wildcard costs nothing.
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .in(column, values);
  if (error) throw describeError(table, error);
  return count ?? 0;
};

/** What a reset would remove, without removing it.
 *
 * Counted rather than estimated, and shown before the confirm: "this will delete everything" is not
 * something anyone can check, whereas "14 Field Mappings, 3 rules, 12 scope objects" is.
 *
 * Both modes are counted in one pass, so switching between them in the dialog does not refetch. */
export async function previewReset(programId: string): Promise<ResetCounts> {
  const projectIds = await idsOf('projects', 'program_id', [programId]);
  if (projectIds.length === 0) return EMPTY_COUNTS;
  const subprojectIds = await idsOf('subprojects', 'project_id', projectIds);
  if (subprojectIds.length === 0) return { ...EMPTY_COUNTS, projects: projectIds.length };

  const [cycles, fmds, rules, xrefs, scopeObjects, candidates, waivers] = await Promise.all([
    countIn('cycles', 'subproject_id', subprojectIds),
    countIn('fmds', 'subproject_id', subprojectIds),
    countIn('rules', 'subproject_id', subprojectIds),
    countIn('xref_tables', 'subproject_id', subprojectIds),
    countIn('subproject_objects', 'subproject_id', subprojectIds),
    countIn('scope_candidates', 'subproject_id', subprojectIds),
    countIn('scope_waivers', 'subproject_id', subprojectIds),
  ]);
  return {
    ...EMPTY_COUNTS,
    projects: projectIds.length,
    subprojects: subprojectIds.length,
    cycles, fmds, rules, xrefs, scopeObjects, candidates, waivers,
  };
}

/** What a system-wide reset would remove.
 *
 * Unscoped on purpose — 'everything' spans every programme, so a per-programme count would
 * understate it. RLS still applies, so these are the rows the caller can see; the function will
 * refuse outright unless they administer every programme, so the two agree in the case that
 * matters. */
export async function previewResetEverything(): Promise<ResetCounts> {
  const countAll = async (table: string): Promise<number> => {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) throw describeError(table, error);
    return count ?? 0;
  };

  const [
    programs, projects, subprojects, cycles, fmds, rules, xrefs,
    scopeObjects, candidates, waivers, plants, archiveRequests, changeLog,
  ] = await Promise.all([
    // The programmes that will actually GO. The ones holding catalogue rows are kept as shells —
    // `migration_objects.program_id` cascades, so deleting the last programme would take the 442
    // DMC objects and ~180k structure/field rows with it. See migration 0053.
    countAll('programs'),
    countAll('projects'), countAll('subprojects'), countAll('cycles'),
    countAll('fmds'), countAll('rules'), countAll('xref_tables'),
    countAll('subproject_objects'), countAll('scope_candidates'), countAll('scope_waivers'),
    countAll('plants'), countAll('archive_requests'), countAll('change_log'),
  ]);

  const { data: catalogueOwners, error } = await supabase
    .from('migration_objects').select('program_id').limit(1000);
  if (error) throw describeError('migration_objects', error);
  const kept = new Set((catalogueOwners ?? []).map((r: any) => r.program_id as string)).size;

  return {
    ...EMPTY_COUNTS,
    // Only the programmes without catalogue rows are deleted; the rest are emptied in place.
    programs: Math.max(0, programs - kept),
    projects, subprojects, cycles, fmds, rules, xrefs,
    scopeObjects, candidates, waivers, plants, archiveRequests, changeLog,
  };
}

export function useTestDataReset() {
  const queryClient = useQueryClient();

  return {
    previewReset,
    previewResetEverything,

    /** Empties one programme. The programme row itself always survives — it is what you are
     * standing in, and deleting it would remove the thing you were resetting from under you.
     *
     * Also always survives, in both modes: the Golden FMD, every Standard FMD and the Golden XREF.
     * Those are program-wide rows (`subproject_id is null`), so neither a subproject-scoped delete
     * nor a cascade from `projects` can reach them — protected by the shape of the schema rather
     * than by a filter someone could later edit. Plants and the SAP object catalogue are
     * programme- and system-wide too, and likewise untouched.
     *
     * Every delete goes through PostgREST as the signed-in user, so RLS applies: a programme you
     * cannot administer, you cannot reset. The change-log trigger fires on cascaded deletes as well
     * as direct ones, so a reset is itself fully auditable. */
    async resetProgram(programId: string, mode: ResetMode): Promise<ResetCounts> {
      /* One RPC, not six deletes.
       *
       * Doing this from the client could not work and could not finish. Migration 0041 blocks
       * DELETE on fmds, rules, xref_tables and the whole hierarchy — "nothing is deleted, enforced
       * here, not only in the UI" — but NOT on the scope tables. So the scope rows went, `fmds`
       * raised, and the reset stopped half-done: scope gone, documents still there. Six PostgREST
       * calls are also six transactions, so there was never a moment at which the reset either had
       * or had not happened.
       *
       * `dms_reset_program` (0052) does the whole thing in one transaction, under a
       * transaction-local exception to that trigger, and checks the caller administers the
       * programme before it does anything. A failure now leaves the programme untouched. */
      const { data, error } = await supabase.rpc('dms_reset_program', {
        p_program_id: programId,
        p_mode: mode,
      });
      if (error) throw describeError('reset', error);

      // Everything, rather than a curated list. A reset invalidates more of the cache than any
      // normal write, and naming twenty keys here is how one gets missed.
      await queryClient.invalidateQueries();
      // The function reports what it actually removed, rather than echoing a preview taken a
      // moment earlier against data that may have moved since.
      return { ...EMPTY_COUNTS, ...((data as Partial<ResetCounts>) ?? {}) };
    },
  };
}

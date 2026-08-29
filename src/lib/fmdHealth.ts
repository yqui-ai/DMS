import {
  classifyTransform, criticalFieldsOf, effortWeight,
  isPointerRule, looksLikeSql, MAPPING_TYPE_VALUES, OPTIONAL_FIELDS, scopeOf,
} from './mappingRulePolicy';
import { readMappingReviews } from './queries/mappingReview';
import { isActionable, reviewPointCategory } from './reviewPointCategories';
import type { FmdFieldNote, FmdVersion, GeneratedTable } from '../types/entities';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheck {
  key: string;
  label: string;
  status: CheckStatus;
  /** The number that decided it, and what the number is of. */
  detail: string;
}

export interface FmdHealth {
  structures: { ident: string; rows: number }[];
  totalRows: number;
  scope: { in: number; out: number; unset: number };
  /** Cells expected to hold something and don't, ignoring the two fields policy allows to be blank. */
  blanks: { criticalBlank: number; criticalCells: number; blankCells: number; totalCells: number };
  /** Rows per mapping type, with TRANSFORM split the way the effort model splits it. */
  mapping: { label: string; rows: number; effort: number }[];
  untyped: number;
  totalEffort: number;
  rules: { sql: number; prose: number; pointer: number; blank: number };
  review: { ran: boolean; at?: string; errors: number; warnings: number; addressed: number; outstanding: number };
  points: { open: number; closed: number; byCategory: { label: string; n: number }[] };
  pendingChanges: number;
  checks: HealthCheck[];
  /** Fields the in-scope filter excluded from every number except `scope`. Zero when off. */
  excluded: number;
}

const EFFORT_BUCKETS = ['COPY', 'DEFAULT', 'TRANSFORM_Simple', 'TRANSFORM_Complex', 'XREF'] as const;
const BUCKET_LABEL: Record<(typeof EFFORT_BUCKETS)[number], string> = {
  COPY: 'Copy', DEFAULT: 'Default', TRANSFORM_Simple: 'Transform · Simple',
  TRANSFORM_Complex: 'Transform · Complex', XREF: 'XREF',
};

/** Everything the Health check tab reports, computed in one pass over the LATEST version.
 *
 * Deliberately pure and deterministic — no AI. Every number here is countable, and a health report
 * that can't be reproduced by counting is a report nobody can act on. The AI's opinion already has
 * its own pane; this is the arithmetic.
 *
 * Always run against the latest version, never the one selected in the dropdown: "how healthy is
 * this FMD" is a question about the document as it stands, and answering it from a version someone
 * happened to be browsing would report a state that no longer exists. */
export function analyseFmd(
  version: FmdVersion | undefined,
  notes: FmdFieldNote[],
  pendingChanges: number,
  /** Judge only the fields being migrated. An excluded field needs no rule and no target, so
   * grading it drags the score down for work nobody intends to do. Coverage still counts every
   * field, because "how much of this is in scope" is the one question the filter can't answer
   * about itself.
   *
   * **In scope means `MIGRATION_IN_SCOPE = in`, not "not explicitly out".** It used to keep every
   * row that wasn't marked out, which made the toggle a no-op on the overwhelmingly common FMD
   * where nobody has filled the column yet: 38 in scope, 0 out, 229 not stated — so filtering
   * removed nothing and the control looked broken. It was doing what its comment said and not what
   * its label said. If that now yields zero rows, the honest reading is "scope has not been decided
   * yet", and the Coverage figures above say so. */
  inScopeOnly = false,
): FmdHealth | null {
  const allTables: GeneratedTable[] = version?.sheets.generatedTables ?? [];
  const tables: GeneratedTable[] = inScopeOnly
    ? allTables.map((t) => ({ ...t, rows: t.rows.filter((r) => scopeOf(r.MIGRATION_IN_SCOPE) === 'in') }))
    : allTables;
  const columns = version?.sheets.generatedColumns;
  if (!version || allTables.length === 0) return null;

  const criticalFields = criticalFieldsOf(columns);
  const structures = tables.map((t) => ({ ident: t.structureIdent, rows: t.rows.length }));
  const totalRows = structures.reduce((n, s) => n + s.rows, 0);

  // Always over ALL rows, filter or no filter: the point of the coverage numbers is to say how
  // much of the document the filter is hiding.
  const scope = { in: 0, out: 0, unset: 0 };
  for (const t of allTables) for (const r of t.rows) scope[scopeOf(r.MIGRATION_IN_SCOPE)] += 1;
  const allRows = scope.in + scope.out + scope.unset;

  const rules = { sql: 0, prose: 0, pointer: 0, blank: 0 };
  const byBucket = new Map<string, { rows: number; effort: number }>();
  let untyped = 0;
  let totalEffort = 0;
  let blankCells = 0;
  let totalCells = 0;
  let criticalBlank = 0;
  let criticalCells = 0;

  for (const table of tables) {
    for (const row of table.rows) {
      const technical = (row.TECHNICAL_RULE ?? '').trim();
      if (!technical) rules.blank += 1;
      else if (isPointerRule(technical)) rules.pointer += 1;
      else if (looksLikeSql(technical)) rules.sql += 1;
      else rules.prose += 1;

      const type = (row.MAPPING_TYPE ?? '').trim().toUpperCase();
      if (!(MAPPING_TYPE_VALUES as readonly string[]).includes(type)) {
        untyped += 1;
      } else {
        const bucket = type === 'TRANSFORM' ? `TRANSFORM_${classifyTransform(technical)}` : type;
        const effort = effortWeight(type, technical);
        const cur = byBucket.get(bucket) ?? { rows: 0, effort: 0 };
        byBucket.set(bucket, { rows: cur.rows + 1, effort: cur.effort + effort });
        totalEffort += effort;
      }

      for (const [field, value] of Object.entries(row)) {
        if (OPTIONAL_FIELDS.includes(field)) continue;
        const empty = (value ?? '').trim() === '';
        totalCells += 1;
        if (empty) blankCells += 1;
        if (criticalFields.includes(field)) {
          criticalCells += 1;
          if (empty) criticalBlank += 1;
        }
      }
    }
  }

  const mapping = EFFORT_BUCKETS
    .map((b) => ({ label: BUCKET_LABEL[b], rows: byBucket.get(b)?.rows ?? 0, effort: byBucket.get(b)?.effort ?? 0 }))
    .filter((m) => m.rows > 0);

  const runs = readMappingReviews(version.sheets);
  const lastRun = runs[runs.length - 1];
  const findings = lastRun?.findings ?? [];
  const addressed = findings.filter((f) => f.addressed).length;
  const review = {
    ran: !!lastRun,
    at: lastRun?.reviewedAt,
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    addressed,
    outstanding: findings.length - addressed,
  };

  const topLevel = notes.filter((n) => !n.parentId);
  const openPoints = topLevel.filter((n) => !n.resolved);
  const points = {
    open: openPoints.filter((n) => isActionable(n.tag)).length,
    closed: topLevel.length - openPoints.length,
    byCategory: Object.values(
      openPoints.reduce<Record<string, { label: string; n: number }>>((acc, n) => {
        const label = reviewPointCategory(n.tag).label;
        acc[label] = { label, n: (acc[label]?.n ?? 0) + 1 };
        return acc;
      }, {}),
    ),
  };

  /** Named checks rather than one invented score. A single number would need weightings nobody
   * agreed, and "72% healthy" tells you nothing about what to do next; each line below names its
   * own remedy by naming what it counted. */
  const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));
  const checks: HealthCheck[] = [
    {
      // Counted over EVERY field. Measuring "is scope stated" against a list already filtered by
      // scope would always pass, which is the one way this check can lie.
      key: 'scope', label: 'Migration scope stated',
      status: scope.unset === 0 ? 'pass' : scope.unset === allRows ? 'fail' : 'warn',
      detail: scope.unset === 0
        ? `All ${allRows} fields say whether they're in scope`
        : `${scope.unset} of ${allRows} fields don't say`,
    },
    {
      key: 'critical', label: 'Critical fields populated',
      status: criticalCells === 0 ? 'warn' : criticalBlank === 0 ? 'pass' : 'fail',
      detail: criticalCells === 0
        ? 'No fields are marked critical in the Golden template'
        : criticalBlank === 0 ? `All ${criticalCells} critical cells filled` : `${criticalBlank} of ${criticalCells} critical cells blank`,
    },
    {
      key: 'typed', label: 'Mapping type set',
      status: untyped === 0 ? 'pass' : untyped > totalRows / 2 ? 'fail' : 'warn',
      detail: untyped === 0 ? `All ${totalRows} fields typed` : `${untyped} of ${totalRows} fields have no valid MAPPING_TYPE`,
    },
    {
      key: 'sql', label: 'Technical rules are SQL',
      status: rules.sql === totalRows ? 'pass' : rules.sql >= totalRows / 2 ? 'warn' : 'fail',
      detail: `${rules.sql} of ${totalRows} in SQL · ${rules.blank} blank · ${rules.prose} prose · ${rules.pointer} pointing elsewhere`,
    },
    {
      key: 'review', label: 'Mapping review',
      status: !review.ran ? 'fail' : review.outstanding === 0 ? 'pass' : review.errors > 0 ? 'fail' : 'warn',
      detail: !review.ran
        ? 'Never reviewed'
        : review.outstanding === 0 ? 'Every finding addressed' : `${review.outstanding} findings outstanding (${review.errors} errors)`,
    },
    {
      key: 'points', label: 'Review points closed',
      status: points.open === 0 ? 'pass' : 'warn',
      detail: points.open === 0 ? 'Nothing outstanding' : `${points.open} actionable points open`,
    },
    {
      key: 'draft', label: 'Nothing unpublished',
      status: pendingChanges === 0 ? 'pass' : 'warn',
      detail: pendingChanges === 0 ? 'No unreleased edits' : `${pendingChanges} change${pendingChanges === 1 ? '' : 's'} waiting to be published`,
    },
    {
      key: 'fill', label: 'Overall completeness',
      status: blankCells === 0 ? 'pass' : pct(blankCells, totalCells) > 25 ? 'fail' : 'warn',
      detail: `${pct(totalCells - blankCells, totalCells)}% of cells filled · ${blankCells} blank`,
    },
  ];

  return {
    structures, totalRows, scope,
    blanks: { criticalBlank, criticalCells, blankCells, totalCells },
    mapping, untyped, totalEffort, rules, review, points, pendingChanges, checks,
    excluded: inScopeOnly ? scope.out + scope.unset : 0,
  };
}

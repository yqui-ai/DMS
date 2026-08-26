/** Single source of truth for the DMS mapping-rule policy: the canonical MAPPING_TYPE enum and the
 * per-type conventions for TRANSFORMATION_RULE/TECHNICAL_RULE. Consumed by:
 *  - GenerateFmdDialog.tsx — Standard FMD generation defaults (MAPPING_TYPE=COPY, RULE=1:1).
 *  - histClassify.ts — the Historical AI converter's free-text -> enum normalizer.
 *  - mappingReview.ts / the "Mapping Review" AI task — what a Custom FMD is checked against.
 * Mirrored (duplicated, not imported — Deno can't reach into src/) as prompt text inside
 * supabase/functions/convert-historical-fmd/index.ts; update both together, then redeploy the
 * function. See also .claude/skills/mapping-rule-policy/SKILL.md. */

import type { GeneratedColumn, GeneratedTable } from '../types/entities';

export const MAPPING_TYPE_VALUES = ['COPY', 'TRANSFORM', 'XREF', 'DEFAULT'] as const;

/** In / out / not stated, read from MIGRATION_IN_SCOPE.
 *
 * The column is free text in practice — X, Yes, Y, 1 all mean the same thing to whoever typed it —
 * so read it generously rather than demanding one spelling. Anything unrecognised counts as in
 * scope: a value nobody can parse is not evidence that a field was excluded.
 *
 * Blank is `unset`, and `unset` is NOT `out`. A field nobody has classified still needs a mapping;
 * treating silence as exclusion would let an unfinished FMD pass every check by omission. */
export const scopeOf = (raw: string | undefined): 'in' | 'out' | 'unset' => {
  const v = (raw ?? '').trim().toUpperCase();
  if (!v) return 'unset';
  if (['N', 'NO', 'FALSE', '0', 'OUT OF SCOPE', 'OUT', 'X-OUT'].includes(v)) return 'out';
  return 'in';
};

/** A field explicitly excluded from the migration doesn't need a rule, a target or a data type, so
 * checking it for completeness only manufactures findings nobody will act on. */
export const isOutOfScope = (row: Record<string, string>) => scopeOf(row.MIGRATION_IN_SCOPE) === 'out';
export type MappingType = (typeof MAPPING_TYPE_VALUES)[number];

/** The only fields a completeness check should NOT require — every other Source/Mapping/Target
 * field is expected to be populated. */
export const OPTIONAL_FIELDS = ['SRC_CHECK_TABLE', 'TGT_CHECK_TABLE'];

/** Best-effort keyword match onto the fixed enum; unrecognized-but-non-empty text falls back to
 * 'TRANSFORM' (the safest bucket — "there's real transformation logic here", not a silent
 * mis-tag as a simple copy). Blank input stays blank. */
export function normalizeMappingType(raw: string | undefined): MappingType | '' {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return '';
  if (/^1\s*:\s*1$|one.to.one|^direct|\bcopy\b/i.test(s)) return 'COPY';
  if (/\bdefault\b|\bfixed\b|\bconstant\b/i.test(s)) return 'DEFAULT';
  if (/\bx-?ref\b|cross.?reference|\blookup\b/i.test(s)) return 'XREF';
  return 'TRANSFORM';
}

/** TECHNICAL_RULE is SQL for EVERY mapping type — no exceptions.
 *
 * An earlier revision made this type-dependent (notation for COPY/DEFAULT, SQL only where logic
 * lives). That was overruled, and the simpler rule is the better one: one column, one language.
 * A developer reading the FMD never has to work out which dialect a given row is written in, and
 * anything that parses SQL — effort scoring, validation, a future generator — can treat the whole
 * column uniformly instead of special-casing two types.
 *
 * The shape per type is still different, it's just SQL in all four cases: a COPY is a SELECT, a
 * DEFAULT is a literal SELECT or a null-coalescing CASE, a TRANSFORM is a CASE, an XREF is a
 * lookup join with an explicit no-match branch. */
export const requiresSql = (_type?: string) => true;

/** Cheap "does this look like SQL at all" test — used to flag prose sitting in a field that is
 * supposed to carry a statement. Deliberately loose: catching "map accordingly" is the point, not
 * validating dialect. */
export const looksLikeSql = (rule: string) =>
  /\b(select|case\s+when|coalesce|join|from|coalesce|cast|substring|concat)\b/i.test(rule ?? '');

/** A rule that points somewhere else instead of stating the rule: "See migration document
 * chapter 3.2.5", 'See tab "RB Customer Rules"', "refer to STORT", "as per the concept document",
 * "TBD", "N/A".
 *
 * This is the single most common defect in a converted historical FMD and the policy had no name
 * for it, so nothing flagged it — the cell is populated, so a completeness check passes, and it
 * reads like prose an author meant to write. But an ETL developer cannot implement it: the content
 * lives in a document the FMD does not carry. Treat it as missing, because operationally it is. */
export const POINTER_RE = /^\s*(see|refer\s+to|as\s+per|per\s+the|according\s+to|check\s+with|cross\s*check|described\s+in|documented\s+in|tbd|t\.b\.d|n\/?a|\?+)\b|\b(chapter|section|tab|sheet|concept\s+document|migration\s+document|official\s+mapping\s+rule)\b/i;

export const isPointerRule = (text: string | undefined) => {
  const t = (text ?? '').trim();
  return t.length > 0 && POINTER_RE.test(t);
};

export interface PolicyFinding {
  field?: string;
  severity: 'error' | 'warning';
  issue: string;
}

/** Everything about a row that can be decided WITHOUT judgement.
 *
 * These checks used to be part of the AI prompt. They are all decidable in JS — is the field blank,
 * is MAPPING_TYPE in the enum, does TECHNICAL_RULE contain any SQL at all — and handing a decidable
 * question to a model makes its answer probabilistic: across ten-row batches it quietly returned
 * some and not others, which is exactly the "it doesn't catch everything" symptom. The same lesson
 * the converter already learned for column classification and rename detection.
 *
 * The model still runs, on what is genuinely a judgement call: whether a rule that IS SQL actually
 * implements the requirement beside it. See mappingReview.ts. */
export function auditRow(
  row: Record<string, string>,
  optionalFields: string[] = OPTIONAL_FIELDS,
  /** Fields the Golden template marks critical — blank in one of these is an error, blank anywhere
   * else is a warning. Empty means nothing is marked, so everything grades as a warning: an
   * unconfigured template should not shout. */
  criticalFields: string[] = [],
  /** The version's snapshot of the Golden template, so a value can be checked against the kind
   * and value list its column declares. */
  columns: GeneratedColumn[] = [],
): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  const val = (f: string) => (row[f] ?? '').trim();
  const type = val('MAPPING_TYPE').toUpperCase();
  const transformation = val('TRANSFORMATION_RULE');
  const technical = val('TECHNICAL_RULE');

  if (!type) {
    out.push({ field: 'MAPPING_TYPE', severity: 'error', issue: 'MAPPING_TYPE is blank.' });
  } else if (!(MAPPING_TYPE_VALUES as readonly string[]).includes(type)) {
    out.push({ field: 'MAPPING_TYPE', severity: 'error', issue: `MAPPING_TYPE "${val('MAPPING_TYPE')}" is not one of ${MAPPING_TYPE_VALUES.join('/')}.` });
  }

  // A pointer is checked BEFORE the SQL test, so the finding names the real problem: the rule was
  // never written down here, rather than the symptom that it isn't SQL.
  if (isPointerRule(transformation)) {
    out.push({ field: 'TRANSFORMATION_RULE', severity: 'error', issue: `TRANSFORMATION_RULE points elsewhere ("${transformation}") instead of stating the rule. The FMD must carry the rule itself.` });
  }
  if (isPointerRule(technical)) {
    out.push({ field: 'TECHNICAL_RULE', severity: 'error', issue: `TECHNICAL_RULE points elsewhere ("${technical}") instead of containing SQL.` });
  } else if (technical && !looksLikeSql(technical)) {
    out.push({ field: 'TECHNICAL_RULE', severity: 'error', issue: 'TECHNICAL_RULE is prose, not SQL. Every mapping type requires a SQL statement naming the source table and field.' });
  }

  if (type === 'COPY' && transformation && !/^1\s*:\s*1$/.test(transformation) && !isPointerRule(transformation)) {
    out.push({ field: 'TRANSFORMATION_RULE', severity: 'warning', issue: `MAPPING_TYPE is COPY but TRANSFORMATION_RULE is "${transformation}", expected "1:1".` });
  }
  if (type === 'TRANSFORM' && looksLikeSql(technical) && /\bcase\s+when\b/i.test(technical) && !/\belse\b/i.test(technical)) {
    out.push({ field: 'TECHNICAL_RULE', severity: 'warning', issue: 'CASE expression has no ELSE branch — the unmatched case is undefined.' });
  }
  if (type === 'XREF' && looksLikeSql(technical) && !/\bjoin\b|\bcoalesce\b/i.test(technical)) {
    out.push({ field: 'TECHNICAL_RULE', severity: 'warning', issue: 'XREF rule shows no lookup join and no no-match handling (LEFT JOIN / COALESCE).' });
  }

  // A value that contradicts its own column definition — not on the list, not a number where the
  // template says number. Cheap to check and impossible to argue with, so it belongs here rather
  // than in the model.
  for (const column of columns) {
    const problem = valueTypeError(column, row[column.field] ?? '');
    if (problem) out.push({ field: column.field, severity: 'error', issue: problem });
  }

  // Blank fields last: a row missing several reads better as "these are missing" after the
  // specific rule violations than interleaved with them.
  for (const [field, value] of Object.entries(row)) {
    if (optionalFields.includes(field) || field === 'MAPPING_TYPE') continue;
    if ((value ?? '').trim() !== '') continue;
    const critical = criticalFields.includes(field);
    out.push({
      field,
      severity: critical ? 'error' : 'warning',
      issue: critical ? `${field} is blank — the Golden template marks it critical.` : `${field} is blank.`,
    });
  }
  return out;
}

/** Splits a typed value list into its values.
 *
 * Accepts comma, semicolon or newline. People paste these out of Excel and out of existing FMDs,
 * where the separator is whatever that file happened to use — insisting on commas meant
 * "CHAR;DATS;INT" silently became a single option named "CHAR;DATS;INT", which looks like the
 * feature is broken rather than like a formatting rule was missed. Duplicates are dropped, order is
 * kept. */
export const parseValueList = (text: string): string[] => {
  const seen = new Set<string>();
  return (text ?? '')
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter((v) => {
      if (!v || seen.has(v.toUpperCase())) return false;
      seen.add(v.toUpperCase());
      return true;
    });
};

/** A column's value list, re-parsed.
 *
 * Lists saved before `parseValueList` accepted semicolons are stored as ONE option that still has
 * the separators in it — "CHAR;DATS;INT". Re-splitting on read repairs them in place, so a template
 * typed before the fix works without anyone having to notice, retype it and re-sync every FMD
 * generated from it. Costs nothing on a list that's already clean. */
export const optionsOf = (column: { options?: string[] } | undefined): string[] =>
  parseValueList((column?.options ?? []).join(','));

/** Whether a value is acceptable for the column's declared kind, or why it isn't.
 *
 * The Golden template declares what a column accepts; this is the one place that reads the
 * declaration, so the editor and the review can't disagree about what "valid" means. A blank passes
 * — emptiness is the completeness check's business, not the type check's. */
export function valueTypeError(column: GeneratedColumn | undefined, value: string): string | null {
  const raw = (value ?? '').trim();
  if (!column || !raw) return null;
  switch (column.kind) {
    case 'select': {
      const options = optionsOf(column);
      if (options.length === 0) return null;
      return options.some((o) => o.toUpperCase() === raw.toUpperCase())
        ? null
        : `"${raw}" is not one of the allowed values (${options.join(', ')}).`;
    }
    case 'boolean':
      return /^(x|y|yes|n|no|true|false|1|0)$/i.test(raw) ? null : `"${raw}" is not a yes/no value.`;
    case 'integer':
      return /^-?\d+$/.test(raw) ? null : `"${raw}" is not a whole number.`;
    case 'decimal':
      return /^-?\d+([.,]\d+)?$/.test(raw) ? null : `"${raw}" is not a number.`;
    default:
      return null;
  }
}

/** Re-checks one finding against the CURRENT content — the draft if there is one — and returns the
 * issue if it still stands, or null if it's genuinely gone.
 *
 * This is what stops "Mark fixed" from being a sticky note. Marking a finding fixed while the cell
 * is still blank hides it from the list and leaves the FMD exactly as broken, which is worse than
 * not marking it: the count says the work shrank when it didn't.
 *
 * Only the mechanical half can be verified. A judgement finding ("the SQL doesn't implement the
 * stated rule") has no deterministic counterpart, so it returns null and the person's claim stands
 * — re-running the review is the check for those. */
export function outstandingIssue(
  finding: { field?: string; issue: string; structureId: string; rowIndex: number },
  tables: GeneratedTable[],
  criticalFields: string[] = [],
): string | null {
  const table = tables.find((t) => t.structureId === finding.structureId);
  if (!table || !finding.field) return null;

  const blanks = alwaysBlankFields(table.rows);
  // A column blank everywhere is reported once against the structure, and auditRow skips it per
  // row — so check it here for BOTH kinds of finding, or a per-row blank would read as fixed the
  // moment the whole column emptied.
  if (blanks.includes(finding.field)) return finding.issue;
  if (finding.rowIndex < 0) return null;

  const row = table.rows[finding.rowIndex];
  if (!row) return null;
  const again = auditRow(row, [...OPTIONAL_FIELDS, ...blanks], criticalFields);
  return again.find((p) => p.field === finding.field && p.issue === finding.issue)?.issue ?? null;
}

/** The fields a version's snapshot of the Golden template marks critical. Read from the version's
 * own `generatedColumns`, not from the live Golden FMD: a review must judge a version against the
 * template it was generated from, or re-flagging the template would silently re-grade old reviews. */
export const criticalFieldsOf = (columns: GeneratedColumn[] | undefined): string[] =>
  (columns ?? []).filter((c) => c.critical).map((c) => c.field);

/** Fields blank in EVERY row of a structure.
 *
 * Reported once against the structure rather than once per row: a column nobody filled in is one
 * decision, not thirty-three defects, and thirty-three copies of it bury every other finding in the
 * list. `auditRow` skips these so they aren't reported twice. */
export function alwaysBlankFields(rows: Record<string, string>[], optionalFields: string[] = OPTIONAL_FIELDS): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0])
    .filter((f) => !optionalFields.includes(f))
    .filter((f) => rows.every((r) => (r[f] ?? '').trim() === ''));
}

export type TransformComplexity = 'Simple' | 'Complex';

/** Simple vs Complex for a TRANSFORM row, DERIVED from the technical rule rather than typed by
 * hand. The checklist defines the distinction computationally (count conditions, count source
 * tables, detect nesting), so computing it keeps the flag honest: it can never disagree with the
 * rule it describes, it updates the moment a rule is refined, and nobody has to remember to set it.
 *
 * A stored flag beside the SQL would be a second source of truth for the same fact — the same
 * shape of bug as the dead xref_tables.version column.
 *
 * Simple  = one source table, no join, at most one condition.
 * Complex = anything else. When in doubt this returns Complex, because under-estimating a
 *           transform is the expensive direction. */
export function classifyTransform(technicalRule: string): TransformComplexity {
  const rule = (technicalRule ?? '').trim();
  if (!rule) return 'Complex';
  // Prose ("map accordingly") has no SQL markers, so every count below reads zero and it would
  // score as Simple — the cheapest possible rating for a row nobody can implement yet. An
  // unclassifiable rule is unknown, not simple, and unknown costs more, not less.
  if (!looksLikeSql(rule)) return 'Complex';

  const whens = (rule.match(/\bwhen\b/gi) ?? []).length;
  const joins = (rule.match(/\bjoin\b/gi) ?? []).length;
  const subSelects = (rule.match(/\bselect\b/gi) ?? []).length;
  // Distinct table-ish identifiers after FROM/JOIN — a transform reading two tables is, by the
  // checklist's own definition, complex regardless of how few branches it has.
  const sources = new Set(
    [...rule.matchAll(/\b(?:from|join)\s+([A-Za-z_][\w$.]*)/gi)].map((m) => m[1].toLowerCase()),
  );

  if (joins > 0) return 'Complex';
  if (whens > 1) return 'Complex';
  if (subSelects > 1) return 'Complex';
  if (sources.size > 1) return 'Complex';
  return 'Simple';
}

/** Relative build effort per row, for the FMD effort estimate. These are the checklist's starting
 * weights; they're expected to be recalibrated against a project's own actuals, which is why they
 * live in one exported map rather than being scattered through the estimator. */
export const MAPPING_EFFORT_WEIGHTS = {
  COPY: 1,
  DEFAULT: 1,
  'TRANSFORM_Simple': 2,
  'TRANSFORM_Complex': 5,
  XREF: 3,
} as const;

/** Effort weight for one row, resolving TRANSFORM through classifyTransform. */
export function effortWeight(mappingType: string, technicalRule: string): number {
  const type = (mappingType ?? '').trim().toUpperCase();
  if (type === 'TRANSFORM') return MAPPING_EFFORT_WEIGHTS[`TRANSFORM_${classifyTransform(technicalRule)}`];
  if (type === 'COPY' || type === 'DEFAULT' || type === 'XREF') return MAPPING_EFFORT_WEIGHTS[type];
  return 0;
}

/** The policy text handed to the Mapping Review AI task, verbatim — keep this and the mirrored
 * copy in the Edge Function in sync. */
export const MAPPING_RULE_POLICY_TEXT = `Every field in the Source, Mapping, and Target sections of a row must be populated, EXCEPT SRC_CHECK_TABLE and TGT_CHECK_TABLE, which are allowed to be blank.

MAPPING_TYPE must be exactly one of: COPY, TRANSFORM, XREF, DEFAULT.

TECHNICAL_RULE must ALWAYS be written in SQL syntax, for every mapping type without exception. Prose such as "map accordingly", "same as legacy", "1:1" or a bare restatement of the field name is never acceptable in TECHNICAL_RULE, and must be flagged. The rule must name the actual source table(s) and field(s) it reads.

A rule that POINTS somewhere else instead of stating the rule — "See migration document chapter 3.2.5", "See tab RB Customer Rules", "refer to STORT", "as per the concept document", "TBD" — is treated as missing, in TRANSFORMATION_RULE and TECHNICAL_RULE alike. The FMD must carry the rule itself; an ETL developer cannot implement a reference to a document the FMD does not include.

- If MAPPING_TYPE is COPY: TRANSFORMATION_RULE must be exactly "1:1", and TECHNICAL_RULE must be a plain select of the source field, e.g. SELECT <source_field> FROM <source_table>.
- If MAPPING_TYPE is DEFAULT: TECHNICAL_RULE must set a literal value in SQL, e.g. SELECT 'X' AS <target_field> for an unconditional default, or CASE WHEN <source_field> IS NULL THEN 'X' ELSE <source_field> END when the default only applies to blanks. TRANSFORMATION_RULE must make clear which of the two it is.
- If MAPPING_TYPE is TRANSFORM: TECHNICAL_RULE must be a CASE expression or equivalent statement covering every stated condition INCLUDING the ELSE/otherwise case.
- If MAPPING_TYPE is XREF: the cross-reference (XREF) table/object name must be explicitly mentioned in BOTH TRANSFORMATION_RULE and TECHNICAL_RULE, and TECHNICAL_RULE must show the lookup in SQL. It must also show the no-match behaviour (for example a LEFT JOIN with COALESCE, or an explicit default) — a rule that only covers the matching case is incomplete.`;

/** Single source of truth for the DMS mapping-rule policy: the canonical MAPPING_TYPE enum and the
 * per-type conventions for TRANSFORMATION_RULE/TECHNICAL_RULE. Consumed by:
 *  - GenerateFmdDialog.tsx — Standard FMD generation defaults (MAPPING_TYPE=COPY, RULE=1:1).
 *  - histClassify.ts — the Historical AI converter's free-text -> enum normalizer.
 *  - mappingReview.ts / the "Mapping Review" AI task — what a Custom FMD is checked against.
 * Mirrored (duplicated, not imported — Deno can't reach into src/) as prompt text inside
 * supabase/functions/convert-historical-fmd/index.ts; update both together, then redeploy the
 * function. See also .claude/skills/mapping-rule-policy/SKILL.md. */

export const MAPPING_TYPE_VALUES = ['COPY', 'TRANSFORM', 'XREF', 'DEFAULT'] as const;
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

- If MAPPING_TYPE is COPY: TRANSFORMATION_RULE must be exactly "1:1", and TECHNICAL_RULE must be a plain select of the source field, e.g. SELECT <source_field> FROM <source_table>.
- If MAPPING_TYPE is DEFAULT: TECHNICAL_RULE must set a literal value in SQL, e.g. SELECT 'X' AS <target_field> for an unconditional default, or CASE WHEN <source_field> IS NULL THEN 'X' ELSE <source_field> END when the default only applies to blanks. TRANSFORMATION_RULE must make clear which of the two it is.
- If MAPPING_TYPE is TRANSFORM: TECHNICAL_RULE must be a CASE expression or equivalent statement covering every stated condition INCLUDING the ELSE/otherwise case.
- If MAPPING_TYPE is XREF: the cross-reference (XREF) table/object name must be explicitly mentioned in BOTH TRANSFORMATION_RULE and TECHNICAL_RULE, and TECHNICAL_RULE must show the lookup in SQL. It must also show the no-match behaviour (for example a LEFT JOIN with COALESCE, or an explicit default) — a rule that only covers the matching case is incomplete.`;

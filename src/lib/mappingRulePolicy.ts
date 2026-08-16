/** Single source of truth for the DMS mapping-rule policy: the canonical MAPPING_TYPE enum and the
 * per-type conventions for TRANSFORMATION_RULE/TECHNICAL_RULE. Consumed by:
 *  - GenerateFmdDialog.tsx — Standard FMD generation defaults (MAPPING_TYPE=COPY, RULE=1:1).
 *  - histClassify.ts — the Historical AI converter's free-text -> enum normalizer.
 *  - mappingReview.ts / the "Mapping Review" AI task — what a Custom FMD is checked against.
 * Mirrored (duplicated, not imported — Deno can't reach into src/) as prompt text inside
 * supabase/functions/convert-historical-fmd/index.ts; update both together if this changes. See
 * also .claude/skills/mapping-rule-policy/SKILL.md, which documents this same policy for anyone
 * (human or AI) working on this feature without having read this file first. */

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

/** The policy text handed to the Mapping Review AI task, verbatim — keep this and the mirrored
 * copy in the Edge Function in sync. */
export const MAPPING_RULE_POLICY_TEXT = `Every field in the Source, Mapping, and Target sections of a row must be populated, EXCEPT SRC_CHECK_TABLE and TGT_CHECK_TABLE, which are allowed to be blank.

MAPPING_TYPE must be exactly one of: COPY, TRANSFORM, XREF, DEFAULT.

- If MAPPING_TYPE is COPY: TRANSFORMATION_RULE must be exactly "1:1", and TECHNICAL_RULE must be in the form "<table>-<field>" (the target table and field, hyphen-separated).
- If MAPPING_TYPE is DEFAULT: TECHNICAL_RULE must express a literal default-value assignment in the form "<table>-<field> = <value>" (value may be quoted text like "TEST" or a bare number like 123).
- If MAPPING_TYPE is XREF: the cross-reference (XREF) table/object name must be explicitly mentioned in BOTH TRANSFORMATION_RULE and TECHNICAL_RULE.
- If MAPPING_TYPE is TRANSFORM: TRANSFORMATION_RULE and TECHNICAL_RULE must both be populated with real, non-generic transformation logic (not just restating the field name).`;

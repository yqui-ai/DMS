/** The Golden FMD baseline: every field the standard template ships with. The designer refuses to
 * remove or rename any of them.
 *
 * This used to be a much shorter list — only the seven the application itself would break without.
 * That was the wrong line to draw. The baseline is a PROGRAMME agreement about what an FMD is: a
 * document missing SRC_FIELD_DATATYPE or MIGRATION_IN_SCOPE is not a leaner FMD, it's an FMD that
 * can't be reviewed, sized or handed to an ETL developer. Sections can still be added, renamed,
 * recoloured and reordered, each field's TYPE, VALUE LIST, DESCRIPTION and CRITICAL flag are still
 * freely editable, and extra fields can still be added — you just can't take the baseline away.
 *
 * Seven of these are additionally load-bearing in code, which is why they were the original list:
 * SRC_FIELD / TGT_FIELD are the content-based ROW IDENTITY (rowKey in src/lib/rowDiff.ts) that
 * every diff, highlight, finding and review point is keyed on; MAPPING_TYPE / TRANSFORMATION_RULE /
 * TECHNICAL_RULE are what the mapping rule policy and the AI review are defined in terms of; and
 * SRC_TABLE / TGT_TABLE are what generation fills from the sender structure. */
export const REQUIRED_GOLDEN_FIELDS = [
  // Source
  'SRC_SYSTEM', 'SRC_TABLE', 'SRC_FIELD', 'SRC_FIELD_DESC', 'SRC_FIELD_MANDATORY',
  'SRC_FIELD_DATATYPE', 'SRC_FIELD_LENGTH', 'SRC_FIELD_DECIMAL', 'SRC_CHECK_TABLE',
  'MIGRATION_IN_SCOPE',
  // Mapping
  'MAPPING_TYPE', 'TRANSFORMATION_RULE', 'TECHNICAL_RULE',
  // Target
  'TGT_SYSTEM', 'TGT_TABLE', 'TGT_FIELD', 'TGT_FIELD_DESC', 'TGT_FIELD_MANDATORY',
  'TGT_FIELD_DATATYPE', 'TGT_FIELD_LENGTH', 'TGT_FIELD_DECIMAL', 'TGT_CHECK_TABLE',
  // Load
  'LOAD_APPROACH', 'LOAD_TABLE', 'LOAD_FIELD',
] as const;

const REQUIRED = new Set<string>(REQUIRED_GOLDEN_FIELDS);

export const isRequiredGoldenField = (field: string) => REQUIRED.has(field.trim().toUpperCase());

/** Which required fields a proposed structure would be missing — used to block a save outright,
 * so a field can't be lost by renaming it either (a rename reads as "required one gone, unknown
 * one added"). */
export function missingRequiredGoldenFields(fields: string[]): string[] {
  const present = new Set(fields.map((f) => f.trim().toUpperCase()));
  return REQUIRED_GOLDEN_FIELDS.filter((f) => !present.has(f));
}

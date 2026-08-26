/** Golden FMD fields the application itself depends on. The designer refuses to remove or rename
 * these, because removing one doesn't just lose a column — it breaks machinery elsewhere:
 *
 *  - SRC_FIELD / TGT_FIELD are the content-based ROW IDENTITY (see rowKey in src/lib/rowDiff.ts).
 *    Every version diff, every changed-cell highlight, every review finding and every review point
 *    is keyed on them. Drop them and existing review points detach from their rows permanently.
 *  - MAPPING_TYPE / TRANSFORMATION_RULE / TECHNICAL_RULE are what the mapping rule policy and the
 *    AI Mapping Review are defined in terms of (src/lib/mappingRulePolicy.ts).
 *  - SRC_TABLE / TGT_TABLE are what generation fills from the sender structure and what a
 *    technical rule references.
 *
 * This is a minimum, not a template: every other field stays freely editable, and sections can be
 * added, renamed, recoloured and reordered as before. */
export const REQUIRED_GOLDEN_FIELDS = [
  'SRC_TABLE', 'SRC_FIELD',
  'MAPPING_TYPE', 'TRANSFORMATION_RULE', 'TECHNICAL_RULE',
  'TGT_TABLE', 'TGT_FIELD',
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

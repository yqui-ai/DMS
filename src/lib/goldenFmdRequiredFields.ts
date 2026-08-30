import type { GoldenFmdStructure } from '../types/entities';

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
  // Target classification — what KIND of field this is, as opposed to what it contains.
  'FIELD_TYPE',
  // Load
  'LOAD_APPROACH', 'LOAD_TABLE', 'LOAD_FIELD',
] as const;

/** What a field means, and the values it accepts, when the app has to create it itself.
 *
 * The baseline is a list of names, because the designer owns everything else about a field — its
 * section, colour, description and value list are the programme's to decide. But a field the APP
 * inserts (see "Add missing baseline fields") has nobody to write those, and a required field
 * dropped into a template as a bare name with no description and no value list is a column people
 * then have to guess at. Only fields that need more than a name appear here. */
export const BASELINE_FIELD_DEFAULTS: Record<string, { description: string; kind?: 'text' | 'select'; options?: string[] }> = {
  FIELD_TYPE: {
    description: 'Standard = comes from the Golden template. Custom = added on this FMD only.',
    kind: 'select',
    options: ['Standard', 'Custom'],
  },
};

/** The value FIELD_TYPE carries for a field somebody added to one FMD rather than one the Golden
 * template put there. Named rather than typed as a literal at each site, because generation, the
 * editor and the export all have to agree on the exact spelling for the filter to work. */
export const CUSTOM_FIELD_TYPE = 'Custom';
export const STANDARD_FIELD_TYPE = 'Standard';

/** The section a newly-inserted baseline field belongs in, matched loosely against the template's
 * own section names so a programme that calls it "Target Section" or "TARGET" still gets it in the
 * right place. Falls back to the last section, which is where an unplaceable field is least
 * disruptive — never the first, which would put it in front of SRC_SYSTEM. */
export const BASELINE_FIELD_SECTION_HINT: Record<string, string[]> = {
  FIELD_TYPE: ['classification', 'target'],
};

const REQUIRED = new Set<string>(REQUIRED_GOLDEN_FIELDS);

export const isRequiredGoldenField = (field: string) => REQUIRED.has(field.trim().toUpperCase());

/** Which required fields a proposed structure would be missing — used to block a save outright,
 * so a field can't be lost by renaming it either (a rename reads as "required one gone, unknown
 * one added"). */
export function missingRequiredGoldenFields(fields: string[]): string[] {
  const present = new Set(fields.map((f) => f.trim().toUpperCase()));
  return REQUIRED_GOLDEN_FIELDS.filter((f) => !present.has(f));
}

/** Inserts the baseline fields a structure is missing, each into the best-matching section.
 *
 * Adding a name to REQUIRED_GOLDEN_FIELDS makes every EXISTING template invalid — the designer
 * refuses to save while a required field is absent, so a programme whose template predates the
 * addition is locked out of editing it at all until somebody recreates the field by hand, with the
 * right spelling, in the right place, with the right value list. This is that repair, done once and
 * correctly, so the new requirement is a one-click fix rather than a wall.
 *
 * Returns a NEW structure; nothing is mutated. The caller saves it like any other edit, so the
 * insertion goes through the normal comment-and-version path rather than happening invisibly.
 */
export function withMissingBaselineFields(structure: GoldenFmdStructure): GoldenFmdStructure {
  const missing = missingRequiredGoldenFields(structure.sections.flatMap((s) => s.fields.map((f) => f.field)));
  if (missing.length === 0 || structure.sections.length === 0) return structure;

  const sections = structure.sections.map((s) => ({ ...s, fields: [...s.fields] }));

  for (const field of missing) {
    const hints = BASELINE_FIELD_SECTION_HINT[field] ?? [];
    const target =
      hints.map((h) => sections.find((s) => s.name.toLowerCase().includes(h))).find(Boolean)
      ?? sections[sections.length - 1];
    const defaults = BASELINE_FIELD_DEFAULTS[field];
    target.fields.push({
      id: crypto.randomUUID(),
      field,
      description: defaults?.description ?? '',
      ...(defaults?.kind ? { kind: defaults.kind } : {}),
      ...(defaults?.options ? { options: defaults.options } : {}),
    });
  }

  return { sections };
}

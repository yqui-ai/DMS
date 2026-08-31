/** The naming rule for every field in a Golden structure — FMD, XREF and Rule alike.
 *
 * **ALL CAPS, no spaces.** These are technical identifiers, not labels: they become the column
 * headers of every generated document, the keys of every generated row, the anchor of every review
 * point, and the thing a diff compares one template version against another by. `Field Class` and
 * `FIELD_CLASS` are two different columns to all of that machinery, and nothing in the app can tell
 * that somebody meant them to be the same one — so a rename late in a programme silently detaches
 * every note and finding attached to the old spelling.
 *
 * Enforced by normalising AS YOU TYPE rather than by validating on save. A rule that only fires at
 * save tells you the name is wrong after you have written it, in a toast, with the cursor somewhere
 * else; normalising means the wrong name was never possible in the first place.
 *
 * Existing names are deliberately NOT rewritten on load. A field's name is its identity, so
 * silently correcting `Field Class` to `FIELD_CLASS` would re-key the column and detach the review
 * points, diffs and findings that hang off it — the exact harm the rule exists to prevent. The
 * designer flags them instead and leaves the decision, and the rename, to a person.
 */

/** Uppercases, turns separators into underscores, and drops anything that is not a legal identifier
 * character. Collapses runs of separators so `SRC  FIELD` does not become `SRC__FIELD`, but keeps a
 * trailing underscore the user has just typed — trimming it mid-word would fight the keyboard. */
export function normaliseStructureFieldName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s.\-/\\]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .replace(/_{2,}/g, '_');
}

/** Whether a name already follows the rule. Used to report, never to auto-correct. */
export const isConformingFieldName = (name: string): boolean =>
  name.length > 0 && name === normaliseStructureFieldName(name);

/** The non-conforming names in a structure, for the designer's notice. */
export const nonConformingFieldNames = (
  sections: { fields: { field: string }[] }[],
): string[] => [
  ...new Set(
    sections
      .flatMap((s) => s.fields.map((f) => f.field))
      .filter((f) => f.trim().length > 0 && !isConformingFieldName(f)),
  ),
];

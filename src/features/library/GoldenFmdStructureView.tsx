import { colorByKey } from '../../lib/goldenFmdColors';
import type { GoldenFmdStructure } from '../../types/entities';

/** Read-only rendering of a Golden FMD structure snapshot — used for both the current ("Table")
 * view and any past version selected from history.
 *
 * Presented as ONE list under coloured section bands, not as a table per section.
 *
 * Each section used to carry its own `Field | Description / Allowed Values` header, so a
 * four-section template drew four column headers and read as four unrelated tables stacked up.
 * The band already names the group, and with two columns of self-evident content there is nothing
 * for a header to disambiguate — it was pure repetition, and repetition is what made the rows hard
 * to follow.
 *
 * Fields are NUMBERED, continuing across sections. That is not decoration: this template defines
 * the column order of every FMD generated from it, so "field 12" is a real fact about the document
 * and the thing people cite when comparing a generated sheet against the template.
 *
 * An empty note renders as nothing rather than as an em dash. Most fields have none, and a column
 * of dashes is a column of noise pretending to be data. */
export function GoldenFmdStructureView({ structure }: { structure: GoldenFmdStructure }) {
  if (structure.sections.length === 0) {
    return <p className="text-sm2 text-muted px-3.5 py-8 text-center">No sections defined.</p>;
  }

  const total = structure.sections.reduce((n, s) => n + s.fields.length, 0);
  // Runs across the whole template, not per section — see above.
  let position = 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-2xs text-muted">
        {total} field{total === 1 ? '' : 's'} in {structure.sections.length} section
        {structure.sections.length === 1 ? '' : 's'}, in the order they appear in a generated
        Field Mapping.
      </p>

      <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
        {structure.sections.map((section) => {
          const color = colorByKey(section.color);
          return (
            <div key={section.id} className="border-b border-line last:border-b-0">
              <div
                className="px-3.5 py-2 flex items-baseline gap-2"
                style={{ backgroundColor: color.bg, borderLeft: `4px solid ${color.border}` }}
              >
                <span className="text-sm2 font-bold" style={{ color: color.text }}>{section.name}</span>
                <span className="text-2xs text-muted ml-auto">
                  {section.fields.length} field{section.fields.length === 1 ? '' : 's'}
                </span>
              </div>

              {section.fields.length === 0 ? (
                <p className="text-sm2 text-muted px-3.5 py-3">No fields in this section.</p>
              ) : (
                <div className="flex flex-col">
                  {section.fields.map((f) => {
                    position += 1;
                    return (
                      <div
                        key={f.id}
                        className="flex items-baseline gap-3 px-3.5 py-[7px] border-t border-line-soft first:border-t-0"
                      >
                        <span className="text-2xs text-muted tabular-nums w-6 shrink-0 text-right">
                          {position}
                        </span>
                        {/* Monospace because it is a technical identifier — the same rule every
                            field, table and version reference follows across the app. */}
                        <span className="font-mono text-sm2 text-text shrink-0">{f.field || '—'}</span>
                        {f.description && (
                          <span className="text-2xs text-muted min-w-0 flex-1">{f.description}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

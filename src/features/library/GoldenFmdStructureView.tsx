import { colorByKey } from '../../lib/goldenFmdColors';
import type { GoldenFmdStructure } from '../../types/entities';

/** Read-only rendering of a Golden FMD structure snapshot — used for both the current ("Table")
 * view and any past version selected from history. */
export function GoldenFmdStructureView({ structure }: { structure: GoldenFmdStructure }) {
  if (structure.sections.length === 0) {
    return <p className="text-sm2 text-muted px-3.5 py-8 text-center">No sections defined.</p>;
  }
  return (
    <div className="rounded-lg shadow-[inset_0_0_0_1px_var(--line)] overflow-hidden">
      {structure.sections.map((section) => {
        const color = colorByKey(section.color);
        return (
          <div key={section.id} className="border-b border-line last:border-b-0">
            <div className="px-3.5 py-2 flex items-center gap-2" style={{ backgroundColor: color.bg, borderLeft: `4px solid ${color.border}` }}>
              <span className="text-sm2 font-bold" style={{ color: color.text }}>{section.name}</span>
              <span className="text-2xs text-muted ml-auto">{section.fields.length} field{section.fields.length === 1 ? '' : 's'}</span>
            </div>
            {section.fields.length === 0 ? (
              <p className="text-sm2 text-muted px-3.5 py-3">No fields in this section.</p>
            ) : (
              <table className="w-full border-collapse text-sm2 table-fixed">
                <thead>
                  <tr>
                    <th className="w-[30%] text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface border-b border-line px-2.5 py-2 text-left">Field</th>
                    <th className="text-2xs font-bold uppercase tracking-[.04em] text-muted bg-surface border-b border-line px-2.5 py-2 text-left">Description / Allowed Values</th>
                  </tr>
                </thead>
                <tbody>
                  {section.fields.map((f) => (
                    <tr key={f.id} className="border-t border-line">
                      <td className="px-2.5 py-1.5 text-sm2 font-mono font-bold">{f.field || '—'}</td>
                      <td className="px-2.5 py-1.5 text-sm2 text-muted">{f.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

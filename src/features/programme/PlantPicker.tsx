import { useState } from 'react';
import { Check, Factory } from 'lucide-react';
import clsx from 'clsx';
import { ToolbarSearch } from '../../components/ToolbarSearch';
import type { PlantRow } from '../../lib/queries/plants';

/** Which plants a subproject covers, as a field.
 *
 * Lives inside the subproject form rather than behind its own menu action: the plants a wave covers
 * are part of what the wave IS, so they are decided when it is created, not afterwards in a second
 * dialog someone has to know to open. A separate action also meant a subproject could exist for
 * days with no site attached and nothing prompting for one.
 *
 * Multi-select because covering several sites is the normal case here, not an exception. */
export function PlantPicker({ plants, selected, onChange, disabled, takenInProject }: {
  /** Every plant in the system. Not narrowed by programme, because a plant belongs to none (0057) —
   * the same physical site is available to any wave that covers it. */
  plants: PlantRow[];
  selected: string[];
  onChange: (plantIds: string[]) => void;
  disabled?: boolean;
  /** plantId -> the subproject in THIS project that already covers it.
   *
   * A plant belongs to one subproject per project (migration 0062): two subprojects both covering
   * plant 1010 means two scopes, two sets of FMDs and two load plans for one physical site, with
   * nothing saying which actually runs. The database refuses it either way — this is so the refusal
   * arrives before the save rather than as an error afterwards, and so it can say WHERE the plant
   * already is instead of only that it is taken. */
  takenInProject?: Map<string, string>;
}) {
  const [query, setQuery] = useState('');

  const live = plants.filter((p) => !p.archivedAt);
  const q = query.trim().toLowerCase();
  const shown = q
    ? live.filter((p) => p.code.toLowerCase().includes(q)
      || p.name.toLowerCase().includes(q)
      || (p.city ?? '').toLowerCase().includes(q))
    : live;

  const toggle = (id: string) => onChange(
    selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
  );

  if (live.length === 0) {
    return (
      <p className="text-2xs text-muted flex items-start gap-1.5 rounded bg-surface-2 px-3 py-2.5">
        <Factory size={13} className="shrink-0 mt-px" />
        No plants exist in this program yet. Add them from Migration Project &rsaquo; Plant
        Maintenance, then come back to attach them.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {live.length > 8 && (
        <ToolbarSearch value={query} onChange={setQuery} placeholder="Search plants…" />
      )}

      <div className="flex flex-col gap-1 max-h-[190px] overflow-y-auto rounded border border-line p-1 bg-surface">
        {shown.map((p) => {
          const on = selected.includes(p.id);
          // Taken by a SIBLING subproject. Never by this one — a plant already selected here is
          // selected, not blocked, and reading its own assignment as a clash would make every
          // saved subproject impossible to reopen and save again.
          const takenBy = !on ? takenInProject?.get(p.id) : undefined;
          const blocked = !!takenBy;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled || blocked}
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              title={takenBy
                ? `Already covered by ${takenBy} in this project. A plant belongs to one subproject per project — remove it there first.`
                : undefined}
              className={clsx(
                'flex items-center gap-2.5 text-left rounded px-2 py-1.5 transition-colors',
                on ? 'bg-blue-pale' : !blocked && 'hover:bg-surface-2',
                (disabled || blocked) && 'opacity-50 cursor-not-allowed',
              )}
            >
              <span className={clsx(
                'w-4 h-4 rounded-xs grid place-items-center shrink-0 border',
                on ? 'bg-blue border-blue text-white' : 'border-line-strong',
              )}>
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="font-mono text-sm2 font-bold shrink-0 w-[58px]">{p.code}</span>
              <span className="min-w-0 flex-1 text-sm2 truncate">{p.name}</span>
              {/* Says WHERE it is taken, not merely that it is. "Unavailable" with no destination
                  sends someone hunting through every subproject in the project. */}
              {takenBy ? (
                <span className="text-2xs text-amber-ink shrink-0 truncate max-w-[120px]">in {takenBy}</span>
              ) : p.subprojectIds.length > 0 && (
                /* How widely this plant is already used ELSEWHERE — other projects, which is
                   allowed. Attaching a site four other waves cover is a different decision from
                   attaching a fresh one. */
                <span className="text-2xs text-muted shrink-0 tabular-nums">in {p.subprojectIds.length}</span>
              )}
            </button>
          );
        })}
        {shown.length === 0 && (
          <p className="text-2xs text-muted py-3 text-center">No plants match “{query}”.</p>
        )}
      </div>

      <p className="text-2xs text-muted">
        {selected.length === 0
          ? 'None selected — this subproject is not tied to a site.'
          : `${selected.length} of ${live.length} selected. Every plant here shares this subproject’s scope and Field Mappings.`}
      </p>
    </div>
  );
}

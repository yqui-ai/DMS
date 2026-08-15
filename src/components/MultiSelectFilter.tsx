import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Display-only transform for option/summary text — filtering still matches on the raw option value. */
  formatOption?: (opt: string) => string;
}

/** Dropdown with checkboxes — sorts `options` alphabetically (by display label), stays open
 * across toggles so several values can be picked, closes on an outside click or the trigger
 * being clicked again. */
export function MultiSelectFilter({ label, options, selected, onChange, formatOption }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const display = formatOption ?? ((opt: string) => opt);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const sorted = [...options].sort((a, b) => display(a).localeCompare(display(b)));
  const toggle = (opt: string) => onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);

  const summary = selected.length === 0 ? `${label}: All` : selected.length === 1 ? display(selected[0]) : `${label}: ${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-[8px] border max-w-[220px]',
          selected.length > 0 ? 'border-blue text-blue bg-blue-pale font-semibold' : 'border-[#d6dbe2] bg-surface text-text',
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 min-w-[220px] max-h-72 overflow-auto bg-surface rounded-[8px] shadow-cardHover py-1.5 z-20">
          {selected.length > 0 && (
            <button onClick={() => onChange([])} className="w-full text-left px-3 py-1.5 text-xs font-semibold text-blue hover:bg-blue-pale">
              Clear selection
            </button>
          )}
          {sorted.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-blue-pale cursor-pointer">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="w-3.5 h-3.5 accent-[var(--blue)] shrink-0" />
              <span className="truncate">{display(opt)}</span>
            </label>
          ))}
          {sorted.length === 0 && <div className="px-3 py-1.5 text-sm text-muted">No options.</div>}
        </div>
      )}
    </div>
  );
}

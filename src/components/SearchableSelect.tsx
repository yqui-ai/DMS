import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import clsx from 'clsx';

export interface SearchableSelectOption { value: string; label: string; sublabel?: string }

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}

/** Single-select combobox with a search box inside the dropdown — for fields backed by a long
 * option list (hundreds of migration objects, say) where a plain `<select>` makes finding the
 * right one tedious. Matches on both label and sublabel. */
export function SearchableSelect({ value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Search…', className }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (open) { setQuery(''); requestAnimationFrame(() => searchRef.current?.focus()); }
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className={clsx('relative', className)} ref={ref}>
      <button
        type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-base bg-surface border border-[#d6dbe2] rounded-[8px] px-[11px] py-2 min-h-[38px] text-left"
      >
        <span className={clsx('flex-1 min-w-0 truncate', !selected && 'text-muted')}>{selected ? selected.label : placeholder}</span>
        {selected && (
          <span onClick={(e) => { e.stopPropagation(); onChange(''); }} className="text-muted hover:text-red shrink-0">
            <X size={14} />
          </span>
        )}
        <ChevronDown size={14} className="text-muted shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-surface rounded-[8px] shadow-cardHover z-20 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line shrink-0">
            <Search size={14} className="text-muted shrink-0" />
            <input
              ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder}
              className="flex-1 min-w-0 text-sm2 bg-transparent focus-visible:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {filtered.map((o) => (
              <button
                key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                className={clsx('w-full text-left px-3 py-2 text-sm2 hover:bg-blue-pale', o.value === value && 'bg-blue-light font-semibold')}
              >
                <div className="truncate">{o.label}</div>
                {o.sublabel && <div className="text-2xs text-muted truncate">{o.sublabel}</div>}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-3 text-sm text-muted text-center">No matches.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

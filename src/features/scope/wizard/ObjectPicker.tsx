import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { useDismiss } from '../../../components/useDismiss';
import type { MigrationObject } from '../../../types/entities';

/** How many matches are rendered at once. A search that matches everything should still cost the
 * same as one that matches ten things. */
const MAX_RENDERED = 60;

/** Picks one SAP migration object out of the catalogue.
 *
 * A native `<select>` cannot do this job. The catalogue is 331 objects, so mapping was a scroll
 * through an unsearchable list where `SIF_CUSTOMER_2` and `SIF_CUSTOMER_MASTER_2` sit next to each
 * other — and one `<select>` per row meant thousands of `<option>` elements in the document for a
 * screen where at most one dropdown is open. Type-ahead makes the choice, and only the open picker
 * renders rows.
 *
 * Search covers the ident and the description, because people arrive with either: "SIF_VENDOR_2"
 * from a spec, or "vendor" from the business. */
export function ObjectPicker({ objects, value, onChange, disabled, label }: {
  objects: MigrationObject[];
  value?: string;
  onChange: (objectId: string | null) => void;
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useDismiss<HTMLDivElement>(open, () => { setOpen(false); setQuery(''); });

  const selected = useMemo(() => objects.find((o) => o.id === value), [objects, value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return objects.slice(0, MAX_RENDERED);
    const hits = objects.filter((o) => (
      o.objectId.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q)
    ));
    // An exact ident match sorts first — typing a full ident and getting it third is the one case
    // where a search feels broken.
    hits.sort((a, b) => {
      const aExact = a.objectId.toLowerCase() === q ? 0 : 1;
      const bExact = b.objectId.toLowerCase() === q ? 0 : 1;
      return aExact - bExact || a.objectId.localeCompare(b.objectId);
    });
    return hits.slice(0, MAX_RENDERED);
  }, [objects, query]);

  const total = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return objects.length;
    return objects.filter((o) => (
      o.objectId.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q)
    )).length;
  }, [objects, query]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const choose = (o: MigrationObject) => {
    onChange(o.id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = matches[active]; if (o) choose(o); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className={clsx(
          'w-full flex items-center gap-2 rounded border px-2.5 h-7 text-left transition-colors',
          disabled ? 'bg-surface-2 text-muted cursor-not-allowed border-line' : 'bg-surface border-line hover:border-line-strong',
        )}
      >
        {selected ? (
          <>
            <span className="text-sm2 font-mono font-semibold text-text shrink-0">{selected.objectId}</span>
            {selected.description && (
              <span className="text-2xs text-muted truncate">{selected.description}</span>
            )}
          </>
        ) : (
          <span className="text-sm2 text-muted">Not mapped yet…</span>
        )}
        <ChevronDown size={13} className="text-muted shrink-0 ml-auto" />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded bg-surface shadow-cardHover border border-line overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-line-soft">
            <Search size={13} className="text-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search ident or description…"
              className="flex-1 min-w-0 bg-transparent text-sm2 text-text outline-none placeholder:text-muted"
            />
            {value && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); setQuery(''); }}
                title="Clear the mapping"
                className="text-2xs text-muted hover:text-text flex items-center gap-1 shrink-0"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>

          <div className="max-h-[240px] overflow-y-auto">
            {matches.length === 0 ? (
              <p className="text-2xs text-muted px-3 py-4 text-center">No object matches that.</p>
            ) : matches.map((o, i) => (
              <button
                key={o.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={clsx(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 text-left',
                  i === active && 'bg-blue-pale',
                )}
              >
                <span className="text-sm2 font-mono font-semibold text-text shrink-0">{o.objectId}</span>
                <span className="text-2xs text-muted truncate flex-1">{o.description ?? '—'}</span>
                {o.id === value && <Check size={13} className="text-blue shrink-0" />}
              </button>
            ))}
          </div>

          {total > matches.length && (
            <p className="text-2xs text-muted px-3 py-1.5 border-t border-line-soft">
              Showing {matches.length} of {total} — keep typing to narrow it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

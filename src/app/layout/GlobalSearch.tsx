import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import clsx from 'clsx';
import { MIN_QUERY, useSearchResults } from '../../lib/search';
import { useDismiss } from '../../components/useDismiss';

/** Search across everything the user can reach, grouped by what kind of record each hit is.
 *
 * The header used to carry a search input with no `onChange` — decorative markup that taught people
 * the chrome couldn't be trusted. This one works, over the same TanStack caches the catalogues
 * already fill, so a hit opens instantly and nothing is visible here that RLS wouldn't have shown
 * on the screen it links to.
 *
 * A shortcut, not a report: five hits per category, with everything else one Enter away on the
 * search page. Both read `useSearchResults`, so the dropdown can never disagree with the page. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  /** Latches on first focus, and gates the four catalogue queries behind it — they shouldn't load
   * on every page to power a box most visits never touch. Once warm they stay warm. */
  const [loaded, setLoaded] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useSearchResults(query, { limit: 5, enabled: loaded });
  /** Groups render as sections but the keyboard walks one list, so both read the same order. */
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  const hidden = groups.reduce((n, g) => n + g.overflow, 0);

  useEffect(() => { setCursor(0); }, [query]);

  const dismiss = () => { setOpen(false); setQuery(''); inputRef.current?.blur(); };
  const go = (to: string) => { navigate(to); dismiss(); };
  const seeAll = () => go(`/search?q=${encodeURIComponent(query.trim())}`);

  // Outside-click and Escape come from the shared hook; `dismiss` also clears the query and blurs,
  // which is what makes Escape leave the search properly closed rather than closed-but-focused.
  const boxRef = useDismiss<HTMLDivElement>(open, dismiss);

  useEffect(() => {
    // The shortcut is what makes a header search worth reaching for at all.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setLoaded(true);
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const showPanel = open && query.trim().length >= MIN_QUERY;

  return (
    <div ref={boxRef} className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        ref={inputRef}
        value={query}
        onFocus={() => { setLoaded(true); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
          if (!showPanel) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % Math.max(1, flat.length)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + flat.length) % Math.max(1, flat.length)); }
          if (e.key === 'Enter') {
            e.preventDefault();
            // Enter on a highlighted hit opens it; Enter with nothing highlighted means
            // "show me everything", which is the page.
            if (flat[cursor]) go(flat[cursor].to); else seeAll();
          }
        }}
        placeholder="Search…"
        aria-label="Search everything"
        // Quiet until focused or filled, like ToolbarSearch — the header is chrome, and a permanent
        // border here would make the whole strip read as a form.
        className={clsx(
          'text-sm2 pl-8 pr-3 py-1.5 rounded border bg-transparent w-56 focus:w-72 transition-[width]',
          query ? 'border-line-strong bg-surface' : 'border-transparent hover:bg-surface-2 focus:bg-surface focus:border-line-strong',
        )}
      />
      {showPanel && (
        <div className="absolute right-0 mt-1 w-[420px] max-h-[70vh] overflow-auto bg-surface text-text rounded shadow-cardHover py-1.5 z-30">
          {flat.length === 0 ? (
            <p className="px-3.5 py-6 text-sm2 text-muted text-center">Nothing matches “{query.trim()}”.</p>
          ) : (
            <>
              {groups.map((g) => {
                const Icon = g.icon;
                return (
                  <div key={g.key} className="mb-1 last:mb-0">
                    <div className="px-3.5 py-1 text-2xs font-bold uppercase tracking-[.05em] text-muted flex items-center gap-1.5">
                      <Icon size={12} /> {g.label}
                    </div>
                    {g.hits.map((h) => {
                      const index = flat.indexOf(h);
                      return (
                        <button
                          key={h.id}
                          onClick={() => go(h.to)}
                          onMouseEnter={() => setCursor(index)}
                          className={clsx(
                            'w-full text-left px-3.5 py-1.5 flex flex-col',
                            index === cursor ? 'bg-blue-light' : 'hover:bg-blue-pale',
                          )}
                        >
                          <span className="text-sm2 font-semibold truncate">{h.title}</span>
                          {h.subtitle && <span className="text-2xs text-muted truncate">{h.subtitle}</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              <button
                onClick={seeAll}
                className="w-full text-left px-3.5 py-2 mt-1 border-t border-line text-2xs font-semibold text-blue hover:bg-blue-pale"
              >
                {hidden > 0 ? `See all results — ${hidden} more not shown` : 'See all results'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

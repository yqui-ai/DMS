import { Search } from 'lucide-react';
import clsx from 'clsx';

/** Search box matching the Migration Object catalogue toolbar — same height as Button size="sm" / MultiSelectFilter. */
export function ToolbarSearch({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (next: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        // Quiet until focused or filled, matching MultiSelectFilter — the search box is the widest
        // thing in the toolbar, so a permanent border made every list screen read as chrome-first.
        className={clsx(
          'text-sm2 pl-8 pr-3 py-1.5 rounded border bg-transparent min-w-[260px]',
          'focus:bg-surface focus:border-line-strong',
          value ? 'border-line-strong bg-surface' : 'border-transparent hover:bg-surface-2',
        )}
      />
    </div>
  );
}

import { Search } from 'lucide-react';

/** Search box matching the Migration Object catalogue toolbar — same height as ToolbarButton/MultiSelectFilter. */
export function ToolbarSearch({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (next: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="text-sm pl-8 pr-3 py-1.5 rounded-[8px] border border-[#d6dbe2] bg-surface min-w-[260px]"
      />
    </div>
  );
}

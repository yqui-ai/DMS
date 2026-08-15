import { Settings } from 'lucide-react';
import clsx from 'clsx';

/** "Golden" action button for a Library catalogue toolbar — always the rightmost action. When
 * `active` is provided it behaves as a filter toggle (Rule/XREF: show only Global rows); when
 * omitted it renders as a plain action button (FMD: opens the Golden FMD Designer). */
export function GoldenToggle({ active, onClick, label }: { active?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-[8px] border transition-all',
        active
          ? 'bg-amber text-white border-amber'
          : 'bg-surface text-text border-[#e2e5ea] shadow-[0_1px_2px_rgba(22,28,40,.04)] hover:text-blue hover:border-blue-mid/40',
      )}
    >
      <Settings size={14} /> {label}
    </button>
  );
}

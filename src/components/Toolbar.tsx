import type { ReactNode } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { Button } from './Button';
import { ToolbarSearch } from './ToolbarSearch';

/** The action row that sits between a screen's `PageHeader` and its list.
 *
 * Every list screen had hand-rolled this: the same wrapper classes, the same conditional
 * "Clear filters" button, the same `ml-1 shrink-0` muted count, the same `ml-auto` action group.
 * Copies drifted — three screens rebuilt the search input inline instead of using `ToolbarSearch`
 * (so it kept a permanent border the shared one had already dropped), and the ones that filtered
 * without a Clear filters button left no way out of an over-narrowed list.
 *
 * The order of the row is fixed here rather than left to each caller, because the order IS the
 * convention: search, then filters, then the escape hatch, then how many rows survived, then what
 * you can do with them. `search` is a config object rather than a slot for exactly that reason —
 * a caller can't put something else first, and can't hand-roll the input. */
export function Toolbar({ search, children, onClearFilters, count, noun, selectedCount = 0, actions, spacing = 'below' }: {
  /** Renders the shared `ToolbarSearch`. Omit for a screen that filters without free-text search. */
  search?: { value: string; onChange: (next: string) => void; placeholder?: string };
  /** The filters — `MultiSelectFilter`s, and a grouping `Select` last if the screen has one. */
  children?: ReactNode;
  /** Pass `hasActiveFilters ? clearFilters : undefined`. The button appears only when there is
   * something to clear, so it never reads as a permanent control. */
  onClearFilters?: () => void;
  /** Rows after filtering. Formatted here so every screen gets the same thousands separator. */
  count?: number;
  /** Plural, lower case — "FMDs", "objects", "rules". Required alongside `count`. */
  noun?: string;
  /** Appends " · N selected" when non-zero. */
  selectedCount?: number;
  /** Right-aligned. `variant="quiet"` buttons first, `variant="ai"` last. */
  actions?: ReactNode;
  /** `'none'` when the parent is a flex column with its own `gap` and would double the spacing. */
  spacing?: 'below' | 'none';
}) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-2', spacing === 'below' && 'mb-3')}>
      {search && <ToolbarSearch value={search.value} onChange={search.onChange} placeholder={search.placeholder} />}
      {children}
      {onClearFilters && (
        <Button variant="dangerGhost" size="sm" onClick={onClearFilters}>
          <X size={13} /> Clear filters
        </Button>
      )}
      {count !== undefined && noun && (
        <span className="text-sm2 text-muted ml-1 shrink-0">
          {count.toLocaleString()} {noun}{selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
        </span>
      )}
      {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

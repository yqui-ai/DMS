import { X } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

/** The empty state for a filtered list — which is two different situations that were being shown
 * the same message.
 *
 * "Nothing exists yet" and "your filters excluded everything" need opposite responses: the first
 * invites you to create something, the second to widen the search. Showing the create-prompt to
 * someone who just typed a search term tells them the catalogue is empty when it isn't, and offers
 * the wrong remedy. Migration Object has six filters plus search, so filtering to nothing there is
 * routine rather than exceptional.
 *
 * Both screens already compute `hasActiveFilters` for their Clear filters button; this just makes
 * the empty state consult it. */
export function ListEmptyState({ noun, filtered, description, onClearFilters }: {
  /** Plural noun for the records, lower case — "FMDs", "objects", "rules". */
  noun: string;
  /** True when search/filters are narrowing the list, i.e. the emptiness is self-inflicted. */
  filtered: boolean;
  /** Shown only in the genuinely-empty case: what would appear here and how it gets created. */
  description?: string;
  onClearFilters: () => void;
}) {
  if (filtered) {
    return (
      <EmptyState
        title={`No ${noun} match these filters`}
        description="Nothing here fits the current search and filters — the list itself isn't empty."
        action={
          <Button variant="quiet" size="sm" onClick={onClearFilters}>
            <X size={13} /> Clear filters
          </Button>
        }
      />
    );
  }
  return <EmptyState title={`No ${noun} yet`} description={description} />;
}

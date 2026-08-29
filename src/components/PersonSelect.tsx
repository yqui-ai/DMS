import { Select } from './Select';
import type { AssignablePerson } from '../lib/queries/people';

/** Picks a person from a scoped list instead of typing their name.
 *
 * Every person-shaped field in this app was a free-text input, so the same colleague could be
 * "A. Cruz", "Ana Cruz" and "acruz@…" across three records and nothing could group them. The value
 * stored is still the person's NAME rather than their id — `programs.owner`, `subproject_objects.
 * consultant` and the rest are `text` columns, and changing that is a migration for another day.
 * What this fixes is the typing, which is where the variants came from.
 *
 * A value that is not in the list is kept and shown as such rather than silently dropped: rows
 * written before this existed hold names that may match nobody, and quietly blanking someone's
 * assignment because their account was never created is worse than showing it. */
export function PersonSelect({ value, onChange, people, loading, id, placeholder = 'Unassigned', emptyHint }: {
  value?: string;
  onChange: (next: string) => void;
  people: AssignablePerson[];
  loading?: boolean;
  id?: string;
  placeholder?: string;
  /** Shown when the scope has nobody in it — explains why the list is empty and what to do. */
  emptyHint?: string;
}) {
  const names = people.map((p) => p.name);
  const orphaned = !!value && !names.includes(value);

  return (
    <>
      <Select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
      >
        <option value="">{loading ? 'Loading…' : placeholder}</option>
        {orphaned && <option value={value}>{value} — not in this scope</option>}
        {people.map((p) => (
          <option key={p.userId} value={p.name}>
            {p.name}{p.email ? ` · ${p.email}` : ''}
          </option>
        ))}
      </Select>
      {!loading && people.length === 0 && emptyHint && (
        <p className="mt-1 text-2xs text-muted">{emptyHint}</p>
      )}
    </>
  );
}

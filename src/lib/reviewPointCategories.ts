import type { TagVariant } from '../components/Tag';

/** The review-point vocabulary, in one place so the composer, the lists, and the counts can't
 * drift apart. Must stay in sync with the CHECK constraint in
 * supabase/migrations/0028_review_point_categories.sql — adding a value here without a migration
 * makes every post of that value fail at the database. */
export const REVIEW_POINT_CATEGORIES = [
  {
    key: 'todo', label: 'To do', variant: 'warn',
    /** Actionable = outstanding work, so it counts toward the "open" badge. */
    actionable: true,
    hint: 'Something needs changing or answering',
  },
  { key: 'issue', label: 'Issue', variant: 'danger', actionable: true, hint: 'Something is wrong and blocks sign-off' },
  { key: 'remark', label: 'Remark', variant: 'neutral', actionable: false, hint: 'Context or a decision worth recording' },
] as const satisfies readonly { key: string; label: string; variant: TagVariant; actionable: boolean; hint: string }[];

const BY_KEY = new Map(REVIEW_POINT_CATEGORIES.map((c) => [c.key as string, c]));
/** Retired categories, folded into the three that remain. Five was too many to choose between —
 * people reach for whichever is first rather than thinking, which makes the category meaningless.
 * 'question' was really a to-do addressed to someone else; 'decision' was a remark that happens to
 * be final. Existing rows keep rendering through this map rather than needing a data migration. */
const LEGACY_KEYS: Record<string, string> = { question: 'todo', decision: 'remark', note: 'remark' };

/** Falls back to 'remark' styling for an unrecognised value rather than throwing — a row written by
 * a newer version of the app should still render, just without its own colour. */
export const reviewPointCategory = (key: string) =>
  BY_KEY.get(key) ?? BY_KEY.get(LEGACY_KEYS[key]) ?? BY_KEY.get('remark')!;

export const isActionable = (key: string) => reviewPointCategory(key).actionable;

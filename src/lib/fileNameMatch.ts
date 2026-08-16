/** Strips common "this is a revision, not a new document" suffixes — _v2, -v1.3, _final, _copy,
 * (1), a trailing date — so "X_field_mapping_v2" and "X_field_mapping" normalize to the same base.
 * Deterministic, so an obvious versioned rename is caught reliably without depending on an AI call
 * (which is reserved for genuinely dissimilar-looking names that might still be the same source). */
function stripRevisionSuffix(name: string): string {
  // No leading \b before the separator-consuming [_\-\s]* — an underscore and the letter right
  // after it are both "word" characters, so \b never actually matches at that boundary (this is
  // exactly the case that mattered: "..._v2" needs the "_v2" stripped, and \b would silently fail
  // to match there, leaving the suffix in place).
  return name
    .replace(/[_\-\s]+\(?v(?:ersion)?[.\s_-]?\d+(?:\.\d+)*\)?$/i, '')
    .replace(/[_\-\s]+final$/i, '')
    .replace(/[_\-\s]+copy$/i, '')
    .replace(/[_\-\s]*\(\d+\)$/, '')
    .replace(/[_\-\s]+\d{4}[-_]?\d{2}[-_]?\d{2}$/, '')
    .trim();
}

/** Exact match after normalizing away revision suffixes — a "certain" match. Null if nothing lines
 * up, leaving it to the fuzzier token-overlap check below. */
export function findDeterministicSourceMatch(newName: string, candidates: string[]): string | null {
  const target = stripRevisionSuffix(newName).toLowerCase();
  return candidates.find((c) => stripRevisionSuffix(c).toLowerCase() === target) ?? null;
}

function tokenize(name: string): Set<string> {
  return new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

/** Jaccard similarity of the two names' token sets (split on any run of non-alphanumerics) — 0 for
 * nothing shared, 1 for identical token sets. Catches renames the suffix-stripper can't, e.g. a
 * changed separator style ("BO-456-1_..." vs "BO4561_...") or a reordered/reworded filename that
 * still shares most of its meaningful tokens. */
function tokenSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared += 1;
  const union = new Set([...setA, ...setB]).size;
  return shared / union;
}

/** Fuzzy, entirely deterministic fallback for renames the exact/suffix-stripped check misses — no
 * AI call, so it can't silently fail to fire the way an Edge Function round-trip can. `certain`
 * (score >= 0.85) is high enough confidence to auto-apply (with a dismiss option); anything from
 * 0.45 up is offered as a suggestion the user must explicitly confirm. Below 0.45, too many
 * plausible false positives among unrelated real-world FMD filenames to even suggest it. */
export function findFuzzySourceMatch(newName: string, candidates: string[]): { name: string; score: number; certain: boolean } | null {
  let best: { name: string; score: number } | null = null;
  for (const c of candidates) {
    const score = tokenSimilarity(newName, c);
    if (!best || score > best.score) best = { name: c, score };
  }
  if (!best || best.score < 0.45) return null;
  return { name: best.name, score: best.score, certain: best.score >= 0.85 };
}

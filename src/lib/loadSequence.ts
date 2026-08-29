import type { ScopeDependency } from './queries/scope';

export interface SequenceViolation {
  objectId: string;
  requiresId: string;
  mandatory: boolean;
  /** 1-based positions as currently ordered, for a message that names the problem concretely. */
  at: number;
  requiresAt: number;
}

/** Objects ordered before something they require.
 *
 * A load sequence exists to answer one question — what has to run first — and the answer was never
 * checked against the dependency graph the app already stores. An object scheduled ahead of its
 * prerequisite is a run that fails at execution time, hours into a cutover rehearsal, for a reason
 * that was knowable while someone was clicking arrows in Scope.
 *
 * Both directions of "wrong" count: strictly before, and the same position. */
export function findSequenceViolations(
  order: string[],
  dependencies: ScopeDependency[],
): SequenceViolation[] {
  const positionOf = new Map(order.map((id, i) => [id, i]));
  const out: SequenceViolation[] = [];
  for (const dep of dependencies) {
    const at = positionOf.get(dep.objectId);
    const requiresAt = positionOf.get(dep.requiresId);
    // An edge to something not in this ordering isn't a sequencing problem — it's a scope problem,
    // and useMissingPrerequisites is what reports it.
    if (at === undefined || requiresAt === undefined) continue;
    if (requiresAt < at) continue;
    out.push({ objectId: dep.objectId, requiresId: dep.requiresId, mandatory: dep.mandatory, at: at + 1, requiresAt: requiresAt + 1 });
  }
  return out;
}

export interface AutoSequenceResult {
  /** The proposed order, prerequisites first. */
  order: string[];
  /** Objects the graph couldn't order because they depend on each other, left at the end in their
   * previous relative order. A cycle is a data problem the app can't resolve by sorting. */
  cyclic: string[];
}

/** Orders objects so every prerequisite comes before what needs it.
 *
 * Kahn's algorithm, with the CURRENT order as the tie-break rather than an arbitrary one. That
 * matters more than it sounds: a topological sort has many valid answers, and picking a different
 * one each run would reshuffle rows nobody asked to move. Ties broken by existing position mean the
 * result is stable, and re-running it on an already-valid order changes nothing.
 *
 * A cycle can't be sorted. Rather than silently dropping those objects or looping, they come back
 * in `cyclic` so the screen can say which ones and why. */
export function autoSequence(order: string[], dependencies: ScopeDependency[]): AutoSequenceResult {
  const rank = new Map(order.map((id, i) => [id, i]));
  const inScope = new Set(order);

  /** requires -> the objects waiting on it. */
  const dependents = new Map<string, string[]>();
  const remaining = new Map<string, number>(order.map((id) => [id, 0]));
  for (const dep of dependencies) {
    if (!inScope.has(dep.objectId) || !inScope.has(dep.requiresId)) continue;
    dependents.set(dep.requiresId, [...(dependents.get(dep.requiresId) ?? []), dep.objectId]);
    remaining.set(dep.objectId, (remaining.get(dep.objectId) ?? 0) + 1);
  }

  const byRank = (a: string, b: string) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
  const ready = order.filter((id) => (remaining.get(id) ?? 0) === 0).sort(byRank);
  const result: string[] = [];

  while (ready.length > 0) {
    const next = ready.shift()!;
    result.push(next);
    for (const dependent of dependents.get(next) ?? []) {
      const left = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, left);
      if (left === 0) {
        ready.push(dependent);
        // Re-sorted on every insert so the tie-break stays "earliest in the current order",
        // not "whichever prerequisite happened to finish first".
        ready.sort(byRank);
      }
    }
  }

  const cyclic = order.filter((id) => !result.includes(id));
  return { order: [...result, ...cyclic], cyclic };
}

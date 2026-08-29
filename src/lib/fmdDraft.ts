import type { FmdDraft, FmdPendingChange, FmdVersion, GeneratedTable, MappingReview } from '../types/entities';

/* The draft/version model, with no database in it.
 *
 * Everything here derives one shape from another: what number a draft publishes under, what a
 * draft looks like on screen, what an inherited review says. It lived in `queries/fmds.ts`, which
 * imports the Supabase client — so none of it could be tested without a live connection, and the
 * rules most worth pinning down were the ones hardest to reach. */

/** What an unpublished editing draft carries in `fmd_versions.version`.
 *
 * A draft is a staging area, not a version: it collects edits until someone decides to release
 * them. Numbering it at the first keystroke made a new version appear the moment anyone touched a
 * cell, and pinned the number before it was known to be right — publish anything else in between
 * and the draft would be released under a number that no longer followed. The number is allocated
 * at publish instead, by `nextPublishedVersion`.
 *
 * `unique (fmd_id, version)` therefore also enforces at most one editing draft per FMD, for free. */
export const DRAFT_VERSION = 'Draft';

/** Bumps the patch segment of a 'vMAJOR.MINOR.PATCH' version string; falls back to 'v1.0.1' for
 * anything that doesn't match (shouldn't happen — every version is app-generated). */
export const bumpVersion = (version: string): string => {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) return 'v1.0.1';
  return `v${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
};

/** The number a draft is released under. Generated and converted FMDs arrive already numbered
 * and keep what they have — there is nothing to bump from on a first release. Everything else is
 * an editing draft, which takes the next number after whatever is published right now.
 *
 * Used by both `usePublishFmdVersion` and the Draft tab, so the number offered before publishing
 * is by construction the number that gets written. */
const SEMVER = /^v(\d+)\.(\d+)\.(\d+)$/;

/** Highest vX.Y.Z among the given versions, ignoring anything that isn't one (a draft label, or a
 * hand-typed value from an imported FMD). */
const highestVersion = (versions: { version: string }[]): string | undefined => {
  const parsed = versions
    .map((v) => ({ v: v.version, m: SEMVER.exec(v.version) }))
    .filter((x): x is { v: string; m: RegExpExecArray } => !!x.m)
    .sort((a, b) =>
      Number(a.m[1]) - Number(b.m[1]) || Number(a.m[2]) - Number(b.m[2]) || Number(a.m[3]) - Number(b.m[3]));
  return parsed.pop()?.v;
};

/** The number a draft is released under.
 *
 * Bumped from the HIGHEST existing version, not from the newest published one. Those differ whenever
 * an unpublished version sits above the live one — a generation, or a sync that was never released
 * — and bumping from the published version then produces a number that already exists, which
 * `unique (fmd_id, version)` rejects outright. The symptom is a publish that simply fails on an FMD
 * whose history has a gap in it.
 *
 * Generated and converted FMDs arrive already numbered and keep what they have; there is nothing to
 * bump from on a first release. */
export const nextPublishedVersion = (
  draft: { version: string },
  versions: { version: string }[],
): string => {
  if (draft.version !== DRAFT_VERSION) return draft.version;
  const highest = highestVersion(versions);
  return highest ? bumpVersion(highest) : 'v1.0.0';
};

/** Id of the synthetic version that represents "the draft". Not a database row — see FmdDraft.
 * Anything comparing against a real version id must therefore tolerate this value. */
export const DRAFT_VERSION_ID = 'draft';

/** Applies pending changes onto mapping tables. Used to derive what a draft looks like on screen
 * and, at publish, to produce the released content — the same function both times, so what you
 * reviewed is what gets written. */
export const applyPendingChanges = (tables: GeneratedTable[], changes: FmdPendingChange[]): GeneratedTable[] =>
  tables.map((t) => {
    const mine = changes.filter((c) => c.structureId === t.structureId);
    if (!mine.length) return t;
    return {
      ...t,
      rows: t.rows.map((r, i) => {
        const hits = mine.filter((c) => c.rowIndex === i);
        return hits.length ? hits.reduce((acc, c) => ({ ...acc, [c.field]: c.to }), r) : r;
      }),
    };
  });

/** The draft as a version-shaped object, so every view that renders a version can render the draft
 * without knowing it isn't one. Derived on read — nothing of this shape is ever stored. */
export const draftOverlayVersion = (base: FmdVersion, draft: FmdDraft): FmdVersion => {
  const last = draft.pendingChanges[draft.pendingChanges.length - 1];
  return {
    ...base,
    id: DRAFT_VERSION_ID,
    version: DRAFT_VERSION,
    state: 'Draft',
    publishedBy: undefined, publishedAt: undefined,
    // Attribution belongs to whoever made the edits, not to whoever published the version they
    // sit on top of.
    createdBy: draft.pendingChanges[0]?.by ?? base.createdBy,
    createdAt: draft.pendingChanges[0]?.at ?? base.createdAt,
    changedBy: last?.by, changedAt: last?.at,
    comment: `${draft.pendingChanges.length} unpublished change${draft.pendingChanges.length === 1 ? '' : 's'} on top of ${base.version}`,
    sheets: {
      ...base.sheets,
      // Reviews assessed the PUBLISHED content, so they are carried across LABELLED — every run
      // stamped with the version it actually ran against, and every finding whose cell has since
      // been edited marked as such. Blanking them (which this used to do) was honest but useless:
      // the list of what the AI flagged is exactly what you work from while fixing it, and losing
      // it at the moment you start editing is losing it when it matters.
      mappingReview: inheritReview(base.sheets.mappingReview, base, draft),
      mappingReviews: base.sheets.mappingReviews?.map((r) => inheritReview(r, base, draft)!),
      generatedTables: applyPendingChanges(base.sheets.generatedTables ?? [], draft.pendingChanges),
      pendingChanges: draft.pendingChanges,
      // The BASE's change log is the published version's history, not this draft's. Spreading
      // `base.sheets` carried it in, so a fresh draft on top of v1.0.0 opened showing v1.0.0's nine
      // edits under "Already in this version" — history from a released version presented as part
      // of the unreleased work sitting on it, and it survived every publish because each new draft
      // inherited it again. A draft's own history is `pendingChanges`; a version's is its log.
      changeLog: undefined,
    },
  };
};

/** Re-stamps one review as inherited by a draft, and marks the findings whose cell the draft has
 * since edited.
 *
 * A finding pins `structureId + rowIndex + field`, and a pending change carries exactly those three
 * — drafts only ever change cell values, never add or remove rows — so the match is exact rather
 * than a guess. A finding with no `field` (a batch-level failure) pins nothing, so nothing can mark
 * it edited. */
const inheritReview = (
  review: MappingReview | undefined,
  base: FmdVersion,
  draft: FmdDraft,
): MappingReview | undefined => {
  if (!review) return undefined;
  const edited = new Set(draft.pendingChanges.map((c) => `${c.structureId}::${c.rowIndex}::${c.field}`));
  return {
    ...review,
    inheritedFrom: { versionId: base.id, version: base.version },
    findings: review.findings.map((f) => (
      f.field && edited.has(`${f.structureId}::${f.rowIndex}::${f.field}`)
        ? { ...f, editedInDraft: true }
        : f
    )),
  };
};

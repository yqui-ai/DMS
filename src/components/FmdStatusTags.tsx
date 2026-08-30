import clsx from 'clsx';
import { Tag } from './Tag';
import { isFmdSeen } from '../lib/fmdSeen';

/** The subset of an FMD row these badges read.
 *
 * Deliberately structural rather than importing `LibraryFmdRow`: this lives in `components/`, and a
 * shared presentational component should not drag the query layer in behind it. `LibraryFmdRow` is
 * assignable to this as-is, so callers pass their row straight through. */
export interface FmdStatusFields {
  id: string;
  activeVersion?: string;
  activePublishedAt?: string;
  latestVersion?: string;
  latestVersionId?: string;
  latestState?: string;
  hasDraft?: boolean;
  createdAt?: string;
  changedAt?: string;
  goldenOutdated?: boolean;
  standardRefOutdated?: boolean;
}

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

const isRecent = (at?: string) => !!at && Date.now() - new Date(at).getTime() < NEW_WINDOW_MS;

/** The FMD itself is new — it has never had a second version, so there is nothing to call a "new
 * version" of. `changedAt` is only populated once a second version exists, which is exactly the
 * test for "this is still the original". "New" also clears as soon as the row is opened, rather
 * than sitting until the window expires. */
export const isNewFmd = (f: FmdStatusFields) =>
  !f.changedAt && isRecent(f.createdAt) && !isFmdSeen(f.id, f.latestVersionId);

/** A later version of an existing FMD went live recently. Mutually exclusive with `isNewFmd` by
 * construction — an FMD that has never changed can't have published a *new* version — so a row
 * never carries both flags. */
export const isNewVersion = (f: FmdStatusFields) =>
  !!f.changedAt && isRecent(f.activePublishedAt);

/** Behind the template it was generated from — either the Golden FMD or, for a Custom, the
 * object's Standard FMD. Both mean the same thing to a reader ("this needs re-syncing"), so they
 * collapse to one flag; `fmdOutdatedReason` carries which for the tooltip. */
export const isFmdOutdated = (f: FmdStatusFields) => !!(f.goldenOutdated || f.standardRefOutdated);

export const fmdOutdatedReason = (f: FmdStatusFields) =>
  (f.goldenOutdated ? 'Behind the Golden FMD template' : "Behind the object's Standard FMD");

/** Sort key for a Status column: most-actionable first, so sorting on it groups the rows that need
 * work at one end. A row can be several of these at once — outdated AND drafting — and takes the
 * most urgent rank it qualifies for. */
export function fmdStatusRank(f?: FmdStatusFields): number {
  if (!f) return 9;
  if (isFmdOutdated(f)) return 0;
  if (f.hasDraft || !f.activeVersion) return 1;
  if (isNewVersion(f) || isNewFmd(f)) return 2;
  return 3;
}

/** Every status an FMD carries, in one place.
 *
 * The name alone says a document exists, not whether it is finished, current, or being edited —
 * and those are the three things you need before deciding to open it. They are separate tags
 * rather than one status word because they are genuinely independent: an FMD can have a published
 * version, unreleased edits on top of it, AND be behind the Golden template, all at once.
 *
 * Order is by urgency, not by category: the version number anchors the cell, then anything that
 * makes it not-quite-current, then the purely informational recency flag. */
export function FmdStatusTags({ fmd, className }: { fmd: FmdStatusFields; className?: string }) {
  // Falls back to the latest unpublished version rather than showing "—": a generated-but-never
  // published FMD does have a version number, and hiding it makes the row look emptier than it is.
  // The Draft tag beside it is what says nobody else can see this yet.
  const version = fmd.activeVersion ?? fmd.latestVersion;
  return (
    <span className={clsx('inline-flex flex-wrap items-center gap-1', className)}>
      {version ? (
        <Tag
          variant="accent"
          size="sm"
          className="font-mono"
          title={fmd.activeVersion ? `Version ${fmd.activeVersion} is live` : `Version ${version} has never been published`}
        >
          {version}
        </Tag>
      ) : (
        <Tag variant="neutral" size="sm">—</Tag>
      )}
      {(fmd.hasDraft || !fmd.activeVersion) && (
        <Tag
          variant="danger"
          size="sm"
          title={fmd.hasDraft ? 'Unreleased edits are waiting in a draft' : 'Generated but never published — only editors see it'}
        >
          {fmd.hasDraft ? 'Draft' : (fmd.latestState ?? 'Draft')}
        </Tag>
      )}
      {/* The flag, not the number it's behind. "Needs re-syncing" is actionable in a list; "the
          template is on v1.0.2" is a detail you only need once you've opened it. */}
      {isFmdOutdated(fmd) && (
        <Tag variant="warn" size="sm" title={fmdOutdatedReason(fmd)}>Outdated</Tag>
      )}
      {/* One or the other, never both — see isNewFmd / isNewVersion. Same treatment because they
          mean the same kind of thing (something arrived recently); the label carries the
          distinction, so a second colour would only imply a difference in severity. */}
      {isNewFmd(fmd) && <Tag variant="success" size="sm">New</Tag>}
      {isNewVersion(fmd) && <Tag variant="success" size="sm">New Version</Tag>}
    </span>
  );
}

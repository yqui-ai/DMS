/** Tracks which FMD versions have actually been opened, per browser — the "New" badge in the
 * Field Mapping list should disappear once someone's looked at it, not just sit there until the
 * time window expires on its own. Keyed by fmdId+latestVersionId so a fresh version on an
 * already-seen FMD still shows as new again. */
const STORAGE_KEY = 'dms.seenFmdVersions';

const seenKey = (fmdId: string, latestVersionId?: string): string => `${fmdId}:${latestVersionId ?? ''}`;

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function markFmdSeen(fmdId: string, latestVersionId?: string): void {
  const seen = readSeen();
  seen.add(seenKey(fmdId, latestVersionId));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // localStorage unavailable (private mode, quota) — the New badge just won't dismiss, not fatal.
  }
}

export function isFmdSeen(fmdId: string, latestVersionId?: string): boolean {
  return readSeen().has(seenKey(fmdId, latestVersionId));
}

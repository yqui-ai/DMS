import { useCallback } from 'react';
import { useParams } from 'react-router-dom';

/** Library route for the given segment ('objects' | 'fmds' | 'rules' | 'xref') — nested under the
 * current project when one's open (so navigating there never drops the user out of their project
 * context), the standalone top-level route otherwise. */
export const libraryPath = (segment: string, programId?: string, subprojectId?: string): string =>
  programId && subprojectId ? `/pg/${programId}/sp/${subprojectId}/library/${segment}` : `/library/${segment}`;

/** `libraryPath` for code already inside the Library routes, which don't need to plumb the ids —
 * React Router hands down every ancestor's params, so the mount point identifies itself.
 *
 * Deep views take an `id`: `to('fmds', fmd.id)`. Always build these absolutely rather than with
 * relative `..` segments, because the same screens are mounted at two different depths and a
 * relative hop that is right at one is wrong at the other. */
export function useLibraryPath() {
  const { programId, subprojectId } = useParams();
  return useCallback(
    (segment: string, id?: string) => libraryPath(segment, programId, subprojectId) + (id ? `/${id}` : ''),
    [programId, subprojectId],
  );
}

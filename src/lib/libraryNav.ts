/** Library route for the given segment ('objects' | 'fmds' | 'rules' | 'xref') — nested under the
 * current project when one's open (so navigating there never drops the user out of their project
 * context), the standalone top-level route otherwise. */
export const libraryPath = (segment: string, programId?: string, subprojectId?: string): string =>
  programId && subprojectId ? `/pg/${programId}/sp/${subprojectId}/library/${segment}` : `/library/${segment}`;

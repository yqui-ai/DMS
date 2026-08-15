import type { ObjectClass } from '../types/entities';

/** Reference shown for a Library artefact (FMD/Rule/XREF): 'Program-wide' for Global (optionally
 * naming the program), or the 'ProgramCode-ProjectCode' pair for Local — derived from the
 * subproject -> project -> program chain the row already belongs to, not a separate stored field. */
export function formatLibraryReference(klass: ObjectClass, programCode?: string, projectCode?: string): string {
  if (klass === 'Global') return programCode ? `${programCode} (Program-wide)` : 'Program-wide';
  return programCode && projectCode ? `${programCode}-${projectCode}` : '—';
}

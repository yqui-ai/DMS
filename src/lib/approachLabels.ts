/** Reference table for how each DMC migration-approach value should read at three levels of
 * available space — "big" (the full name), "medium" (abbreviated prefix), "small" (heavily
 * abbreviated). Approach itself is stored as the plain SAP domain value on migration_objects.approach
 * ('Direct Transfer - ERP', 'Staging Table', …) — this table only governs display text. */
export type ApproachSize = 'big' | 'medium' | 'small';
export interface ApproachLabelSet { big: string; medium: string; small: string }

const APPROACH_LABELS: Record<string, ApproachLabelSet> = {
  'Direct Transfer - ERP': { big: 'Migration Cockpit - Direct Transfer - ERP', medium: 'DMC - Direct Transfer - ERP', small: 'DMC - DT - ERP' },
  'Direct Transfer - AFS': { big: 'Migration Cockpit - Direct Transfer - AFS', medium: 'DMC - Direct Transfer - AFS', small: 'DMC - DT - AFS' },
  'Direct Transfer - EWM': { big: 'Migration Cockpit - Direct Transfer - EWM', medium: 'DMC - Direct Transfer - EWM', small: 'DMC - DT - EWM' },
  'Staging Table': { big: 'Migration Cockpit - Staging Table', medium: 'DMC - Staging Table', small: 'DMC - ST' },
  'Not classified': { big: 'Not classified', medium: 'Not classified', small: 'Not classified' },
};

/** Falls back to the raw value at every size for an approach not in the table above, so an
 * unrecognized/future SAP domain value still renders instead of disappearing. */
export function approachLabelSet(approach?: string | null): ApproachLabelSet {
  if (!approach) return { big: '—', medium: '—', small: '—' };
  return APPROACH_LABELS[approach] ?? { big: approach, medium: approach, small: approach };
}

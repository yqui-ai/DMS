import { Boxes, Building2, FolderKanban, RefreshCw, type LucideIcon } from 'lucide-react';
import type { HierarchyLevel } from '../../types/entities';
import type { TagVariant } from '../../components/Tag';

/** An icon per level, so the three tiers are distinguishable before you read a word.
 *
 * A building contains folders, a folder contains boxes — the metaphor runs the same direction as
 * the hierarchy, which is the only reason to spend three icons on it. */
export const LEVEL_ICON: Record<HierarchyLevel, LucideIcon> = {
  PRGM: Building2,
  PRJT: FolderKanban,
  SPRJ: Boxes,
  CYCL: RefreshCw,
};

/** Status → tag colour.
 *
 * This does not break the "colour means state, never category" rule — a status IS a state, and
 * these are the states people scan a portfolio for: what is running, what is stuck, what is done.
 * Keyed by CODE, which `dms_ref_status` shares across levels (0037), so a new level inherits the
 * mapping for free. Anything unrecognised falls back to neutral rather than disappearing. */
export const STATUS_VARIANT: Record<string, TagVariant> = {
  PLANNED: 'neutral',
  PREP: 'accent',
  ACTIVE: 'success',
  RUNNING: 'accent',
  ON_HOLD: 'warn',
  COMPLETED: 'success',
  CLOSED: 'neutral',
  CANCELLED: 'danger',
};

export const statusVariant = (code?: string): TagVariant =>
  (code && STATUS_VARIANT[code]) || 'neutral';

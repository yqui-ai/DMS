/** Deterministic categorical color-coding — same key always maps to the same swatch, cycling
 * through a fixed palette (same approach as GitHub labels/Jira tags: with enough distinct
 * values some color reuse is expected, the point is visual grouping, not perfect uniqueness). */
const PALETTE: { bg: string; text: string }[] = [
  { bg: 'bg-blue-light', text: 'text-blue-deep' },
  { bg: 'bg-violet-bg', text: 'text-violet-deep' },
  { bg: 'bg-teal-bg', text: 'text-teal' },
  { bg: 'bg-green-bg', text: 'text-green' },
  { bg: 'bg-amber-bg', text: 'text-amber-ink' },
  { bg: 'bg-red-light', text: 'text-red-ink' },
  { bg: 'bg-[#eceff3]', text: 'text-[#525a66]' },
  { bg: 'bg-[#e0f2fe]', text: 'text-[#0369a1]' },
  { bg: 'bg-[#fce7f3]', text: 'text-[#9d174d]' },
  { bg: 'bg-[#ede9d8]', text: 'text-[#78350f]' },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Tailwind bg/text class pair for a categorical value, e.g. `groupColorClasses(rule.approach)`. */
export function groupColorClasses(key: string): string {
  const p = PALETTE[hashString(key) % PALETTE.length];
  return `${p.bg} ${p.text}`;
}

/** SAP component codes are hierarchical (e.g. "FI-AA", "LO-WTY") — the part before the first
 * dash is the main functional area; components with no dash (e.g. "MM") are already top-level. */
export function componentMainGroup(component: string): string {
  return component.split('-')[0];
}

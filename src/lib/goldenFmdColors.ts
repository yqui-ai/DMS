/** Color palette for Golden FMD sections — plain hex, applied via inline styles rather than
 * Tailwind class names (Tailwind's scanner can't see runtime-computed class strings, and this
 * keeps the on-screen designer, the read-only viewers, and both Excel exports using the exact
 * same values). Three tiers per color: `band` (medium-bright, solid fill + white text for merged
 * section header rows), `bg` (pale tint for field-header rows and on-screen accents), `text`
 * (readable on white, for the Designer's section list/labels). Calibrated to match the reference
 * FMD template's actual band brightness — not the darker, over-saturated first attempt. New
 * sections cycle through this list in order. */
export interface SectionColor { key: string; label: string; band: string; bg: string; text: string; border: string }

export const SECTION_COLORS: SectionColor[] = [
  { key: 'blue', label: 'Blue', band: '#2F6FED', bg: '#EEF2FE', text: '#1D4ED8', border: '#BFDBFE' },
  { key: 'amber', label: 'Amber', band: '#CA8A04', bg: '#FEF9E7', text: '#B45309', border: '#FDE68A' },
  { key: 'teal', label: 'Teal', band: '#0D9488', bg: '#E6F5F3', text: '#0D9488', border: '#5EEAD4' },
  { key: 'red', label: 'Red', band: '#DC2626', bg: '#FDECEA', text: '#DC2626', border: '#FCA5A5' },
  { key: 'violet', label: 'Violet', band: '#7C3AED', bg: '#F3EEFE', text: '#6D28D9', border: '#DDD6FE' },
  { key: 'pink', label: 'Pink', band: '#DB2777', bg: '#FDF0F7', text: '#BE185D', border: '#FBCFE8' },
];

export const colorByKey = (key: string): SectionColor => SECTION_COLORS.find((c) => c.key === key) ?? SECTION_COLORS[0];
export const nextColor = (usedCount: number): SectionColor => SECTION_COLORS[usedCount % SECTION_COLORS.length];

/** Color palette for Golden FMD / Golden XREF sections — plain hex, applied via inline styles
 * rather than Tailwind class names (Tailwind's scanner can't see runtime-computed class strings,
 * and this keeps the on-screen designer, the read-only viewers, and both Excel exports using the
 * exact same values). Four tiers per color: `band` (medium-bright, solid fill for merged section
 * header rows — paired with `bandText`, since a few of these swatches are too pale for white text
 * to stay readable), `bg` (pale tint for field-header rows and on-screen accents), `text` (readable
 * ink on white, for the Designer's section list/labels), `border` (light border for accents). A
 * fixed 10-color spectral palette — every color is a distinct, named option; sections don't cycle
 * through a short repeating list, they lock a color for the life of the structure (see
 * usedColorKeys in the designer dialogs). */
export interface SectionColor { key: string; label: string; band: string; bandText: string; bg: string; text: string; border: string }

export const SECTION_COLORS: SectionColor[] = [
  { key: 'crimson', label: 'Crimson', band: '#9E0142', bandText: '#FFFFFF', bg: '#FCE8EF', text: '#9E0142', border: '#F3B8CE' },
  { key: 'red', label: 'Red', band: '#D53E4F', bandText: '#FFFFFF', bg: '#FDEEEF', text: '#C22A3B', border: '#F5B7BE' },
  { key: 'orange-red', label: 'Orange Red', band: '#F46D43', bandText: '#FFFFFF', bg: '#FEEEE7', text: '#C1502A', border: '#FAC7B0' },
  { key: 'orange', label: 'Orange', band: '#FDAE61', bandText: '#1D2129', bg: '#FFF3E6', text: '#B4650E', border: '#FDD9AE' },
  { key: 'yellow', label: 'Yellow', band: '#FEE08B', bandText: '#1D2129', bg: '#FFF9E9', text: '#8A6D0A', border: '#FBE7A8' },
  { key: 'lime', label: 'Lime', band: '#E6F598', bandText: '#1D2129', bg: '#F6FBE8', text: '#6B7A1E', border: '#E4EFB0' },
  { key: 'green', label: 'Green', band: '#ABDDA4', bandText: '#1D2129', bg: '#EEF9EC', text: '#3F8A3A', border: '#C9ECC2' },
  { key: 'teal', label: 'Teal', band: '#66C2A5', bandText: '#1D2129', bg: '#E9F7F2', text: '#1F8A6E', border: '#A9E0CE' },
  { key: 'blue', label: 'Blue', band: '#3288BD', bandText: '#FFFFFF', bg: '#EAF4FA', text: '#1E6690', border: '#A9D3EA' },
  { key: 'indigo', label: 'Indigo', band: '#5E4FA2', bandText: '#FFFFFF', bg: '#F0EDF8', text: '#4A3B85', border: '#C9BFE8' },
];

/** Keys from the old 6-color palette that no longer exist under the same name — translated to the
 * nearest equivalent in the new 10-color spectral palette so structures saved before this palette
 * change still render sensibly instead of all collapsing onto the first swatch. */
const LEGACY_KEY_ALIASES: Record<string, string> = { amber: 'orange', violet: 'indigo', pink: 'crimson' };

export const colorByKey = (key: string): SectionColor =>
  SECTION_COLORS.find((c) => c.key === key)
  ?? SECTION_COLORS.find((c) => c.key === LEGACY_KEY_ALIASES[key])
  ?? SECTION_COLORS[0];
/** First color not already used by any section in `usedKeys` — falls back to cycling by position
 * once every color is taken (10 sections is already a lot). */
export const nextColor = (usedKeys: string[]): SectionColor =>
  SECTION_COLORS.find((c) => !usedKeys.includes(c.key)) ?? SECTION_COLORS[usedKeys.length % SECTION_COLORS.length];

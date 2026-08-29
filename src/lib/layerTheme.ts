/** Palette for dependency LAYERS — one per depth.
 *
 * This is the one place in DMS where colour encodes something other than state, and it is
 * deliberate: layer depth is an ordered scale, not a category. See the `design-system` skill's
 * colour rule, which still binds everywhere else.
 *
 * ## Why this was rebuilt
 *
 * The first version was a cool→warm ramp of ten **pale tints** (green → blue → indigo → violet →
 * purple → pink → rose → orange → amber → red). It read beautifully as a gradient and failed at the
 * only job that matters: L2, L3 and L4 were indistinguishable. Two causes, and both had to go.
 *
 * 1. **The hue steps were too small.** Ten hues spread over ~300° is 33° apart — indigo, violet and
 *    purple are neighbours on the wheel, so consecutive layers were near-identical by construction.
 *    Steps are now ~60°, so no two adjacent layers share a colour family.
 * 2. **Everything sat at ~90% lightness.** At that lightness *any* ten hues converge; measured
 *    RGB separation between adjacent headers was 18–31. Bands are now saturated, which took the
 *    same measurement to 89–149.
 *
 * Ordinality survives because the sequence still drifts cool → warm → cool through the wheel; what
 * changed is that you can now tell one step from the next, which is the whole point of a depth
 * scale. Real scopes rarely run past L5, so the first six are the ones tuned hardest.
 *
 * ## The four roles, and which text goes on which
 *
 * Every pairing below is measured, not judged by eye. Do not invent a fifth role or mix a role from
 * one layer with a role from another — the combinations are verified as pairs:
 *
 * | Role | Use for | Text on it |
 * |---|---|---|
 * | `band` | Saturated stage/layer header strip | **White only** (4.99–10.35 : 1) |
 * | `wash` | Pale pill fill, band interior | `ink` (4.82–9.45 : 1) |
 * | `surface` | Node body fill inside a band | `--text` as normal |
 * | `ink` | The hue as text on white, and as a node border | on white 4.99–10.35 : 1 |
 *
 * `ink` doubles as the border colour precisely because it is the strong value — the old borders
 * measured 1.5–2.7 : 1 against white, under the 3:1 that a UI boundary needs, so node outlines were
 * decorative rather than legible.
 *
 * Plain hex applied inline, same reason as `goldenFmdColors`: Tailwind cannot scan a class name
 * computed at runtime. These are light-theme values; the diagram canvases sit on `--surface-2`, and
 * a saturated band with white text stays legible on either ground. */
export interface LayerTheme {
  /** Saturated fill for the layer's header band. Carries white text and nothing else. */
  band: string;
  /** Very pale wash — a pill background, or the interior of a band. Carries `ink`. */
  wash: string;
  /** Near-white fill for a node body sitting in this layer. */
  surface: string;
  /** The hue at full strength: node borders, and the layer's own label on a white ground. */
  ink: string;
}

/** **No reddish hue appears in this scale, at any depth.**
 *
 * L3 was pink and L4 orange, and the moment the ERD graph started ringing MANDATORY prerequisites in
 * red those layers became unreadable: a red-ringed node inside a pink band, next to an orange band,
 * asked the reader to distinguish "this must load first" from "this is three loads deep" by shade.
 * Red belongs to one meaning in this app — see the `design-system` colour rule — and a depth scale
 * has no business borrowing it.
 *
 * The ramp is therefore drawn only from green, lime, olive, teal, cyan, blue, indigo, violet, purple
 * and slate, ordered so neighbours sit 49–177° apart on the wheel rather than in a smooth sweep.
 * Adjacent distinctness beats a pretty gradient: the scale exists to tell L2 from L3, not to look
 * like a sunset. Every pairing below is measured — white-on-band 4.99–10.35 : 1, ink-on-wash
 * 4.82–9.45 : 1. */
export const LAYER_THEMES: LayerTheme[] = [
  { band: '#047857', wash: '#ecfdf5', surface: '#f7fefb', ink: '#047857' }, // L0 emerald
  { band: '#4338ca', wash: '#eef2ff', surface: '#f8faff', ink: '#4338ca' }, // L1 indigo
  { band: '#4d7c0f', wash: '#f7fee7', surface: '#fcfef4', ink: '#4d7c0f' }, // L2 lime
  { band: '#6d28d9', wash: '#f5f3ff', surface: '#fbfaff', ink: '#6d28d9' }, // L3 violet
  { band: '#0e7490', wash: '#ecfeff', surface: '#f6feff', ink: '#0e7490' }, // L4 cyan
  { band: '#7e22ce', wash: '#faf5ff', surface: '#fdfbff', ink: '#7e22ce' }, // L5 purple
  { band: '#0f766e', wash: '#f0fdfa', surface: '#f7fefd', ink: '#0f766e' }, // L6 teal
  { band: '#1d4ed8', wash: '#eff6ff', surface: '#f9fbff', ink: '#1d4ed8' }, // L7 blue
  { band: '#3f6212', wash: '#f5fbe8', surface: '#fbfef2', ink: '#3f6212' }, // L8 olive
  { band: '#334155', wash: '#f1f5f9', surface: '#fafcfd', ink: '#334155' }, // L9+ slate
];

/** Text that sits on `band`. White is the only value verified against every band in the scale. */
export const LAYER_BAND_TEXT = '#ffffff';

export const getLayerTheme = (layer: number): LayerTheme =>
  LAYER_THEMES[Math.min(Math.max(layer, 0), LAYER_THEMES.length - 1)];

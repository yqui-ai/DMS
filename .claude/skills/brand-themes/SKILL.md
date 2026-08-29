---
name: brand-themes
description: How DMS re-skins itself for a client brand — the accent token layer, the data-brand attribute, and the rules that keep a brand from becoming a costume. Read before adding a brand, touching src/styles/tokens.css or tailwind.theme.ts, or writing any colour.
---

# Brand themes

DMS ships neutral and can wear a client's accent colours. A brand repaints **accents only** —
primary actions, links, selection, tags, status, focus. Surfaces, text and lines never change, so
the app stays the same clean white/grey and the brand shows up where attention already goes.

## Two independent dimensions

| Dimension | Carrier | Values |
|---|---|---|
| Light / dark | `.dark` class on `<html>` | on / off |
| Brand | `data-brand` on `<html>` | absent (neutral) · `theme1` |

**They compose, and every brand must look right in both.** Picking a brand must not cost someone
their dark mode. Both persist to `localStorage` (`dms-theme`, `dms-brand`) and are restored in
`ThemeInit` (`app/providers.tsx`).

The neutral default writes **no attribute at all**, so `:root` applies unmodified rather than
through a block that would have to restate every token.

## The token layer is what makes this possible

`styles/tailwind.theme.ts` maps every colour to a CSS variable — `blue: 'var(--blue)'` and so on.
Until this existed the accents were **hardcoded hex in the Tailwind theme**, which quietly made the
identically-named variables in `tokens.css` dead: nothing could retheme an accent, in dark mode or
anywhere else. Never put a literal back there.

The matching rule for components is already in the `design-system` skill and is what this depends
on: **no component writes a colour literal.** A `text-[#7c3aed]` ignores every brand. Several did,
and were fixed alongside this — `StatDot`, `TimelineGantt`, `DashboardPage`'s health ring, the AI
badge in `Dialog`. SVG attributes take `var(--x)` too; use it.

Two deliberate exceptions, both documented in place:

- `lib/layerTheme.ts` — an ordinal depth scale, not accents. Not a brand's business.
- `lib/dependencyDiagramImage.ts` — renders an exported image file, not screen UI.

## Adding a brand

One block in `styles/tokens.css`, one entry in `BRANDS` (`lib/theme.ts`). No component changes.

```css
[data-brand="acme"]{
  --blue:…; --blue-deep:…; --blue-mid:…; --blue-light:…; --blue-pale:…;
  --red:…; --red-light:…; --red-ink:…;
  --amber:…; --amber-ink:…; --amber-bg:…;
  --green:…; --green-bg:…;
  --violet:…; --violet-deep:…; --violet-bg:…;
  --teal:…; --teal-bg:…;
  --chrome-bg:…; --chrome-text:…; --chrome-muted:…; --chrome-line:…; --chrome-hover:…;
  --nav-bg:…; --nav-text:…; --nav-muted:…; --nav-line:…; --nav-hover:…;
}
[data-brand="acme"].dark{ /* re-derive the tints; light-mode ones glow on a dark ground */ }
```

**Order matters.** `:root` and `[data-brand]` have equal specificity, so a default written *after*
a brand block silently beats it. The chrome defaults are declared before them for exactly this
reason.

## Chrome vs content — where a theme is allowed to be loud

A theme darkens the **frame**, never the work. Two token sets exist for exactly this:

| Tokens | Used by | Default |
|---|---|---|
| `--chrome-bg/text/muted/line/hover` | the header bar | white, same as `--surface` |
| `--nav-bg/text/muted/line/hover` | the sidebar | white, same as `--surface` |

Content surfaces (`--surface`, `--bg`) are untouched by any theme, so tables, cards and dialogs stay
on clean white and the app *around* them takes the colour. A theme that darkened `--surface` would
just be a second dark mode.

**Slate, not black.** Black chrome against a white content area is a hard edge that makes the page
read as two applications stapled together. The sidebar sits one step darker than the header, so the
navigation reads as sitting behind the content rather than beside it.

Anything rendered *inside* the header or sidebar must use these tokens rather than `text-muted` /
`hover:bg-blue-pale`, or it turns into grey-on-slate the moment a theme is picked.

## Theme 1

Interactive accent is a strong blue, not the palette's red — deliberately. Red is already this app's
error colour, and a primary button the same colour as a validation failure teaches people to stop
reading both. Red keeps its job in the danger/error role, where red belongs.

There is no decorative gradient strip. One was tried above the header and removed: on the neutral
theme it rendered as a stray grey line, and on a themed one it was ornament competing with the
dark chrome that already carries the identity.

If a stakeholder insists on red primary actions it is one line — `--blue: #d60006` — but say what it
costs first.

### Rebuilt from the ConnectedWorld stage, 2026-08-29

The reference is a midnight-indigo stage lit with electric blue, turquoise and violet. Two rules
governed the translation:

**The workspace stays light.** `--bg`, `--surface`, `--surface-2/3`, `--line*`, `--text` and
`--muted` are untouched by this theme. It changes the FRAME and the ACCENTS only. A dark content
area is a different product, and the people using this read tables all day.

**Every ink is measured against two grounds, not one.** The old palette sat at 4.54–4.58 : 1 on
white — technically AA — but failed on `--surface-2` (4.20–4.23), the hover fill sitting under half
the muted text in the app. A row lighting up on hover was pushing its own text under the threshold.
Each value is now checked on `--surface` AND `--surface-2`; the worst pair is 4.92.

| Role | Value | on white / on `--surface-2` |
|---|---|---|
| Blue (primary) | `#0a63d2` | 5.63 / 5.20 |
| Red (danger) | `#d60006` | 5.44 / 5.02 |
| Amber ink | `#7d6100` | 5.86 / 5.42 |
| Green (success) | `#007a51` | 5.38 / 4.97 |
| Violet | `#6d33d9` | 6.72 / 6.21 |
| Turquoise | `#0c7684` | 5.33 / 4.92 |

Chrome `#12295c`, navigation `#0b1a42` — indigo rather than the previous neutral slate, and still
deliberately not black. The nav sits one step deeper than the header so it reads as *behind* the
content.

**Before changing any of these, recompute both ratios.** Brightening an accent to match a reference
image is exactly how the previous palette ended up passing on paper and failing on a hover row.

**Colours only. Never a logo or wordmark** — theming an app in a palette is normal; shipping someone
else's mark is not ours to do. Themes are named neutrally (`theme1`, not a company name) for the
same reason.

## Maintaining this skill

Update it whenever a brand is added, the token layer changes, or another colour literal is found and
fixed.

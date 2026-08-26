---
name: design-system
description: DMS visual language — colour tokens (and the dark-mode rule that literals break), the type scale, control sizing, toolbar composition, density grading, dialogs, focus and icons. Load this before writing ANY UI in this repo, and update it whenever a shared visual decision changes.
---

# DMS design system

The rules here exist because each one was broken at least once and produced a visible defect. Where
a rule says "never", it's recording a bug that shipped, not a preference.

## 1. Colour — never write a hex in a component

Every colour comes from a token in `src/styles/tokens.css`, exposed through
`src/styles/tailwind.theme.ts`. Components use the Tailwind name, never the literal.

| Token | Tailwind | Use for |
|---|---|---|
| `--surface` | `bg-surface` | Cards, dialogs, page panels |
| `--surface-2` | `bg-surface-2` | Hover fills, inset wells |
| `--surface-3` | `bg-surface-3` | Table header rows and chrome strips |
| `--line` | `border-line` | Dividers between areas |
| `--line-strong` | `border-line-strong` | Visible borders on form controls |
| `--text` / `--muted` | `text-text` / `text-muted` | Primary / secondary text |

**Why this is a hard rule:** `#d6dbe2` and `#eef1f5` were hardcoded in 34 files (77 occurrences).
Both are light-mode values, so they never swapped under `.dark` — every table header rendered as a
near-white bar on a near-black page, with muted grey labels on top. Dark mode was effectively
broken app-wide, and nothing failed loudly because it all still compiled. A literal hex in a
component is a dark-mode bug you won't notice until someone toggles the theme.

**The two legitimate exceptions**, both because they're theme-independent by nature:
- `src/lib/goldenFmdColors.ts` — the Golden section palette, applied inline because Tailwind can't
  scan runtime class strings, and shared byte-for-byte with the Excel exports.
- `src/lib/dependencyDiagramImage.ts` — canvas PNG export; an exported image must not follow the
  viewer's theme.

Data-meaning highlights (`#fef9c3` changed, `#fecaca` error, `#fed7aa` warning in the FMD grid) are
currently literals too. They're on the list to tokenise; don't add more.

### Colour means STATE, never CATEGORY

Colour is reserved for things that need attention or carry severity. A categorical attribute —
Class, Type, Object Type, Approach, Component, Object ID, Status=Active — renders as **plain text**.
Colouring every attribute made list screens read as confetti and, worse, spent the colour budget so
the things that *did* need attention couldn't stand out.

| Renders as | Examples |
|---|---|
| Plain text | Class, Type, Object Type, Approach, Component, Object ID, Reference, Status "Active" |
| Coloured tag | Outdated (warn), Draft (danger), severity error/warning, review-point categories |

`ColorTag` (hash-derived colour) survives only in the dependency diagram, where colour separates
node types rather than labelling a row. Don't reintroduce it in tables.

## 2. Type scale

**Four steps: 10.5 / 12 / 14 / 16**, plus `kpi` (22) for big figures. Nothing else.

| Tailwind | px | Use for |
|---|---|---|
| `text-2xs` | 10.5 | Micro labels, timestamps, counts |
| `text-sm2` | 12 | **Body, tables, form controls — the default** |
| `text-md` | 14 | Emphasis, subheads |
| `text-xl` | 16 | Page and dialog titles |

The scale used to have twelve sizes with **seven of them between 10.5px and 14px**. A 0.5px step is
invisible as hierarchy but very visible as misalignment — two labels meant to match sit half a pixel
apart and baselines wobble. That was the main reason the UI never looked settled.

`xs2`, `xs`, `sm`, `base`, `lg`, `2xl`, `3xl` still resolve — they're **aliased to the nearest
survivor** so old markup renders correctly — but they must not appear in new code. Adding a size
back to the theme re-opens the exact defect.

## 3. Controls

**One height for everything in a toolbar row.** Buttons, inputs, selects and filters all use
`px-2.5 py-1.5` + `text-sm`. A control that sets its own padding will be the wrong height and the
row will stop aligning.

**There is exactly one button component.** `Button` takes `variant` (primary / secondary / quiet /
ghost / dangerGhost / **ai**) × `size` (sm / md). `ToolbarButton` and `AiButton` were deleted —
they were separate components with different heights that sat side by side in the same row, which
is why rows never aligned. Toolbar actions are `variant="quiet" size="sm"`; AI actions are
`variant="ai" size="sm"`; dialog footers are the default `md`.

Never override padding or text size at a call site — that is exactly how the drift started.

`Tag` also takes `size`: `sm` for tags that annotate a value ("Outdated" beside a version,
"Draft" beside a status), `md` for tags that label a record.

## 4. Density grading — the fix for "crowded"

A screen reads as crowded when everything competes at the same volume, not when it holds too much.
Grade deliberately, quietest first:

1. **Counts and status text** — `text-sm text-muted`, no chrome at all.
2. **Inactive filters and search** — muted text, `border-transparent`, no fill. They only gain a
   border and `bg-blue-pale` **when active**, which is what makes "this list is filtered" visible
   without reading the row.
3. **Secondary actions** — quiet bordered buttons.
4. **The primary action** — the only filled element in the row.

If two things in a row have the same weight, one of them is wrong.

## 5. Toolbar composition

Order, left to right, on every list screen: search → filters → clear-filters (only when active) →
count → `ml-auto` → secondary actions → primary action.

`PageHeader` has an `actions` slot; only 1 of 13 screens uses it and the rest hand-roll a second
row. A shared `Toolbar` component with `filters` / `status` / `actions` slots is the intended fix —
prefer it over another bespoke row when it exists.

## 6. Dialogs

`Dialog` sizes: `sm` 440px (confirm), `md` 640px (form), `lg` 960px (wizard), `win` 94vw×94vh
(data viewer). `variant="ai"` adds the gradient border + badge; `processing` animates it while an
AI call is in flight.

**Nesting is safe now.** `Dialog` keeps a module-level stack of open dialogs: only the topmost
responds to Escape (and stops the event), and z-index is derived from stack depth (`900 + depth*10`)
rather than DOM insertion order. Previously one Escape closed every open dialog at once.

**Modals are not a navigation model.** 23 dialogs exist and none touch the URL, so browser Back
leaves the screen instead of closing the dialog. Deep, linkable views (an FMD, a field) belong on
routes; keep dialogs for a short confirm or a single-purpose composer.

## 7. Focus and keyboard

A global `:focus-visible` rule in `tokens.css` gives every element a 2px `--blue-mid` outline.
Don't remove it per-component; override only where it clips badly. Before this, 21 of 24 shared
components had no focus style at all.

Anything clickable must be a real `<button>` or `<a>`. A clickable `<div>` gets no focus ring, no
keyboard activation, and no role.

## 8. Icons

**One icon, one destination.** `shield-check` was used for three different nav items and `shuffle`
for two — collapsed to the 60px icon rail, the sidebar became ambiguous. Before adding a nav icon,
grep `src/app/nav.ts` to confirm it's unused.

## 9. Tables

Use the shared `Table` (`src/components/Table.tsx`). It owns sort, pagination, empty state, sticky
headers and `text-sm2` sizing. Ten hand-rolled `<table>` blocks still exist; they miss all of that
and each needed separate fixing during the token migration. Don't add an eleventh.

Pass `rowClickable` whenever only *some* rows open something, or every row renders as clickable and
inert rows show a pointer that does nothing.

**Cell hover uses an inset tint, not a background colour:**
`hover:shadow-[inset_0_0_0_9999px_rgba(10,79,140,.08)] hover:text-blue-deep`. An inset shadow layers
*over* whatever the cell already has, so review highlights, changed-cell yellow and status fills all
survive the hover and simply darken. Setting `hover:bg-*` would erase them.

## Maintaining this skill

Update this file in the same change whenever a shared visual decision changes — a new token, a
retired component, a resolved defect. Delete entries that stop being true; a stale system doc is
worse than none. Companion: `library-section-design` for Library-specific layout rules.

## 10. Navigation

`Breadcrumb` (in `src/app/layout/`) renders `Home › Project › Subproject › Section › Sub-tab` in the
header. Section labels come from `NAV_GROUPS`, so renaming a nav item renames its crumb; sub-tab
labels are humanised from the URL, which can't fall out of sync with a hand-kept list.

**Segments link only where a real route exists** — never invent a destination to make a crumb
clickable. The switcher *changes* context and the breadcrumb *reports* it; keep them separate
controls.

Non-functional chrome is not allowed. A global search box and a notifications bell shipped with no
`onChange` and no `onClick`; both were deleted rather than left as decoration, because a control
that ignores you teaches people the working ones can't be trusted either. Ship the behaviour first.

## 11. Editing FMD content

`useEditFmdField` is the only write path for mapping content, and it hides the draft rule from
callers: if the latest version is an unpublished draft the edit lands in it; if the latest version
is **published** (frozen by a DB trigger) the first edit forks a new draft from it. That is how an
FMD enters Draft state — before this there was no path to Draft except generating a version.

A new version's **change summary goes in its `comment`**, not into the review list. It was briefly
filed as a separate review entry, which made that list mostly duplicates — one near-identical
"version comparison" per version, crowding out the policy findings people actually open the pane
for. A summary describes the version, so it lives with the version.

Two rules that follow from it:
- **Edits always target the latest version**, never whichever one is selected. Editing a superseded
  version would create a fork nobody ever sees.
- **Reviews are not carried into the forked draft.** They assessed the published content;
  re-attaching them to edited content would misreport what was checked.

Editing is per-cell, not per-row, so two people editing different fields of the same structure
can't overwrite each other with a stale row copy.

**Edit mode is entered per SECTION, from a pencil in the section header** — never by clicking a
value. A single click quietly turning a document into a form is how people change data they only
meant to read. One section is editable at a time; the whole record at once becomes a wall of inputs
and loses the layout that made it readable. Changing field or structure exits edit mode.

The field-level view does **not** use the table's hover tint. That belongs to the grid, where you're
tracking a cell across a wide row; in a document layout it's noise.

## 12. Two text roles per screen

The four-step scale is the *vocabulary*; a single screen should use **two roles**, not four:

- **`text-2xs`** — uppercase micro-labels and meta only (section headers, field labels, timestamps,
  "Field 3 of 158"). Never body content.
- **`text-sm2`** — everything a person actually reads or types: values, list items, note bodies,
  search boxes, buttons.

`text-md` is for a single focal item (the record you have open); `text-xl` for the dialog or page
title. If a screen has more than one `text-md` element, one of them is wrong.

The field-level view was the cautionary case: its field list sat at 10.5px directly beside 12px
values, with 14px in the header — three sizes competing inside one panel. Mixing sizes *within a
role* is what reads as messy, even when every size is on the scale.

## 13. Borders

Three border tokens, three jobs — using the wrong one is what made screens look like a mesh:

| Token | Use for |
|---|---|
| `border-line` | Dividing **areas** — panel edges, header/footer rules |
| `border-line-soft` | **Row rules inside a list or grid**, where there are hundreds of them |
| `border-line-strong` | **Form-control** outlines only |

**Don't box things that are already boxed.** A list inside a bordered pane needs dividers between
items, not a ring around each one — review points and findings were rings-inside-a-ring, which is
what produced the stacked-cards look. The FMD grid also drops its own container ring: the dialog
already frames it.

**A source → target pair is one identity.** Where both halves are shown, they render at the same
size with only the arrow muted — sizing them differently reads as two unrelated facts rather than
one mapping. (This applies to the field list; the field view's *header* no longer repeats the pair
at all, see below.)

**Don't state the same fact three times on one screen.** The field view's header used to show
`SRC → TGT`, which the highlighted row in the left list and the Source/Target panels beneath both
already say. Before adding an identifying label to a header, check whether the content underneath
already identifies itself.

## 14. Selects

`Select` (`src/components/Select.tsx`) is the only styled dropdown. Its `sm`/`md` sizes match
`Button` exactly, because a select beside a button at a different height is the most common way a
toolbar row stops aligning. Pass `mono` for technical values (versions, structure idents).

Before it existed there were **six different select paddings** in the codebase, and the FMD version
picker had invented its own blue fill so it read as a different *kind* of control from the buttons
next to it. Don't override padding, height or text size at a call site.

Note `size` shadows the native HTML attribute (a visible-row count) on purpose — the interface
`Omit`s it.

## 15. Confirmations and unsaved work

`ConfirmDialog` is for **irreversible** steps only — publishing, discarding, deleting. Do **not**
confirm ordinary saves: a confirm on every save trains people to dismiss confirms unread, which is
exactly what makes the one that matters useless.

Unsaved-work protection lives in `Dialog`, not in each form: pass `unsavedWarning="<what is at
risk>"` while the form is dirty and `undefined` once it's clean. Every close path (X, backdrop,
Escape) funnels through the same guard, so no dialog can forget one of them.

## 16. Draft workflow

Edits **collect** in one draft; they never produce a version each. `useEditFmdField` re-reads the
latest version from the database on every save rather than trusting React state — without that,
two quick edits both see the published version and each fork their own draft, and a long session
ends up with a version per keystroke.

Each edit is also recorded as an `FmdPendingChange` (from → to, who, when). The **Draft tab** lists
them with checkboxes and is the *only* place Publish lives — it used to sit in the toolbar, where it
was permanently present for an action that only applies when a draft exists. Publishing releases the
ticked changes and leaves the rest in a new draft on top, so a session of hundreds of edits can go
out in slices.

Re-editing the same cell keeps the original `from`, so a change always reads against what's
published rather than against the last keystroke; editing back to the published value drops the
change entirely rather than asking someone to publish a no-op.

## 17. Writing code with escape sequences

**Never author code containing `\n`, `\t` or similar through a shell heredoc.** The heredoc consumes
the backslash and a real newline lands inside the string literal, producing an unterminated string.
This broke two files in one session — an Edge Function (caught only by a failed deploy) and
`fmds.ts` (caught by the dev server). Use the Edit tool for those changes.

## 18. Editing the right control for the value

A field's editor is chosen by what the value *is*, not by what's easiest to render:

| Value | Control |
|---|---|
| Fixed value set (`MAPPING_TYPE`) | `Select` — never a text box. Typing a four-value enum by hand invites typos the policy then rejects |
| Code (`TECHNICAL_RULE` — SQL) | Monospaced in **both** read and edit mode. A statement set in the body face is harder to scan and stops looking like something you'd run |
| Free-text paragraph | Full-width textarea (`WIDE_FIELDS`) |
| Short scalar | Input, width-capped (`NARROW_FIELDS`) so it doesn't stretch across a grid column with nothing beside it |

Section-header controls go in **one right-aligned group**, not each with its own `ml-auto` — two
elements both claiming the free space leaves one stranded mid-row.

## 19. Don't hand-roll a control that already exists

Every interactive element uses a shared component. Writing raw `<button className="bg-blue …">`
is how the four-height button problem started, and it recurred: a "Generate SQL" action, two
icon-only post buttons and an accept/discard pair all shipped as bespoke markup **after** the
consolidation, inside the same session that documented the rule.

| Need | Component |
|---|---|
| Perform an action | `Button` (`variant` × `size`) |
| Choose one of a few visible options | `Segmented` |
| Choose one of many | `Select` |
| Titled panel with a header strip | `Pane` |
| Confirm something irreversible | `ConfirmDialog` |

`Segmented` replaced three separately hand-rolled pill groups with different paddings and different
selected treatments (one pill-radius, one square, one filled blue). Same shape everywhere is what
makes them read as the same control rather than three coincidentally similar ones.

An icon-only button is still a `Button` — pass `aria-label` and let the size scale handle the box.

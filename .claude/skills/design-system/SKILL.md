---
name: design-system
description: DMS visual language — colour tokens (and the dark-mode rule that literals break), the type scale, control sizing, toolbar composition, density grading, dialogs, focus, icons, accessibility, motion, z-index, form feedback, loading states and data display. Load this before writing ANY UI in this repo, and update it whenever a shared visual decision changes.
---

# DMS design system

The rules here exist because each one was broken at least once and produced a visible defect. Where
a rule says "never", it's recording a bug that shipped, not a preference.

**Before delivering any UI, run `references/ui-review-checklist.md`.** It is the pass that catches
what compiles and looks fine on your machine but fails for someone using a keyboard, a screen
reader, dark mode, reduced motion or a 1366px laptop.

Sections 1–19 are the visual language. Sections 20–26 are the quality floor beneath it — mostly
accessibility, motion and state handling, which are what separate an interface that was designed
from one that was merely assembled.

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

### A panel on a dark ground must reset its text colour

`<header>` sets `bg-chrome text-chrome-text`, and **every dropdown inside it inherits that colour**.
A `bg-surface` menu panel therefore renders near-white text on white unless it says otherwise — which
is exactly what happened to the account menu's Profile and Dark mode items, the two entries that
carried no colour class of their own.

Every popover panel opened from the chrome sets **`bg-surface text-text`** on the panel itself, not
on each item. Fixing it per item leaves the next item someone adds broken.

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

**A list is white.** `Table` sets `bg-surface` on its container and `bg-surface` on the header row,
separated from the body by `border-b border-line` rather than a fill. It previously set **no
background at all**, so every list showed the page's grey `--bg` between its rows, and the header
was a `--surface-3` bar — the heaviest thing on the screen while carrying the least information.
A list is a document that sits *on* the page; it is not part of the page.

Two constraints if you touch this:
- The sticky header must stay **opaque**. A transparent sticky header lets rows scroll visibly
  underneath it.
- `--surface-3` is still correct for **chrome strips** (a pane's header bar, a section label). It is
  no longer used for table header rows anywhere, including the six hand-rolled tables in the FMD and
  Golden dialogs, which were converted in the same change so lists match wherever they appear.

Use the shared `Table` (`src/components/Table.tsx`). It owns sort, pagination, empty state, sticky
headers and `text-sm2` sizing. Ten hand-rolled `<table>` blocks still exist; they miss all of that
and each needed separate fixing during the token migration. Don't add an eleventh.

Pass `rowClickable` whenever only *some* rows open something, or every row renders as clickable and
inert rows show a pointer that does nothing.

**Cell hover uses an inset tint, not a background colour:**
`hover:shadow-[inset_0_0_0_9999px_rgba(10,79,140,.08)] hover:text-blue-deep`. An inset shadow layers
*over* whatever the cell already has, so review highlights, changed-cell yellow and status fills all
survive the hover and simply darken. Setting `hover:bg-*` would erase them.

## Monospace is for a standalone identifier

`font-mono` marks something you'd type or copy — an ID, a version, a field or table name — where it
stands **alone**. A string that mixes an identifier with prose takes the body font for the whole
thing.

`<option>` can't set two faces, so `<Select mono>` applies the code face to every character in the
label. "v1.0.2 · unpublished" and "S_MARA — Material master (33)" both came out entirely
monospaced, which read as a different control from the sans-serif buttons beside them. Either keep
the option a bare identifier and set `mono`, or let it carry prose and drop `mono` — not both.

## Version labels

"Latest" means newest by date. It is **not** the same as live, and using it for both labelled an
unreleased generation as latest while an older version was the one everyone else could see. Say
which version is `live` (newest with `published_at`), and say `unpublished` outright for one that
has never been released. See the `library-section-design` skill for the draft model behind this.

## Scrolling inside flex columns

`min-h-0` on every scrolling flex child. A flex item defaults to `min-height: auto`, so it grows
to fit its content instead of shrinking — `overflow-auto` then has nothing to scroll and an
ancestor's `max-h` silently clips the bottom instead. The symptom is content cut off with **no
scrollbar at all**, which reads as a rendering bug rather than a layout one.

This bit `Dialog`'s body: tall dialogs (the Historical FMD comparison) lost everything below the
fold with no way to reach it. The chain has to be unbroken — panel `max-h-full` → body
`flex-1 min-h-0 overflow-auto` → content `h-full`.

## Global search

`GlobalSearch` in the header and `SearchPage` at `/search` both render `useSearchResults`
(`src/lib/search.ts`) — one matcher, one set of records, differing only in `limit`. Never
reimplement matching in a consumer: a hit that appears in the dropdown and not on the page (or the
reverse) is worse than no search.

- Results are grouped by record type and **capped per category**, not overall. Without a per-
  category cap, three hundred matching FMDs bury the one subproject you were looking for.
- The catalogue queries are gated behind first focus (`enabled`). Four heavy reads on every page,
  to power a box most visits never touch, is a real cost.
- Search matches over the TanStack caches the catalogues already fill, so nothing surfaces that RLS
  wouldn't have shown on the screen it links to.
- A record with no subproject is programme-wide: it passes a **program** filter and fails project
  and subproject ones. The Golden FMD is genuinely in scope for the programme, but "what's in Wave
  1A" must not return something that is in no wave.

### Toolbar controls are quiet until they are doing something

A toolbar row recedes behind the data. `ToolbarSearch` and an inactive `MultiSelectFilter` are
transparent — no border, no fill, muted text — and take a border and fill only once they hold a
value. **A `Select` in that row must match**: pass `quiet` while it sits at its default.

The Field Mapping grouping select had a permanent border and white fill, which made the quietest
control in the row the loudest thing on screen while doing the same job as the filters beside it.

Label it the way the filters are labelled too — `Group: None`, matching `Class: All`. The old
labels repeated "grouping" in every option and the longest ran to 37 characters, which is what
made the control twice the width of its neighbours.

## Letter case

Two registers, and they are not interchangeable:

| Element | Case | Examples |
|---|---|---|
| Page titles (`PageHeader`) | **Title Case** | Field Mapping · Job Monitor · Program Settings |
| Tabs — routed **and** hand-rolled | **Title Case** | Staging Area · Post-Load Checks · Health Check · Where-Used |
| Pane and card titles | **Sentence case** | Auto review (AI) · Version details · My open items |
| Buttons | **Sentence case** after the first word | Export to Excel · Review changes… · Save to draft |
| Column headers | **UPPER**, via `text-2xs` + `tracking` | SRC_FIELD · MAPPING_TYPE |
| Group labels / eyebrows | **UPPER** | SIZE · COVERAGE · OUTSTANDING |

**A hyphenated tab capitalises after the hyphen** — `Post-Load Checks`, `Where-Used`. The routed tab
strips were already consistent; the FMD viewer's hand-rolled tabs were not ("Health check",
"Where-used"), because a tab written as inline JSX doesn't sit next to its siblings in a list where
the mismatch is obvious. **Check hand-rolled tabs against `nav.ts`, not against each other.**

Descriptions are full sentences and end in a period. Tooltips and hints are sentences too.

## Guards live in their own skill

Unsaved-change guards, destructive-action confirmation and input validation are cross-cutting and
are documented in `app-guards`. Load that before adding a form, an editable surface or a delete.

## Toasts

`toast.success` is green and means **the thing you asked for is done**: saved, generated,
exported, published. `toast.info` is blue and means *here is what happened instead* — where an
edit went, why a control is waiting, what to do next. `toast.error` is failure.

Reach for `info` whenever the message's job is to redirect an expectation rather than confirm one.
Reporting "your changes are collecting in a draft" in green read as "published", which is the
opposite of what the sentence says: the colour answered a question before the words could.

## Breadcrumb and the header bar

The trail sits in `AppShell`'s `<main>`, **above the page title** — not in the header bar. Beside
the subproject switcher the two restated the same project and subproject names, and the trail had
to truncate to fit next to a control already showing its first half.

- The header bar is for controls that CHANGE something: the subproject switcher, the environment
  pill, the account menu. Nothing that merely reports state belongs there.
- `Breadcrumb` carries its own `mb-2`. Don't wrap it in a spacing div — it renders nothing on the
  subproject picker, and a wrapper would leave a gap where no trail exists.
- The last crumb is `text-text`, **not** bold. The page title directly below is the strongest thing
  on screen and usually says the same word; bolding both made them read as competing headings.

## Toolbar

`<Toolbar>` is the action row between a `PageHeader` and a list. Every list screen used to
hand-roll it, and the copies drifted: three rebuilt the search input inline (keeping a permanent
border the shared `ToolbarSearch` had already dropped), and screens that filtered without a Clear
filters button left no way out of an over-narrowed list.

```tsx
<Toolbar
  search={{ value: query, onChange: setQuery, placeholder: 'Search rules…' }}
  onClearFilters={hasActiveFilters ? clearFilters : undefined}
  count={filtered.length} noun="rules" selectedCount={selected.size}
  actions={<Button variant="quiet" size="sm" …/>}
>
  <MultiSelectFilter … />
</Toolbar>
```

- The order is fixed by the component, not the caller: search → filters → Clear filters → count →
  `ml-auto` actions. `search` is a config object rather than a slot precisely so nothing can go
  before it and nobody can hand-roll the input.
- `count`/`noun` are formatted centrally — every screen gets the same thousands separator and the
  same ` · N selected` suffix.
- `spacing="none"` when the parent is a flex column with its own `gap`; otherwise the toolbar
  carries its own `mb-3`.

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

### A sidebar item must never leave the open project

Every `NAV_GROUPS` entry's `to` is **relative and resolves under
`/pg/:programId/sp/:subprojectId/`**, with an optional `standalone(programId)` fallback used only
when no project is open. Never write an absolute `to`, and never walk up with `../`.

Both mistakes shipped and produced the same bug — clicking the item threw you out of the project,
losing the sidebar, the breadcrumb, the subproject switcher and Back:

| Item | Was | Now |
|---|---|---|
| Program Settings | `'../../settings'` — walks up, drops the subproject | `'settings'` + standalone |
| Connections | `'/systems/connections'` — absolute, leaves everything | `'connections'` + standalone |

The fix pattern is the one Library and Program Admin already used: **mount the same screen twice**,
once standalone and once under `sp/:subprojectId`, in `router.tsx`. These stay program-scoped
screens; what the nested mount preserves is the URL context around them.

A page mounted both ways must read its scope from the **URL first**, falling back to
`useDefaultProgram()`. `ConnectionsPage` only ever existed standalone, so it always used the default
program — nested inside program B it would have shown program A's connections.

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

### Every custom dropdown dismisses itself

A native `<select>` is closed by the browser. **Anything you build yourself — a menu, a popover, a
filter, a switcher — must use `useDismiss` (`src/components/useDismiss.ts`),** which closes it on
outside click and on Escape.

```tsx
const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
return <div ref={ref} className="relative">…trigger…{open && <div>…panel…</div>}</div>;
```

This is not optional and not a nicety. Before the hook existed, the four header dropdowns (app
switcher, subproject switcher, environment, avatar) never closed at all — two could sit open at
once, overlapping — while three others each hand-rolled the same listener, only one of which handled
Escape.

Three ways to get it wrong:

- **The ref goes on the wrapper containing BOTH trigger and panel.** On the panel alone, clicking
  the trigger to close reads as an outside click, so it closes and instantly reopens.
- **It listens on `mousedown`, not `click`.** A click fires after mouseup, so a menu closing on click
  is still open while the press lands on whatever is underneath it.
- **Dismiss must fully close.** `GlobalSearch` also clears its query and blurs the input; Escape
  leaving it closed-but-focused is not closed.

**For row and card actions, reach for `Menu` (`src/components/Menu.tsx`) rather than building a
popover.** It is a `⋯` button plus a list of actions, dismissal already built in, `danger` for
destructive entries, and it closes before running an action so a dialog never opens behind an open
menu. Three or four naked icon buttons on a row compete with the data; one `⋯` does not.

Always-visible overlays (a diagram legend, a floating toolbar) are not popovers and need none of
this.

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


## 19a. Tab strips: two traps, both shipped

**`overflow-x-auto` on a tab strip creates a vertical scrollbar.** CSS promotes the other axis from
`visible` to `auto` as soon as one axis is not `visible`, so the 1px that each tab's `-mb-px` hangs
below the content box is enough to raise a scrollbar on a 40px-tall row. Tab strips **wrap**; they do
not scroll. If a strip genuinely needs horizontal scrolling, the overhang has to move off the tabs
first.

**The `-mb-px` must live on whatever the bordered row actually is.** In the FMD grid the tabs sat in
an `items-center` wrapper with `overflow-hidden`, so they were centred against a row made taller by
the 32px icon buttons beside them, and their own overhang was clipped by the wrapper before it could
reach the row's border — the tabs looked lifted, with a hairline gap beneath. The fix is
`self-stretch items-end -mb-px` on the wrapper and a plain `border-b-2` on the tabs: the overhang
belongs to the element nothing clips.

## 19a2. An edit toggle changes its icon: pencil in, check out

Anywhere a control puts a row, section or grid **into** edit mode, the same control takes it out —
and it must not still look like a pencil while it does. A pencil that stays a pencil gives the reader
no way back: the exit looks identical to the entrance, and the only signal the thing is editable at
all is the inputs themselves.

`EditToggle` (`src/components/EditToggle.tsx`) is the shared control. Pencil → **Check**, and while
editing it takes `text-blue bg-blue-pale` so the active row is visible without reading it.

**Check, not a floppy disk.** Every editable surface in DMS persists as you go — `PersonSelect`
writes on change, grid cells write on blur, the section editor writes on change — so a save icon
would promise an action that does not exist and imply the edit is unsaved until clicked. The check
says what the button does: finish. The tooltip carries the rest ("changes are already saved").

If a surface ever genuinely defers its writes, it needs a real Save **button** with a label and a
disabled state, not this icon wearing a different glyph.

The FMD grid used an eye here, meaning "view" rather than "done"; it was the one exit icon that
differed and is now aligned.

## 19b. Radius — three steps, three jobs

| Token | px | Use for |
|---|---|---|
| `rounded-xs` | 4 | Micro chips and inline markers inside a dense grid, where 8px reads as a pill |
| `rounded` | 8 | **Controls** — buttons, inputs, selects, icon buttons, non-pill tags |
| `rounded-lg` | 12 | **Containers** — cards, panes, dialogs, table shells, diagram nodes and bands |
| `rounded-pill` / `rounded-full` | — | Status pills; avatars and dots |

**Thirteen distinct radii shipped** before this: the theme defined six steps between 6px and 12px
(`sm 6 / DEFAULT 8 / md 9 / lg 10 / xl 11 / 2xl 12`), most of them 1px apart, and call sites invented
`rounded-[3px]`, `[5px]`, `[7px]` and `[11px]` on top. A 1px difference is invisible as hierarchy and
very visible as inconsistency — the same defect the type scale had before it collapsed to four sizes,
and the same fix.

`sm`, `md`, `xl` and `2xl` still resolve, **aliased to the nearest survivor** so old markup renders
correctly. They must not appear in new code, exactly like the retired type sizes.

**Never write an arbitrary radius.** `rounded-[Npx]` in a component is how the last scale rotted.

## 19c. One label per intent

Two controls that do the same thing must not carry different words. "Generate FMD" and "Generate a
new one" are one intent and are allowed to differ only because they sit in different sentences —
"Create FMD" as a third variant would not be. Before adding an action, grep for the verb.

Buttons are **sentence case after the first word** (§ Letter case). `Add Section`, `Generate Rule`
and similar Title Case labels are the common breach, because a button written as inline JSX has no
sibling list to look inconsistent against.

## 20. Accessibility is part of the visual spec, not a later pass

Audited 2026-08-28 against the shipped tokens and components. These are measurements, not opinions.

### Contrast

Text pairs **pass** and must stay passing — check any new token pair before adding it:

| Pair | Ratio | Needs |
|---|---|---|
| `--text` on `--surface` | 16.1 : 1 | 4.5 |
| `--muted` on `--surface` | 4.99 : 1 | 4.5 |
| `--muted` on `--surface-2` | 4.61 : 1 | 4.5 |
| `--blue` on `--surface` | 8.37 : 1 | 4.5 |
| dark `--muted` on dark `--surface` | 6.47 : 1 | 4.5 |

`--muted` on `--surface-2` has only 0.11 of headroom. **Do not darken `--surface-2` or lighten
`--muted`** without recomputing — that pair is one nudge from failing, and it is the single most
common combination in the app (every count, timestamp and helper line sits on a hover fill).

**Known failure, not yet fixed:** `--line-strong` is the form-control boundary and measures
**1.39 : 1** light / **1.66 : 1** dark against a 3:1 requirement for UI component boundaries
(WCAG 1.4.11). Input and select edges are effectively invisible to a low-vision user. Reaching 3:1
needs roughly `#8a92a1` light / `#6f7787` dark, which visibly darkens every control in the app — a
deliberate design decision, so it is recorded here rather than changed quietly. Raise it before
adding more controls that depend on that border to read as editable.

### The rest

- **Every icon-only control needs an `aria-label`.** The visual is a glyph; the accessible name is
  the only thing that says what it does. `Button` takes it through; a bare `<button>` must set it.
- **Colour is never the only signal.** DMS already enforces this visually (§1 — colour means state),
  and it is the same rule: a status that reads as red must also carry a word or an icon.
- **Anything clickable is a `<button>` or `<a>`** (§7). A `<div>` with `onClick` has no role, no
  focus ring and no keyboard activation.
- **Tab order follows visual order.** Portalled panels (`Menu`, `ObjectPicker`) are the usual place
  this breaks.
- **Live regions**: `Toast` announces through `role="status"` / `aria-live="polite"` and must not
  steal focus. Form errors that appear after submit need the same treatment — see §23.

## 21. Motion

DMS had **38 transition/animation usages and zero `prefers-reduced-motion` handling** until a global
block was added to `tokens.css`. That block is the floor, not a licence to skip thinking:

- **Respect reduced motion.** The global rule collapses durations to near-zero. Never re-enable an
  animation with `!important` or an inline style that outruns it.
- **Animate `transform` and `opacity` only.** Animating `width`, `height`, `top` or `left` forces
  layout on every frame and causes the jank that reads as a cheap interface.
- **Motion must mean something** — a cause and its effect, a spatial relationship. Decorative
  movement on an enterprise data screen reads as unserious, which is precisely the "vibe-coded"
  impression to avoid.
- **Exit is faster than enter** (~60–70%). A dialog that takes as long to leave as to arrive feels
  unresponsive.
- **One or two moving elements per view.** Everything animating at once is the single loudest
  AI-generated tell.
- **No animation may shift layout.** If it reflows, it is a bug, not a transition.

## 22. Z-index — use the scale, not a bigger number

Eight ad-hoc values shipped (`z-[1]`, `z-[2]`, `z-10`, `z-20`, `z-30`, `z-[60]`, `z-[1000]`)
alongside `Dialog`'s computed `900 + depth*10`. **`z-[1000]` outranks every dialog**, so anything
carrying it renders over a modal it should sit under. Stacking bugs of this kind are found by a
user, never by the compiler.

| Layer | Range |
|---|---|
| In-flow lift (sticky header, raised cell) | `z-10` |
| Popover / dropdown / menu inside a page | `z-20`–`z-30` |
| Dialogs and their scrims | `900 + depth*10` — owned by `Dialog`, never hand-set |
| Toasts | above dialogs, owned by `Toast` |

Never reach past `z-30` in a feature component. If something is covered, the fix is where it sits in
the tree, not a larger number.

## 23. Forms, validation and feedback

`app-guards` owns unsaved-work and destructive confirmation. This is the rest:

- **Validate on blur, not on keystroke.** Marking a field invalid while someone is still typing it
  is the most common way a form feels hostile.
- **The error goes below its field**, tied with `aria-describedby`. An error only at the top of a
  long form leaves people hunting.
- **After a failed submit with several errors**, focus a summary at the top that links to each
  invalid field, and keep the inline errors as well. With one error, focus that field.
- **A visible label per input** — never placeholder-only. Placeholders vanish exactly when someone
  needs to check what they typed.
- **Read-only is not disabled.** Read-only content is selectable and reachable; disabled means
  "not available now" and is skipped. Rendering an un-editable value as disabled hides it from
  screen readers entirely.
- **Bulk and destructive actions offer undo** where the write is reversible — an undo toast beats a
  confirm dialog for anything that can be put back.
- **Async submits show progress, then an outcome.** `Button` disabled + a verb in the label
  (`Saving…`) is the house pattern.

## 24. Loading, empty and error are three different states

A screen that only handles "has data" is not finished. Every data surface needs all four:

| State | Treatment |
|---|---|
| Loading | Reserve the space the content will take. Skeletons over spinners for waits above ~1s |
| Empty — nothing exists | `EmptyState` with the action that creates the first one |
| Empty — filters excluded it | `ListEmptyState` with `filtered` + Clear filters (§ Library skill) |
| Failed | The reason plus a retry — `QueryErrorNotice`, never a silent blank |

**Reserve space before content arrives.** A list that renders at zero height and then jumps to full
height moves everything under it; that shift is what makes an interface feel unbuilt. DMS has one
skeleton in the entire app — new async surfaces should not copy that.

## 25. Data display

DMS is a data product, so these carry more weight here than the visual rules above.

- **Tabular figures for anything in a column** — `tabular-nums` on counts, versions, dates, KPIs.
  Proportional digits make a column of numbers visibly ragged.
- **Prefer wrapping to truncation.** When you must truncate, use ellipsis **and** expose the full
  value through `title` — a truncated ident nobody can read is worse than a wrapped one.
- **Long identifiers reflow, they don't break mid-token.** Use `overflow-wrap: anywhere` on URLs,
  GUIDs and source idents; never `word-break: break-all` on prose.
- **Sortable columns announce their state** with `aria-sort`. `Table` owns sorting, so fix it there
  once rather than per screen.
- **Lists are paginated, not virtualized.** `Table` pages at 25 by default, which is why a 331-row
  catalogue stays responsive with no virtualization anywhere in the app. If you ever render an
  unpaginated list past ~50 rows, that decision needs a reason.

## 26. Charts and diagrams

- **A legend is required** and sits with the chart, not below a scroll fold.
- **Never encode meaning in colour alone** — pair it with a shape, a pattern or a label. The
  dependency diagram's `layerTheme` is the documented exception to §1's colour rule, and it still
  prints `L{n}` on every node precisely because the colour alone is not the message.
- **Grid lines stay quiet** (`--line`), so they never compete with the data.
- Charts need the same **empty, loading and error** states as any other data surface (§24) — a bare
  axis frame with no series is an error state pretending to be a result.
- **Exact values are reachable** on hover *and* by keyboard, not hover only.
- Respect reduced motion: entrance animation is optional, the data is not.

## Maintaining this skill

Update this file in the same change whenever a shared visual decision changes — a new token, a
retired component, a resolved defect. Delete entries that stop being true; a stale system doc is
worse than none.

Companions: `library-section-design` and `scope-section-design` for section layout rules,
`app-guards` for guards and validation behaviour, `brand-themes` for the theme layer, and
`references/ui-review-checklist.md` for the pre-delivery pass.

## 27. Demo and seed data is real-looking, or it is a tell

Placeholder content is the fastest way to make a serious product look unserious:

- **No generic people.** "John Doe", "Jane Doe", "Test User" — use plausible, locale-appropriate
  names. DMS is clean today; keep it that way when adding fixtures.
- **No round fake numbers.** `99.99%`, exactly `50%`, `1234567`. Real data is untidy.
- **No placeholder brands.** "Acme", "Nexus", "SmartFlow".
- **No filler verbs in copy.** "Elevate", "Seamless", "Unleash", "Next-Gen", "Revolutionize",
  "Empower". Every label says what actually happens (§ Writing the copy in the checklist).
- **No lorem ipsum**, ever, including in a screen you think nobody will look at.

### On importing external design skills

Rules from an outside source are merged **into this file, rewritten against what DMS actually
does** — never installed alongside it as a second authority. Two design skills disagreeing is worse
than one, and a generic rule ("use a 4/8pt spacing scale", "pick a palette for your industry") is
noise next to a committed token set and a client brand theme.

The `ui-ux-pro-max` skill (nextlevelbuilder) was folded in this way on 2026-08-28: §20–26 above and
the checklist come from its stack-agnostic rule set. Its palette/style/font **generator** was
deliberately not adopted — DMS has `tokens.css`, `tailwind.theme.ts` and Theme 1 already, and
generating a visual direction over them would fight the system rather than serve it. Its
`pro-rules.md` is explicitly scoped to native iOS/Android UI (safe areas, haptics, 44pt touch
targets, ripples) and does not apply to a desktop web app.

`taste-skill` (Leonxlnx) was folded in on 2026-08-29 — §19b, §19c and §27. **Its own §13 says it is
not for "dashboards / dense product UI / admin panels", data tables, or multi-step wizards**, which
is the entirety of DMS, so the bulk of it was correctly left out: hero composition, eyebrow limits,
bento rhythm, zigzag caps, the three aesthetic dials, the design-system chooser (Fluent / Carbon /
Polaris), and the font pools. What survived is the part that is about craft rather than about
landing pages: shape consistency, one-label-per-intent, and honest demo data.

**Its em-dash ban was deliberately NOT adopted.** The rule exists because unbroken em-dash use reads
as machine-written prose. It is a reasonable heuristic for marketing copy and a bad fit here: this
codebase's comments and UI copy use the em-dash as ordinary punctuation throughout, a blanket
find-and-replace would damage hundreds of sentences, and consistency of voice is worth more than
conformance to someone else's tell-list. Judge new copy on whether it reads as written by a person,
not on a character ban.

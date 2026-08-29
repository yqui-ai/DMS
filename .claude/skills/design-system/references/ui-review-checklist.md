# UI review checklist — the pre-delivery pass

Run this before delivering any UI change in DMS. It is scoped to **desktop web** (React + Tailwind +
Supabase), which is what DMS is. Touch targets, safe areas, haptics and platform gesture rules from
mobile checklists do not apply here and are deliberately absent.

Adapted from `ui-ux-pro-max` (nextlevelbuilder), rewritten against this repo's components and tokens.
The parent `SKILL.md` holds the rules; this is the pass that catches them being missed.

Work top to bottom. The order is by how expensive the defect is to find later — an accessibility
failure is found by a user, a token failure is found by a theme toggle, a spacing failure is found
by looking.

---

## 1. It compiles and it is honest

- [ ] `npm run typecheck` passes (`tsc -b` — note `tsc -p .` silently checks nothing here)
- [ ] `npm run lint` introduces no new warnings in the files you touched
- [ ] No `console.log` or commented-out markup left behind
- [ ] Nothing on screen is non-functional. A control that ignores a click teaches people the working
      ones can't be trusted — ship the behaviour or don't ship the control

## 2. Tokens and theme

- [ ] **No hex literal in any component** — every colour comes from a Tailwind token (§1)
- [ ] **Viewed in dark mode**, not inferred from light. Toggle it and look
- [ ] Borders and dividers are visible in *both* themes
- [ ] Colour encodes state, never category (§1). A categorical attribute is plain text
- [ ] Any new token pair meets 4.5:1 for text, 3:1 for control boundaries — compute it, don't eyeball

## 3. Type and spacing

- [ ] Only the four sizes: `text-2xs` / `text-sm2` / `text-md` / `text-xl` (+ `kpi`)
- [ ] **At most two text roles on this screen** (§12). More than one `text-md` element means one is wrong
- [ ] Every control in a toolbar row is the same height — no per-call-site padding overrides
- [ ] Density is graded (§4): counts quietest, exactly one filled primary action per row
- [ ] Borders use the right token for the job (§13) — areas, row rules, control outlines
- [ ] Nothing is boxed inside something already boxed

## 4. Keyboard and screen reader

- [ ] **Tab through the whole screen.** Order matches visual order; nothing is unreachable
- [ ] Focus ring visible on every stop, and never clipped by an overflow container
- [ ] Every icon-only control has an `aria-label`
- [ ] Everything clickable is a `<button>` or `<a>`, never a `<div>` with `onClick`
- [ ] Escape closes any popover, menu or dialog you added (`useDismiss` — §14)
- [ ] Sticky headers and footers do not cover the focused element
- [ ] Anything that appears after an action (errors, results) is announced — `role="status"` or
      `role="alert"`, without stealing focus
- [ ] Meaning is never carried by colour alone

## 5. States — all four, every data surface

- [ ] **Loading** reserves the space the content will occupy; no jump when it arrives
- [ ] **Empty because nothing exists** → `EmptyState` with the creating action
- [ ] **Empty because filters excluded everything** → `ListEmptyState` with `filtered` + Clear filters
- [ ] **Failed** → the reason plus a retry (`QueryErrorNotice`), never a silent blank
- [ ] Async actions disable their trigger and show a verb (`Saving…`), then an outcome
- [ ] Toast severity matches meaning: green = done, blue = here's what happened instead, red = failed

## 6. Forms

- [ ] Visible label per input — never placeholder-only
- [ ] Validation fires on blur, not on keystroke
- [ ] Errors sit below their field and are tied with `aria-describedby`
- [ ] A multi-error submit focuses a linked summary; a single error focuses that field
- [ ] Read-only values are read-only, not `disabled`
- [ ] Unsaved work is guarded via `Dialog`'s `unsavedWarning`, not a bespoke handler (`app-guards`)
- [ ] Irreversible actions confirm; ordinary saves do not

## 7. Layout

- [ ] **The page body does not scroll horizontally** at 1366px
- [ ] Every scrolling flex child has `min-h-0` and the chain to it is unbroken (§ Scrolling)
- [ ] No `max-h-[Nvh]` / `h-[Nvh]` standing in for a real flex chain
- [ ] Wide content (tables, diagrams, code) scrolls inside its own container
- [ ] Sticky/fixed bars are opaque and reserve space for the content beneath them
- [ ] `z-index` stays within the scale (§22) — nothing past `z-30` in a feature component

## 8. Motion

- [ ] Reduced motion respected — nothing re-enables an animation past the global rule
- [ ] `transform` and `opacity` only; never `width`, `height`, `top`, `left`
- [ ] No animation causes a layout shift
- [ ] At most one or two moving elements in a view
- [ ] Exit is faster than enter

## 9. Data display

- [ ] `tabular-nums` on every column of figures
- [ ] Truncated text exposes the full value via `title`
- [ ] Long idents and GUIDs reflow rather than breaking mid-token or overflowing
- [ ] Sorting uses the shared `Table` — not an eleventh hand-rolled `<table>`
- [ ] `rowClickable` passed whenever only some rows open something
- [ ] Any unpaginated list past ~50 rows has a stated reason

## 10. Charts and diagrams

- [ ] Legend present, adjacent to the chart
- [ ] Meaning is not colour-only — shape, pattern or label as well
- [ ] Grid lines quiet enough not to compete with the data
- [ ] Empty, loading and error states handled (§24) — never a bare axis frame
- [ ] Exact values reachable by keyboard, not hover alone

---

## Anti-slop pass — the last look

These are the tells that make an interface read as generated rather than designed. None of them
show up in a typecheck.

- [ ] **No emoji used as an icon.** Lucide only, one family throughout
- [ ] **Consistent icon size and stroke** within a hierarchy level; no mixing filled and outline
- [ ] **One icon, one destination** — grep `nav.ts` before adding a nav icon (§8)
- [ ] **Nothing is centred that should be aligned.** Centred body text and centred forms are the
      most common generated-looking layout
- [ ] **No decorative gradient, glow, or shadow** that carries no meaning. DMS uses inset rings and
      flat surfaces; a drop shadow on a table row is not house style
- [ ] **Radii are consistent** — pick the shared value, don't invent a third
- [ ] **Copy is specific.** "Could not save the mapping." beats "Something went wrong." Every
      button says what happens; every error says what to do next
- [ ] **No filler.** Placeholder counts, lorem text, fake avatars and "Coming soon" panels do not
      ship — a screen with nothing to show gets a real empty state
- [ ] **Numbers agree.** A count in a header and the rows beneath it must be the same number; two
      views of one fact disagreeing is the single fastest way to lose trust in a data product
- [ ] **The screen answers one question.** If you cannot say in a sentence what it is for, the
      layout will not say it either

## Shape and label pass (from taste-skill)

- [ ] **No arbitrary radius.** `rounded-xs` / `rounded` / `rounded-lg` / `rounded-pill` only — never
      `rounded-[Npx]`. Mixed radii inside one screen is the tell.
- [ ] **One label per intent.** Two buttons that do the same thing say the same thing. Grep the verb
      before adding an action.
- [ ] **Button labels are sentence case** after the first word, and fit on one line.
- [ ] **Every button's text passes contrast against its own fill** — including quiet and ghost
      variants over tinted rows.
- [ ] **Demo and seed data looks real** — no "John Doe", no `99.99%`, no "Acme", no lorem.
- [ ] **No filler verbs**: elevate, seamless, unleash, next-gen, revolutionize, empower.
- [ ] **Edit toggles swap their icon** — pencil to enter, check to finish (`EditToggle`), never a
      pencil that stays a pencil while its row is full of open inputs.

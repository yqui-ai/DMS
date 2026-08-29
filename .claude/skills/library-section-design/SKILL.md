---
name: library-section-design
description: The design contract for the Library section (Migration Object, Field Mapping, Rule, Cross Reference) — the four catalogue screens, their shared toolbar/table/dialog anatomy, the FMD viewer's tab layout, backend query-key and RLS conventions, and the known inconsistencies. Load this before changing anything under src/features/library/, the Library query hooks, or any Library list column. UPDATE THIS FILE whenever the Library design changes.
---

# Library section design

Library is DMS's four **read-mostly, program-wide catalogues**. Everything here is "what exists
across every subproject I can see", as opposed to Scope/Rules/Staging which are scoped to one
subproject. All four screens are reachable two ways (`/library/*` standalone, and nested under a
program) and render the exact same component — see `src/app/router.tsx`.

| Screen | Route | Deep view | Component | Query hook | Table |
|---|---|---|---|---|---|
| Migration Object | `library/objects` | `/:objectId` | `LibraryObjects.tsx` | `useMigrationObjects` | `migration_objects` |
| Field Mapping | `library/fmds` | `/:fmdId` | `LibraryFmds.tsx` | `useLibraryFmds` | `fmds` + `fmd_versions` |
| Rule | `library/rules` | — | `LibraryRules.tsx` | `useLibraryRules` | `rules` |
| Cross Reference | `library/xref` | `/:xrefId` | `LibraryXref.tsx` | `useLibraryXrefTables` | `xref_tables` + `xref_versions` |

Both mounts come from one `LIBRARY_ROUTES` array in `router.tsx` — never write the list twice.

## Screen anatomy — every Library screen follows this, in this order

1. `<PageHeader title description />` — title is **singular** ("Field Mapping", "Rule", "Migration
   Object"), description is always "… across every subproject you have access to."
2. `<Toolbar>` — **never hand-roll this row.** It fixes the order, because the order is the
   convention: search → filters → escape hatch → how many rows survived → what you can do with
   them. Props: `search` (a `{value, onChange, placeholder}` config, not a slot — so nothing can
   precede the search box and nobody can rebuild the input inline), `onClearFilters` (pass
   `hasActiveFilters ? clearFilters : undefined`), `count` + `noun` + optional `selectedCount`,
   `actions`, and `spacing="none"` when the parent is a flex column with its own `gap`.
   The filters are its children: one `<MultiSelectFilter>` per facet — options from the data where
   they're open-ended (Object's Component/Category), from a module-level `const` where they're a
   fixed domain (`CLASS_OPTIONS`, `TYPE_OPTIONS`) — then a grouping `<Select>` last if the screen
   has one (only Field Mapping does). Actions are `variant="quiet"` first, `variant="ai"` last.
3. `<ListEmptyState>` when `!isLoading && filtered.length === 0`, else `<Table>`.
   **Never `EmptyState` directly on a filtered list** — it can't tell "nothing exists" from "your
   filters excluded everything", and shows a create-prompt to someone who just typed a search term.
   `ListEmptyState` takes `filtered={hasActiveFilters}` (which every screen already computes for its
   Clear filters button) and swaps the message and the action.
4. All dialogs rendered unconditionally at the bottom, controlled by a `null`-able state prop.

### Shared components (never hand-roll these)
`Table`, `Tag`, `Button`, `Select`, `Segmented`, `Pane`, `Toolbar`, `MultiSelectFilter`,
`PageHeader`, `EmptyState`, `Dialog`, `ConfirmDialog`. (`ToolbarSearch` is `Toolbar`'s to render —
call it directly only inside a dialog, as the review tab's finding search does.)

**Typography is fixed:** every list body cell is `text-sm2`, set once on `Table`'s `<table>`. Do
not add per-column size overrides — lists must look identical whether or not they contain tags.
Column headers are `text-2xs`. Technical identifiers are always
`font-mono`; IDs/versions/references specifically.

**Row clicks navigate.** A row's deep view is a URL, so `onRowClick` is
`(r) => navigate(to('fmds', r.id))`, where `to` is `useLibraryPath()` — never a `setState` that
holds a dialog open. If only *some* rows open something, you must also pass `rowClickable` —
`Table` styles every row as clickable otherwise, producing rows that hover and show a pointer but
do nothing (this was a real bug in Library > XREF).

### Deep views are routes, not dialog state

The three deep views live in `LibraryDeepViews.tsx` (`ObjectRoute`, `FmdRoute`, `XrefRoute`), are
mounted as child routes, and render through the list screen's `<Outlet />`. Each resolves its id
against the list's own query — a cache read, since the list above it already populated that key.

This is not just addressability. The FMD viewer used to be mounted in **three** places (both
catalogues and the object dialog), so three copies of its state could disagree; now there is one.

Rules that follow from it:
- **Build Library URLs with `useLibraryPath()`**, never relative `..` segments. The same screens
  are mounted at two depths, and a relative hop that's right at one is wrong at the other.
- **Anything that opens a deep view navigates to it** — including from inside another deep view.
  The object dialog's "Standard FMD" link goes to that FMD's page rather than stacking a second
  viewer; Back returns to the object.
- **Don't re-select a previous id to go "back".** Every hop is a real history entry, so
  re-selecting pushes a third one that only looks like going back. `LibraryObjectDialog` takes a
  separate `onBack` for this, wired to `navigate(-1)`; its internal `history` array is only there
  to decide whether a Back affordance belongs in the header.
- **State that belongs to the record goes in the route wrapper**, not the row click — `markFmdSeen`
  lives in `FmdRoute` so a deep link dismisses the "New" badge exactly like a click does.
- The breadcrumb reads only the first two Library segments, so an id never becomes a crumb.

## Field Mapping — the deepest screen

### The list carries only what you scan a list for

Columns: **ID · Name · Type · Version · Changed** (plus the selection checkbox). That's it.

Class, Reference, Golden FMD version and Reference FMD version live in the viewer's **Version
details** pane instead. They're stable attributes of the document, not signals — eleven columns
made the row a form to read rather than a line to scan, and most of them held the same value on
every row.

Two things survive as tags on the Name because they're *actionable*: `New` / `New Version`, and
`Outdated` when the FMD is behind the Golden template or its Standard FMD. The version NUMBER it's
behind is a detail for after you've opened it.

Version and Status merged: the number is the live (published) version, and a `Draft` tag appears
beside it only when there is unreleased work. Active is the resting state and earns no badge.

`fmds` rows are one of three `type`s, and type drives almost everything:

- **Golden** — singleton (DB trigger `fmd_display_id()` raises on a second one), program-wide
  (`subproject_id is null`), class Global. Holds a `goldenStructure` (sections → fields), edited
  only in `GoldenFmdDesignerDialog`. **Never deletable.**
- **Standard** — one per migration object, program-wide, generated from Golden. **Never deletable.**
- **Custom** — generated from Golden and aligned to the object's Standard FMD version. The only type
  with Mapping Review and field notes. **Not one per subproject** — see below.

### A Custom FMD is ASSIGNED, not owned

`subproject_objects.fmd_id` (migration **0045**) records which FMD a subproject uses for an object.
**Many rows may point at one FMD — that sharing is the reuse.**

`fmds.subproject_id` still exists and still records where a document was **authored**; it is what
`reference` (PRG-PRJ) and the Global/Local class derive from. It must **not** be read as "the only
place this is used". Reading it that way is what made an FMD written in Wave 1A invisible to Wave 1B
even after being assigned there.

The old model gave every subproject its own copy of the same mapping for the same object —
duplicates nobody reconciled. Where-Used, FMD Mapping and `useAssignableFmds` all read the
assignment; only the Library's reference column reads `subproject_id`.

### Every FMD states its object

`VersionDetailsPane` shows **Object** above Class and Reference, and `useAssignableFmds` carries
`objectIdent` onto every candidate row. This is not decoration: assignment matches an in-scope
migration object to the FMDs written for that same object, so the ident is the key the whole flow
turns on and the Assign list searches by it. A version pane that showed Class and Reference but not
which object the mapping was for omitted the one field everything else keys on.
**There is no 'Historical' type.** It was retired in migration 0031: the converter parses an
uploaded workbook in the browser and writes Custom FMDs directly, so the intermediate record was
never persisted and the type had no way to exist. Lineage back to the source file lives on the
Custom FMD as `hist_source_name` / `hist_plant` — that's what re-upload matching and the
sibling-plants view key on, and it stays.

Type renders as **plain text**, not a coloured tag. Colour is reserved for state that needs
attention (see the `design-system` skill) — a categorical attribute on every row spends the colour
budget without saying anything.

### `FmdVersionHistoryDialog` layout (as of 2026-08-26)

One `size="win"` dialog, used by Golden and Custom. **A single version selector in the dialog
header drives every tab** — there is one answer to "which version am I looking at".

- **Health check tab** — FIRST, and the default for any FMD with data to analyse. Scope split,
  completeness, mapping mix with weighted build effort, rule quality, and open review work, as a
  headline strip over two panes (Checks, Composition). Everything is COUNTED — `analyseFmd()` in
  `src/lib/fmdHealth.ts` is pure and deterministic; the AI has its own pane and a health report
  nobody can reproduce by counting is one nobody can act on. Named pass/warn/fail checks rather
  than one invented score: a percentage needs weightings nobody agreed and tells you nothing about
  what to do next.
  **It always measures the LATEST version**, never the selected one — so the header hides the
  version selector while it is open, rather than showing a control it does not honour.
- **Field Mapping tab** — the selected version's data at *full dialog width*. Nothing else lives
  here. Renders one of: Golden structure view, the generated grid, the field-level detail view, or
  raw source/target/mapping sheets.
- **Versions tab** (labelled "Versions & Review" for Custom) — three panes side by side:
  `VersionDetailsPane` (left — who/when/state/comment/structures/based-on-Golden/owner),
  **Auto review (AI)**, and **Review points**. All three use the shared `Pane`, which is what keeps
  their headers on one baseline. The two review panes are separate, not a toggle —
  they're read together. There is deliberately **no version list here**: the header dropdown is the
  single version selector, and a second one was redundant.
- **Draft tab** — present only while an unpublished draft exists: the pending changes with
  checkboxes, and the only place Publish lives.
- **Where-used tab** — `fmd/FmdWhereUsedTab.tsx`. Three sections, in this order:
  **Used in** (always), **Generated from** (when built from a Golden version), **Referenced by**
  (Golden only), and **Same source file** only when `hist_source_name` is set.

### "Used in" means ASSIGNED, never "the object is in scope"

`useFmdAssignments(fmdId)` reads `subproject_objects.fmd_id`. **Do not build this from
`useObjectScopeUsage`.** That lists subprojects with the OBJECT in scope, which is an opportunity to
use an FMD, not usage of it — and building the tree from it made Where-Used report "used in 2
subprojects" for a document one of them had never assigned, while the Assign dialog called the same
FMD "unassigned". Two screens, two answers; the dialog was right.

The tree shows assignments **plus** the authoring subproject (`fmds.subproject_id`), and labels them
apart: `Assigned` vs `Written here, not assigned`. A subproject that wrote a document but never
adopted it is a real and useful state — it must not be counted as a user of it. Subprojects that
could adopt it are a footnote, never a branch.

### Where-used is a HIERARCHY, and it is built from flat queries

**Used in** renders Programme → Project → Subproject → Object as a tree, not a single chain, because
one document serves more than one place: a Standard FMD is the programme-wide document for its
object, and that object can be in scope in several subprojects across several programmes. A single
chain could only show one and would imply the others didn't exist.

**Never resolve placement with a nested PostgREST embed.** `subprojects(projects(programs(...)))`
returns null whenever RLS filters any level, silently — the tab shipped showing a correct object
beside three em-dashes. `hierarchy.ts` already documents the rule ("four requests rather than a
nested select, because RLS filters each level independently"); the tab reads `useHierarchy()` plus
`useObjectScopeUsage()` and joins in memory.

Two facts come from the CALLER, never re-fetched: the object (resolved from the catalogue the
dialog already loaded) and `programName`/`projectName`/`subprojectName`, which `useLibraryFmds`
already puts on the row. The row's names are the fallback that guarantees the owning branch renders
even when the hierarchy is loading or filtered.

Do **not** put the version list or comment back beside the mapping data — it was moved out
deliberately because the grid is wide and an object can have several structures.

### Multiple structures per object

A migration object sends **several structures**; a generated FMD version therefore has
`sheets.generatedTables: GeneratedTable[]`, one per structure. Anything rendering FMD data must
handle N structures:
- `GeneratedFmdTableView` → arrow-paged tabs, one per structure.
- `FieldDetailView` → receives **all** tables plus the open `structureId`; a structure `<select>`
  in the left panel switches structure (jumping to its first row, since a row index doesn't
  transfer between structures).
- The Versions tab lists the version's structures as `Tag variant="table"` badges.

### Section colour coding

Golden sections carry a palette key; resolve it through `colorByKey()` in
`src/lib/goldenFmdColors.ts` — **never hardcode hex**. Applied as inline styles (Tailwind can't
scan runtime class strings) and shared by the on-screen views and both Excel exports:
- table view → `band`/`bandText` for the merged section header row, `bg` for field headers
- field-level view → `bg` header strip, `border` card outline, `text` field labels, white body

### Marking a finding fixed

A finding carries `addressed?: { by, at }` — a person's claim that they have fixed it in the draft
and it is waiting to be published. Toggled from the Auto review pane; marked findings are hidden
by default behind an "N addressed" toggle, mirroring closed review points.

- **It is a claim, not a computed fact.** An edit to the cell a finding points at is not proof the
  edit was for that finding, so this is never inferred from pending changes.
- **Re-running the review is the real verdict.** `save()` appends a new run with fresh findings and
  no marks, so nothing carries a stale "fixed" into a run that still reports the problem.
- **Findings need `id`.** Set at creation; `findingKey(f, i)` falls back to coordinates plus array
  position for findings saved before ids existed, so key off the FULL list, never a filtered one.
- Writing this touches `sheets.mappingReviews` on a PUBLISHED version, which the freeze trigger
  allows because it strips the review keys before comparing (0029/0030). Anything else added under
  `sheets` that is not mapping content must be stripped there too.
- Not offered on the draft overlay (no row to write to) or while a review or publish is running
  (both rewrite the same `sheets`).

A finding with `rowIndex: -1` is about the whole COLUMN ("blank in all 33 rows"). It resolves
against no row, so the per-cell loop skips it — `reviewFindingsByTable` fans it out onto every
cell of that column afterwards, so it marks the cells like any other finding. A per-row finding on
the same cell is more specific and wins. Never mark the column header instead: findings belong on
the data they are about.

Review-finding highlights (`#fecaca` error / `#fed7aa` warning) sit *on top of* section colour and
take priority over the yellow changed-cell highlight (`#fef9c3`).

## Guards

The FMD viewer's editable surfaces, its version/draft safety rules and the Golden baseline are
enforced by rules documented in `app-guards`. Read that alongside this file before changing
anything editable here.

## Backend conventions

- **Reference is derived, never stored.** `formatLibraryReference(class, programCode, projectCode)`
  from the `subprojects → projects → programs` join. Global ⇒ "Program-wide", Local ⇒ `PRG-PRJ`.
- **Display IDs come from DB triggers**, never the client: `FMDGLD-/FMDSTD-/FMDCST-`,
  `RULESTD-/RULECST-`, `XREFGLD-/XREFGBL-/XREFLCL-`. Each has its own sequence. (`FMDHST-` was
  dropped with the Historical type in 0031.)
- **RLS** on every Library table follows one shape: visible if the row's subproject is in
  `current_wave_ids()` **or** `subproject_id is null` and the user has any membership. Program-wide
  (Golden) rows only work because of that second clause — copy it exactly for new tables.
- **Versioning**: see the `versioning-conventions` skill. Latest version is always derived from the
  child `_versions` table by `created_at desc`, never read off a column on the parent.
- **Query keys** — a write must invalidate *every* cache that reads the same table:

  | Table | Keys to invalidate |
  |---|---|
  | `fmds` | `fmds-all`, `fmds-library`, `golden-where-used`, `standard-fmd-links`, `fmd-versions/<id>`, `fmd-version-latest/<id>` |
  | `rules` | `rules/<subprojectId>`, `rules-all`, `rules-library` |
  | `xref_tables` | `xref-tables/<subprojectId>`, `xref-tables-library`, `golden-xref-summary` |

  Missing `rules-library` was a real bug (new/edited rules didn't appear in the catalogue).

## Known inconsistencies — deliberate or not yet addressed

Don't "fix" these silently; they're recorded so the next change is an informed one.

- **Only Field Mapping has grouping, multi-select and bulk export.** Rule/XREF/Object have no
  grouping; Object has selection (for Generate FMD) but no export.
- **Rule and XREF are placeholder screens.** Read-only lists pending a real build-out — don't treat
  their thinness as an oversight to fix piecemeal.
- **Rule has no detail view at all** — no `onRowClick`, so a rule row is a dead end.
- **Rule's "Version" column is a frozen literal.** `rules.version` is written once as `v1.0.0` at
  insert and never bumped; there is no `rule_versions` table. Building real Rule versioning was
  explicitly deferred by the user ("Rules later") — do not start it unprompted.
- **XREF has a designer + viewer for Golden only.** Standard XREF rows have no viewer; they're
  inert rows (correctly styled as such via `rowClickable`).
- **`useAllFmds` maps a narrow column subset** (no `owner`/`aiGenerated`/`hist*`). Fine for its
  Scope consumers; use `useLibraryFmds` if you need the enriched row.

## Review points & ownership (Custom FMDs)

"Review points" are the in-app equivalent of the comments column in an Excel FMD.

- **An FMD has no owner column.** `fmds.owner` was dropped in 0030; ownership is
  `subproject_objects.consultant`, read via `useScopeObjectOwners()`. Publishing is gated by
  `canPublish(role, isOwner)` — the owner **or** a governance role, because gating on ownership
  alone made an unowned object unpublishable by anyone.
- `fmd_field_notes` attaches to `(fmd_id, structure_id, row_key)` and **not** to a version, so a
  point survives regeneration. `row_key` is the content-based identity from `src/lib/rowDiff.ts`
  (SRC/TGT field combo), never a row index. Optional `field` pins a point to one **cell**; null
  means it's about the whole row.
- **Categories live in `src/lib/reviewPointCategories.ts`** — `todo`, `issue`, `question` are
  *actionable* (they count toward the "open" badge); `remark`, `decision` are informational (can be
  archived, never counted as outstanding). That list must stay in sync with the CHECK constraint in
  migration `0028`; adding a value in TS alone makes every insert of it fail at the database.
- The category helpers fall back to `remark` for an unrecognised value rather than throwing, so a
  row written by a newer app version still renders. `FmdFieldNote.tag` is therefore typed `string`,
  not a union.

### Who can do what

| Action | Who |
|---|---|
| Raise a review point, reply to one, resolve one | **Anyone** with access to the FMD |
| Publish a version (and, later, edit the mapping) | **The object's owner** only |

**An FMD has no owner field of its own.** Ownership is `subproject_objects.consultant` — whoever owns
that migration object in that subproject, assigned during in-scope selection (Scope > Criteria).
Read it via `useScopeObjectOwners()` + `scopeOwnerKey(subprojectId, migrationObjectId)`, which
returns BOTH assignments — `{ consultant, etlDeveloper }`.

**Publishing is the CONSULTANT's, never the ETL developer's.** The consultant owns what the data
means and what it becomes; the ETL developer is responsible for building the pipeline, so releasing
a version of the mapping document is not theirs to do. Migration 0034 split the two; before it, one
free-text `owner` column was naming the accountable person, gating publishing, AND standing in for
whoever built the ETL.
`fmds.owner` existed briefly and was dropped in migration 0030: two owner fields is the same
two-sources-of-truth trap as the dead `xref_tables.version` column.

Review is collaborative — RLS already limits who reaches the FMD at all, so gating comments on
ownership only suppressed the reviews you want. Ownership gates *changing the document*.

### Draft vs published versions

`fmd_versions.published_at` — **not `state`** — is what determines editability:

- `published_at is null` → an unreleased version (a generation). Edits mutate it in place.
- `published_at` set → frozen. A **DB trigger** (`fmd_versions_block_published_edit`, migrations
  0029/0030) rejects changes to the mapping content, so this holds even if UI code forgets.
  The trigger compares `sheets` **with the review keys stripped** — a Mapping Review can still be
  saved against a published version, because a review assesses content rather than changing it.
  Anything else you add under `sheets` that isn't mapping content must be stripped there too.
- Editing a published version collects the change in `fmds.draft` instead — see below. Publishing
  is a one-way door.

### Every version carries the log of what produced it

`sheets.changeLog: FmdPendingChange[]` — the cell edits that made this version, oldest first.

**Not the same thing as `pendingChanges`, even though the shape is identical.** A pending change is
a publish SELECTOR: which of these do I release? An unreleased version needs none, because
publishing releases all of it. The change LOG is the audit record, and it is needed either way.

Conflating the two is why editing an unpublished version left **no trace at all** — the version's
`comment` said why it existed ("Golden FMD updated") and nothing said what anyone changed inside it.

| Situation | `pendingChanges` | `changeLog` |
|---|---|---|
| Published base + draft edits | on `fmds.draft`, selectable at publish | written at publish, from what was applied |
| Unreleased version edited in place | none — nothing to select | appended as each edit lands |

### What a draft inherits from the version under it — and what it must not

`draftOverlayVersion` (`src/lib/fmdDraft.ts`) spreads `base.sheets`, so **every key on the published
version leaks into the draft unless it is explicitly cleared.** Two did, and both shipped as bugs:

- **`changeLog` must be cleared.** It is the published version's history, not the draft's.
  Inherited, a fresh draft on top of v1.0.0 opened showing v1.0.0's edits under "Already in this
  version", and each publish re-inherited them forever. A draft's own history is `pendingChanges`.
- **`mappingReview`/`mappingReviews` are inherited on purpose**, stamped `inheritedFrom` with edited
  findings marked — what the AI flagged is what you work from while fixing it. **But an inherited
  review must never be PUBLISHED.** `usePublishFmdVersion` drops any review carrying
  `inheritedFrom`: it assessed the previous version, so promoting it claims the new version was
  reviewed when it never was, and its findings then highlight cells in a version they were never
  about. Reviews that ran against the content being published have no `inheritedFrom` and are kept.

Covered by `fmdDraft.test.ts`. Before adding a key to `sheets`, decide which of these two it is.

At publish the two combine: `[...draftSheets.changeLog, ...selected]`. A version that was
generated, then hand-edited, then published carries both halves.

**Surfaced in two places**: the Draft tab ("Already in this version" — deliberately not selectable,
since publishing an unreleased version releases the whole thing) and the Version details pane
("Change log" — the complete record, where the `comment` is only a 20-line summary).

The freeze trigger permits all of this: it fires only when `old.published_at is not null`, so the log
is written while the row is still unreleased, and frozen with the content afterwards.

### An editing draft is not a version row

**Saving a cell must never add an entry to an FMD's version list.** Uncommitted edits live on
`fmds.draft` (migration 0033):

```
{ "baseVersionId": "<uuid of the published version they apply to>",
  "pendingChanges": [ …FmdPendingChange… ] }
```

- **The draft holds only the changes, never a copy of the mapping content.** The edited document is
  `applyPendingChanges(base.generatedTables, pendingChanges)`, derived on read — one copy of the
  data, nothing to keep in sync, and no way for a draft to drift from its base.
- `draftOverlayVersion(base, draft)` projects it into `FmdVersion` shape (id `DRAFT_VERSION_ID`,
  version `DRAFT_VERSION`) so every view that renders a version renders the draft unchanged.
  Nothing of that shape is ever stored. See **The draft inherits the previous review** below.

### The draft inherits the previous review

This derivation lives in `src/lib/fmdDraft.ts` — **pure, no Supabase import**, so it is testable
(`npm test`, `src/lib/fmdDraft.test.ts`, 13 cases). `queries/fmds.ts` re-exports every name from it,
so existing imports are unaffected.

`draftOverlayVersion` **carries the base version's Mapping Reviews onto the draft**, stamped:

- `MappingReview.inheritedFrom = { versionId, version }` — which version the run actually assessed.
- `MappingReviewFinding.editedInDraft` — the exact cell this finding pinned
  (`structureId + rowIndex + field`) has since been edited. Exact, not fuzzy: a draft only ever
  changes cell values, never adds or removes rows, so the match is a lookup rather than a guess.

Both are derived on read and **never stored**; `inheritReview` copies rather than mutates, so the
base version's stored shape stays clean. Anything writing `sheets` must therefore write the *base
version's* sheets, not the overlay's.

This used to blank `mappingReviews` instead, on the grounds that a review of published content says
nothing about edited content. True, and useless — the finding list is what you work *from* while
fixing it, so dropping it the moment editing starts drops it exactly when it matters. Carry it
across labelled; don't hide it.

**`editedInDraft` is not "fixed".** An edit to a cell is a fact; whether it resolves the finding is a
judgement, and `addressed` is where a person makes that judgement. Never collapse the two.

**Marking a finding addressed works on the draft**, writing to the *inherited* version's row —
`reviewTarget` in `FmdVersionHistoryDialog` resolves which real row owns the review, since the draft
has none. That is the actual workflow: fix a cell, then tick off the finding it came from.
- **`usePublishFmdVersion` is the only place editing creates a version row.** It INSERTs when
  `draft.id === DRAFT_VERSION_ID`, and UPDATEs in place for a real unpublished row. Held-back
  changes go back to `fmds.draft`, re-based onto what was just published.
- The number is allocated at publish by `nextPublishedVersion(draft, basePublished)`, called by
  both the publish mutation and the Draft tab so the number offered is the number written.
  **Never `bumpVersion(latest.version)`** — bump off the newest *numbered* version, as
  `useGenerateFmdMutation` does.
- Reverting the last outstanding edit sets `draft` to null, so "there is a draft" and "there is
  something to publish" stay the same question.

**An unpublished version row is a different thing** — a generation or conversion nobody has
released. It's edited in place and records no pending changes: the whole version is unreleased, so
publishing releases all of it. A pending change only means something against a published baseline.

In the viewer, `selectedReal` is what the version dropdown points at (**only ever a real version**)
and `selected` is what's rendered — the overlay while uncommitted edits exist. Per-version UI state
resets on `selectedReal.id`, not `selected.id`: keying it on the rendered version closed the field
view on the first keystroke, when the render swapped to the draft.

The FMD list shows this as two derived fields: `activeVersion` (newest published — what everyone
else should treat as current) and `hasDraft` (uncommitted changes, or a version never published).
Both can be true at once; don't collapse them into one "version" column.

### Locked Golden fields

`src/lib/goldenFmdRequiredFields.ts` lists the fields the designer refuses to remove **or rename
away** (checked both on delete and on save, since a rename is the same loss). `SRC_FIELD` and
`TGT_FIELD` matter most: they are the content-based row identity (`rowKey`), so dropping one
permanently detaches every existing review point, diff and finding from its row.

### Where review points appear

| Surface | Behaviour |
|---|---|
| Versions & Review tab | Its own pane beside Auto review, with a per-category open/closed insight strip; each point folds to its header (closed ones start folded) |
| Field-level view | Right panel, combined with that row's AI findings; composer at the bottom. A **Sparkles + count** toggle in the panel header hides/shows the AI findings — the two kinds share one narrow pane, and on a heavily-flagged field the machine findings crowd out the conversation. It is view state, not per-field: paging fields must not bring them back each time. When they're hidden the empty message says so and gives the count, never "no review points yet" |
| Generated table | Right-click any cell → Add review point; cells with points get a corner marker |

**Opening a field is always a double-click** — from the generated table, from an auto-review
finding, and from a review point`s header. Never a single click: these lists are long, a stray
click throwing you onto another tab is disorienting, and one gesture for one action is the rule.
A review point on a row that isn't in the selected version offers no navigation at all.

**Whatever opens the field view owns the way back.** `FieldDetailView` takes `backLabel`, and the
viewer tracks a `fieldOrigin` (`table` | `review`): arriving from a review point sends Back to the
Versions & Review tab, not to the mapping table the reader never chose.

**The dialog title carries the FMD name and nothing else.** Created/changed provenance belongs in
Version details, under the version's own who/when — under the title it was the second-largest
thing on screen and never what anyone opened the FMD to read.

The Manual list is deliberately **not** filtered by selected version — points belong to the FMD.
A point whose row is absent from the version on screen still shows, tagged "not in this version",
because "the row this was written about is gone" is itself worth seeing.

## Maintaining this skill

This file is the Library design contract. **Whenever you change Library design — a screen's
layout, the FMD viewer's tabs, a shared column convention, a new Library table, or you resolve one
of the inconsistencies above — update this file in the same change.** Keep the tables accurate and
delete entries that stop being true; a stale contract is worse than none.

## Archiving in the Library

Nothing in DMS is deleted (migrations 0040/0041 — a `BEFORE DELETE` trigger refuses on all eight
record tables). Library rows are archived instead, from a `Menu` in an `actions` column.

Every library query filters `archived_at is null`, so archived rows leave the catalogue. They are
found and restored from the Archive screen (`/archive`).

**Archiving needs a program**, because `archive_requests.program_id` is `not null`. Each artefact
resolves one differently, and that is what decides whether it can be archived at all:

| Artefact | Program via | Archivable |
|---|---|---|
| Custom FMD | `subproject_id` → project → program | Yes |
| Standard FMD | `migration_object_id` → `migration_objects.program_id` | Only with no Custom dependents |
| **Golden FMD** | neither — it has no subproject and no object | **Never** |
| Rule / XREF | `subproject_id` → project → program | Yes |
| **Golden XREF** | — | **Never** |
| Migration Object | `program_id` | **Not offered** — see below |

**Golden is never archivable**, and the reason is not scoping: every Standard and Custom FMD is
generated from it and `based_on_golden_version_id` points at its versions. Archiving it orphans the
lot. Same for the Golden XREF.

**Standard FMD is blocked while Customs still reference it.** They align to it through
`based_on_standard_fmd_version_id`; archiving the parent would leave them pointing at an archived
record. `archiveBlockedReason()` in `queries/fmds.ts` counts Customs per migration object.

**Migration Object is deliberately NOT archivable.** It already has `invalid`, surfaced in the list
as **Deprecated** — a second flag meaning nearly the same thing gives you no rule for which wins.
It is also the SAP DMC catalogue: reference data loaded from SAP, not authored here. What a
programme controls is whether an object is in scope, which `subproject_objects.in_scope` covers.

**A blocked action is disabled with its reason, never hidden.** `MenuAction.title` carries the
sentence, and `Menu` puts it on a wrapper `<span>` because a disabled `<button>` swallows pointer
events and would never show its own tooltip. `archiveBlockedReason` returns a sentence rather than a
boolean for exactly this.

FMD, Rule and XREF archives apply **immediately** — `dms_archive_needs_approval` maps them to the
`Scope`/`Rules` areas of `approval_matrix`, seeded `approval_required = false`. Only the hierarchy
levels always need the three approvals. Turn an area on in Settings → Approvals to change that.

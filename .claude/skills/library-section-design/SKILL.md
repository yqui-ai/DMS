---
name: library-section-design
description: The design contract for the Library section (Migration Object, Field Mapping, Rule, Cross Reference) — the four catalogue screens, their shared toolbar/table/dialog anatomy, the FMD viewer's tab layout, backend query-key and RLS conventions, and the known inconsistencies. Load this before changing anything under src/features/library/, the Library query hooks, or any Library list column. UPDATE THIS FILE whenever the Library design changes.
---

# Library section design

Library is DMS's four **read-mostly, program-wide catalogues**. Everything here is "what exists
across every subproject I can see", as opposed to Scope/Rules/Staging which are scoped to one
subproject. All four screens are reachable two ways (`/library/*` standalone, and nested under a
program) and render the exact same component — see `src/app/router.tsx`.

| Screen | Route | Component | Query hook | Table |
|---|---|---|---|---|
| Migration Object | `library/objects` | `LibraryObjects.tsx` | `useMigrationObjects` | `migration_objects` |
| Field Mapping | `library/fmds` | `LibraryFmds.tsx` | `useLibraryFmds` | `fmds` + `fmd_versions` |
| Rule | `library/rules` | `LibraryRules.tsx` | `useLibraryRules` | `rules` |
| Cross Reference | `library/xref` | `LibraryXref.tsx` | `useLibraryXrefTables` | `xref_tables` + `xref_versions` |

## Screen anatomy — every Library screen follows this, in this order

1. `<PageHeader title description />` — title is **singular** ("Field Mapping", "Rule", "Migration
   Object"), description is always "… across every subproject you have access to."
2. A single `flex flex-wrap items-center gap-2 mb-3` toolbar row containing, left to right:
   - `<ToolbarSearch>` (one per screen, searches the identifying text fields)
   - one `<MultiSelectFilter>` per facet — options come from the data where they're open-ended
     (Object's Component/Category), from a module-level `const` array where they're a fixed domain
     (`CLASS_OPTIONS`, `TYPE_OPTIONS`)
   - optional grouping `<select>` (only Field Mapping has one today)
   - a "Clear filters" button, rendered **only when `hasActiveFilters`**
   - a muted count: `{n.toLocaleString()} <noun>` + ` · N selected` when the screen has selection
   - `ml-auto` action group: `Button variant="quiet"` actions, then `variant="ai"` last
3. `<ListEmptyState>` when `!isLoading && filtered.length === 0`, else `<Table>`.
   **Never `EmptyState` directly on a filtered list** — it can't tell "nothing exists" from "your
   filters excluded everything", and shows a create-prompt to someone who just typed a search term.
   `ListEmptyState` takes `filtered={hasActiveFilters}` (which every screen already computes for its
   Clear filters button) and swaps the message and the action.
4. All dialogs rendered unconditionally at the bottom, controlled by a `null`-able state prop.

### Shared components (never hand-roll these)
`Table`, `Tag`, `Button`, `Select`, `Segmented`, `Pane`, `MultiSelectFilter`, `ToolbarSearch`,
`PageHeader`, `EmptyState`, `Dialog`, `ConfirmDialog`.

**Typography is fixed:** every list body cell is `text-sm2`, set once on `Table`'s `<table>`. Do
not add per-column size overrides — lists must look identical whether or not they contain tags.
Column headers are `text-2xs`. Technical identifiers are always
`font-mono`; IDs/versions/references specifically.

**Row clicks:** pass `onRowClick`. If only *some* rows open something, you must also pass
`rowClickable` — `Table` styles every row as clickable otherwise, producing rows that hover and
show a pointer but do nothing (this was a real bug in Library > XREF).

## Field Mapping — the deepest screen

`fmds` rows are one of three `type`s, and type drives almost everything:

- **Golden** — singleton (DB trigger `fmd_display_id()` raises on a second one), program-wide
  (`subproject_id is null`), class Global. Holds a `goldenStructure` (sections → fields), edited
  only in `GoldenFmdDesignerDialog`. **Never deletable.**
- **Standard** — one per migration object, program-wide, generated from Golden. **Never deletable.**
- **Custom** — one per (object, subproject), generated from Golden and aligned to the object's
  Standard FMD version. The only type with Mapping Review and field notes.
**There is no 'Historical' type.** It was retired in migration 0031: the converter parses an
uploaded workbook in the browser and writes Custom FMDs directly, so the intermediate record was
never persisted and the type had no way to exist. Lineage back to the source file lives on the
Custom FMD as `hist_source_name` / `hist_plant` — that's what re-upload matching and the
sibling-plants view key on, and it stays.

Type renders as **plain text**, not a coloured tag. Colour is reserved for state that needs
attention (see the `design-system` skill) — a categorical attribute on every row spends the colour
budget without saying anything.

### `FmdVersionHistoryDialog` layout (as of 2026-08-20)

One `size="win"` dialog, used by Golden and Custom. **A single version selector in the dialog
header drives every tab** — there is one answer to "which version am I looking at".

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
- **Where-used tab** — for Golden: which FMDs reference it and whether they're outdated. For
  everything else: sibling plants from the same AI-converted source file. (Two different
  relationships under one tab name — flagged in the Library review as worth renaming.)

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

Review-finding highlights (`#fecaca` error / `#fed7aa` warning) sit *on top of* section colour and
take priority over the yellow changed-cell highlight (`#fef9c3`).

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
  `subproject_objects.owner`, read via `useScopeObjectOwners()`. Publishing is gated by
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

**An FMD has no owner field of its own.** Ownership is `subproject_objects.owner` — whoever owns
that migration object in that subproject, assigned during in-scope selection (Scope > Criteria).
Read it via `useScopeObjectOwners()` + `scopeOwnerKey(subprojectId, migrationObjectId)`.
`fmds.owner` existed briefly and was dropped in migration 0030: two owner fields is the same
two-sources-of-truth trap as the dead `xref_tables.version` column.

Review is collaborative — RLS already limits who reaches the FMD at all, so gating comments on
ownership only suppressed the reviews you want. Ownership gates *changing the document*.

### Draft vs published versions

`fmd_versions.published_at` — **not `state`** — is what determines editability:

- `published_at is null` → an editable working draft. Edits mutate it in place.
- `published_at` set → frozen. A **DB trigger** (`fmd_versions_block_published_edit`, migrations
  0029/0030) rejects changes to the mapping content, so this holds even if UI code forgets.
  The trigger compares `sheets` **with the review keys stripped** — a Mapping Review can still be
  saved against a published version, because a review assesses content rather than changing it.
  Anything else you add under `sheets` that isn't mapping content must be stripped there too.
- The next edit after publishing starts a fresh draft. Publishing is a one-way door.

There is deliberately **no separate drafts table** — a draft is just the newest unpublished
version row, so there's no parallel copy to keep in sync and no merge step.

The FMD list shows this as two derived fields: `activeVersion` (newest published — what everyone
else should treat as current) and `hasDraft` (newest version is unpublished). Both can be true at
once; don't collapse them into one "version" column.

### Locked Golden fields

`src/lib/goldenFmdRequiredFields.ts` lists the fields the designer refuses to remove **or rename
away** (checked both on delete and on save, since a rename is the same loss). `SRC_FIELD` and
`TGT_FIELD` matter most: they are the content-based row identity (`rowKey`), so dropping one
permanently detaches every existing review point, diff and finding from its row.

### Where review points appear

| Surface | Behaviour |
|---|---|
| Versions & Review tab | Its own pane beside Auto review, with a per-category open/closed insight strip; each point folds to its header (closed ones start folded) |
| Field-level view | Right panel, combined with that row's AI findings; composer at the bottom |
| Generated table | Right-click any cell → Add review point; cells with points get a corner marker |

The Manual list is deliberately **not** filtered by selected version — points belong to the FMD.
A point whose row is absent from the version on screen still shows, tagged "not in this version",
because "the row this was written about is gone" is itself worth seeing.

## Maintaining this skill

This file is the Library design contract. **Whenever you change Library design — a screen's
layout, the FMD viewer's tabs, a shared column convention, a new Library table, or you resolve one
of the inconsistencies above — update this file in the same change.** Keep the tables accurate and
delete entries that stop being true; a stale contract is worse than none.

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
   - `ml-auto` action group: `<ToolbarButton>`s, then `<GoldenToggle>`, then `<AiButton>` last
3. `<EmptyState>` when `!isLoading && filtered.length === 0`, else `<Table>`.
4. All dialogs rendered unconditionally at the bottom, controlled by a `null`-able state prop.

### Shared components (never hand-roll these)
`Table`, `Tag`, `ColorTag`, `MultiSelectFilter`, `ToolbarSearch`, `ToolbarButton`, `AiButton`,
`GoldenToggle`, `PageHeader`, `EmptyState`, `Dialog`.

**Typography is fixed:** every list body cell is `text-sm2`, set once on `Table`'s `<table>`. Do
not add per-column size overrides — lists must look identical whether or not they contain tags.
Column headers are `text-xs` (`text-2xs` in `dense`). Technical identifiers are always
`font-mono`; IDs/versions/references specifically.

**Row clicks:** pass `onRowClick`. If only *some* rows open something, you must also pass
`rowClickable` — `Table` styles every row as clickable otherwise, producing rows that hover and
show a pointer but do nothing (this was a real bug in Library > XREF).

## Field Mapping — the deepest screen

`fmds` rows are one of four `type`s, and type drives almost everything:

- **Golden** — singleton (DB trigger `fmd_display_id()` raises on a second one), program-wide
  (`subproject_id is null`), class Global. Holds a `goldenStructure` (sections → fields), edited
  only in `GoldenFmdDesignerDialog`. **Never deletable.**
- **Standard** — one per migration object, program-wide, generated from Golden. **Never deletable.**
- **Custom** — one per (object, subproject), generated from Golden and aligned to the object's
  Standard FMD version. The only type with Mapping Review and field notes.
- **Historical** — a raw uploaded legacy file (`sheets.historicalRaw`), the input to the AI
  converter, which produces Custom FMDs.

`FMD_TYPE_STYLE` in `LibraryFmds.tsx` is a **deliberately fixed** colour map (Golden=amber,
Standard=blue, Custom=violet, Historical=grey) — do not replace it with hash-derived `ColorTag`.

### `FmdVersionHistoryDialog` layout (as of 2026-08-20)

One `size="win"` dialog, used by Golden and Custom. **A single version selector in the dialog
header drives every tab** — there is one answer to "which version am I looking at".

- **Field Mapping tab** — the selected version's data at *full dialog width*. Nothing else lives
  here. Renders one of: Golden structure view, the generated grid, the field-level detail view, or
  raw source/target/mapping sheets.
- **Versions tab** (labelled "Versions & Review" for Custom) — version list + `VersionDetailsPane`
  (who/when/state/comment/structures/based-on-Golden), plus Mapping Review findings for Custom.
- **Where-used tab** — for Golden: which FMDs reference it and whether they're outdated. For
  everything else: sibling plants from the same AI-converted source file.

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
- **Display IDs come from DB triggers**, never the client: `FMDGLD-/FMDSTD-/FMDHST-/FMDCST-`,
  `RULESTD-/RULECST-`, `XREFGLD-/XREFGBL-/XREFLCL-`. Each has its own sequence.
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
- **Rule has no detail view at all** — no `onRowClick`, so a rule row is a dead end.
- **Rule's "Version" column is a frozen literal.** `rules.version` is written once as `v1.0.0` at
  insert and never bumped; there is no `rule_versions` table. Building real Rule versioning was
  explicitly deferred by the user ("Rules later") — do not start it unprompted.
- **`GoldenToggle` means two different things.** On Field Mapping/XREF it *opens the Golden
  designer* (no `active` prop). On Rule it's a *filter toggle* for `class === 'Global'` — which is
  not the same concept as `type === 'Golden'` (Rules have no Golden type), so the label "Golden
  Rule" is misleading.
- **XREF has a designer + viewer for Golden only.** Standard XREF rows have no viewer; they're
  inert rows (correctly styled as such via `rowClickable`).
- **`useAllFmds` maps a narrow column subset** (no `owner`/`aiGenerated`/`hist*`). Fine for its
  Scope consumers; use `useLibraryFmds` if you need the enriched row.

## Field notes & ownership (Custom FMDs)

- `fmds.owner` is a **plain email string**, same convention as `created_by`/`approved_by` — not an
  FK, not an RLS boundary. It only gates whether the field-level note composer is enabled.
- `fmd_field_notes` attaches to `(fmd_id, structure_id, row_key)` and **not** to a version, so a
  note survives regeneration. `row_key` is the content-based identity from `src/lib/rowDiff.ts`
  (SRC/TGT field combo), never a row index.

## Maintaining this skill

This file is the Library design contract. **Whenever you change Library design — a screen's
layout, the FMD viewer's tabs, a shared column convention, a new Library table, or you resolve one
of the inconsistencies above — update this file in the same change.** Keep the tables accurate and
delete entries that stop being true; a stale contract is worse than none.

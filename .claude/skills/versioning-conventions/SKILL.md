---
name: versioning-conventions
description: How "versioning" actually works in DMS across FMDs, XREF, Rules, and Migration Objects — the real pattern (child _versions table, never a stale column on the parent), where it's fully implemented, where it's missing, and the gotchas already found and fixed. Load this before touching any version-history logic or a Library list's "Version" column.
---

# Versioning in DMS

There is exactly ONE correct versioning pattern in this codebase. Two of the four catalog types
use it properly, one uses it with a leftover bug already fixed once, and one doesn't have it at
all. Don't assume all four work the same way — check which state a given area is actually in.

## The pattern (FMD and Golden XREF — do it this way)

- The parent row (`fmds`, `xref_tables`) is the **identity** — name, class, type, display ID. It
  never itself has a "current" mapping/structure/state.
- Every save is a **new immutable row** in a child table (`fmd_versions`, `xref_versions`) —
  never an UPDATE to the previous version's content. `unique (parent_id, version)` enforces no two
  versions of the same thing can collide on a version string.
- "Latest version" is **always derived**: `ORDER BY created_at DESC LIMIT 1` on the child table,
  computed at read time. Never trust a `version` (or similar) column sitting directly on the
  parent row — see the bug below.
- `state` (Draft/In Review/Approved/Rejected) lives on the **version row**, not the parent — a
  brand new version always starts at `'Draft'`, regardless of whether a prior version was
  `'Approved'`.
- Version bumping goes through one small helper, `bumpVersion('v1.2.3') -> 'v1.2.4'`, duplicated
  (deliberately, not by accident — see comments at each call site) in `src/lib/queries/fmds.ts`
  and `src/lib/queries/rules.ts` (the latter also holds the XREF mutations).
- A **Golden singleton** (exactly one Golden FMD, exactly one Golden XREF) is enforced by a
  `BEFORE INSERT` trigger that raises an exception if a second `type = 'Golden'` row is attempted
  — see `fmd_display_id()` in `0016_golden_fmd_singleton.sql` and `xref_display_id()` in
  `0019_golden_xref.sql`. This is a real DB-level guard, not just app-level convention, though it's
  a check-then-insert pattern inside the trigger (not a partial unique index) — under genuinely
  concurrent inserts there's a narrow theoretical race. Acceptable for this app's low-concurrency
  profile; don't "fix" it by adding app-level checks that create a false sense of safety instead.

## The bug this pattern already caught once (fix it again if you see it elsewhere)

**A parent-row column that looks like "the version" but nothing ever writes to it is a trap.**

`xref_tables` was originally created (0001_init.sql) with a plain `version text` column, before
`xref_versions` existed. When `xref_versions` was added later (0019), the old column was never
dropped — it just sat there, permanently `NULL` for every table created after that point, because
no mutation ever wrote to it again. `useLibraryXrefTables()` was still reading `x.version` into
the row shown in the Library > Cross Reference list, so the **Version column silently showed "—"
for every real XREF table**, even though correct version history existed one click away in the
version-history viewer. Fixed by deriving `latestVersion` from `xref_versions` in the query hook
(same shape as FMD's `latestVersion`/`latestVersionId`) and deleting the dead `version` field from
the `XrefTable` type entirely, so it can't be silently reached for again.

**If you ever see a list column reading a plain field directly off a parent row that also has a
`_versions` child table, stop and check whether anything actually writes to that field.** If not,
it's the same bug — derive from the child table instead.

## Where this does NOT exist: Rules

`rules` has only ever had a flat `version text` column (0001_init.sql) — there is no
`rule_versions` table, and no mutation in `src/lib/queries/rules.ts` ever writes to `.version`
either. The Library > Rules list's "Version" column reads whatever was set at row creation (seed
data, typically) and will never change. This is not a bug to silently patch the same way the XREF
one was — Rules genuinely has no version-history mechanism at all, unlike FMD and XREF. Building
one is a real schema decision (a new table, migration, and UI across every rules screen) — ask
before doing it, don't assume it should mirror FMD/XREF without confirming scope.

## Where this doesn't apply: Migration Objects, DMC structures/fields

`migration_objects`, `dmc_structures`, `dmc_fields` have no version concept, by design — they're
static reference data imported once from real SAP exports (`scripts/load-dmc-structures-fields.mjs`),
not user-edited content that accrues a history. Don't add versioning here without a real reason to.

## Snapshot labels are not the same thing as versioning

`runs.fmd_version` / `runs.rules_version` / `runs.xref_version` are plain text labels captured at
the moment a migration run executed — intentionally NOT foreign keys to a specific version row.
A past run should keep showing the label that was true when it ran, even if the real version it
pointed to later gets superseded or deleted. Don't "fix" these into foreign keys; that would make
historical runs' records silently change meaning if the underlying version is ever deleted.

## FK on-delete behavior for a "based on version X" reference

Two columns on `fmds` reference a specific `fmd_versions` row as a lineage/reference marker:
`based_on_golden_version_id` (0018) and `based_on_standard_fmd_version_id` (0024). Both should
behave the same way if the referenced version ever gets deleted: `ON DELETE SET NULL` (the
reference just clears, rather than blocking the delete or corrupting anything). 0024 originally
missed this (defaulted to `NO ACTION`, which blocks deletes) — fixed in
`0026_fmd_standard_reference_on_delete.sql`. If you add a THIRD "based on version" column anywhere,
give it `on delete set null` from the start.

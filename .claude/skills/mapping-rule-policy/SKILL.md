---
name: mapping-rule-policy
description: DMS Field Mapping Document (FMD) MAPPING_TYPE enum and per-type rule conventions — the canonical policy enforced by Standard FMD generation defaults and the Custom FMD "Review Mapping" AI check. Load this before touching mapping-type, transformation-rule, or technical-rule logic anywhere in the FMD feature.
---

# FMD mapping rule policy

This is the canonical, single policy for how a field-mapping row's `MAPPING_TYPE`,
`TRANSFORMATION_RULE`, and `TECHNICAL_RULE` columns relate to each other in this app. It applies
across every place that produces or checks those columns — don't invent a different rule set for a
new feature; extend this one and update all three places below together.

## Source of truth

- **`src/lib/mappingRulePolicy.ts`** — the canonical enum (`MAPPING_TYPE_VALUES`), the
  free-text normalizer (`normalizeMappingType`), the list of fields allowed to be blank
  (`OPTIONAL_FIELDS`), and the policy prose sent to the AI reviewer (`MAPPING_RULE_POLICY_TEXT`).
- **`supabase/functions/convert-historical-fmd/index.ts`** — the Edge Function's
  `MAPPING_REVIEW_POLICY` constant is a **duplicate** of `MAPPING_RULE_POLICY_TEXT` (Deno can't
  import from `src/`). If you change the policy text, change both, or the AI reviewer will judge
  rows against a policy that no longer matches what the rest of the app enforces.

## The rules

**MAPPING_TYPE** is one of exactly four values: `COPY`, `TRANSFORM`, `XREF`, `DEFAULT`. Nothing
else is valid — not the older 8-value set (`1:1` / `Default Value` / `Rule` / `Single Object
Mapping` / `Central Mapping` / `Fixed Value` / `System Generated` / `Field Not Relevant`) that an
earlier version of this feature used. That set was fully retired in favor of this one; if you find
code or data still referencing it, it's stale.

**Completeness**: every field in the Source, Mapping, and Target sections of a row must be
populated, **except** `SRC_CHECK_TABLE` and `TGT_CHECK_TABLE`, which are allowed to be blank.

**Per-type format**:

| MAPPING_TYPE | TRANSFORMATION_RULE | TECHNICAL_RULE (always SQL) |
|---|---|---|
| `COPY` | exactly `"1:1"` | `SELECT <source_field> FROM <source_table>` |
| `DEFAULT` | states whether the default is unconditional or null-only | `SELECT 'X' AS <target_field>`, or `CASE WHEN <src> IS NULL THEN 'X' ELSE <src> END` |
| `TRANSFORM` | real transformation logic | CASE or equivalent, covering every condition **including ELSE** |
| `XREF` | must name the XREF table/object | SQL lookup **plus** the no-match branch (LEFT JOIN + COALESCE, or explicit default) |

### TECHNICAL_RULE is SQL for every type — no exceptions

An earlier revision made this type-dependent (notation for COPY/DEFAULT, SQL only where the logic
lives). **That was overruled, and the simpler rule is better:** one column, one language. A developer
reading the FMD never has to work out which dialect a row is written in, and anything that parses
SQL — effort scoring, validation, the rule generator — treats the whole column uniformly instead of
special-casing two types.

`requiresSql()` therefore returns true unconditionally. It's kept as a function rather than deleted
because call sites read better asking the policy than asserting it, and because it's the one place
to change if that ever becomes conditional again.

**Consequence to expect:** FMDs generated before this change carry `<structure>-<field>` notation in
COPY rows and will be flagged by the next Mapping Review. That's correct — they no longer meet the
policy. Generation now emits `SELECT <field> FROM <structure>` so new FMDs start compliant.

### Transform Simple vs Complex is DERIVED, never stored

`classifyTransform(technicalRule)` computes it:

- **Simple** — one source table, no join, at most one condition.
- **Complex** — anything else. Ambiguity resolves to Complex, because under-estimating a transform
  is the expensive direction.

It is deliberately *not* a column. A hand-typed flag beside the SQL it describes is a second source
of truth for the same fact — the same shape of bug as the dead `xref_tables.version` column — and
it would go stale the moment a rule is refined. Deriving it means the flag can never disagree with
the rule, and item 64 of the review checklist ("re-run the estimate when the FMD changes") is
satisfied for free.

`effortWeight(mappingType, technicalRule)` returns the per-row build weight
(`MAPPING_EFFORT_WEIGHTS`: COPY 1, DEFAULT 1, TRANSFORM-Simple 2, TRANSFORM-Complex 5, XREF 3).
Those are the checklist's starting numbers and are meant to be recalibrated against a project's
actuals, which is why they sit in one exported map rather than inside the estimator.

## Where this is applied

- **Standard FMD generation** (`GenerateFmdDialog.tsx`, `buildRow`) — when generating a *Standard*
  FMD (not Custom), every row defaults to `MAPPING_TYPE = 'COPY'`, `TRANSFORMATION_RULE = '1:1'`,
  `TECHNICAL_RULE = '<structureIdent>-<field_name>'`. Custom FMDs are left blank — that mapping
  needs a real decision, not a default that could be mistaken for one.
- **Historical AI conversion** (`histClassify.ts`) — free-text `MAPPING_TYPE` values read from an
  uploaded legacy file are normalized onto this enum via `normalizeMappingType`, imported from
  `mappingRulePolicy.ts` (re-exported for backward compatibility with existing imports).
- **Mapping Review** (`src/lib/queries/mappingReview.ts`, `FmdVersionHistoryDialog.tsx`) — a
  Custom-FMD-only AI check, triggered by the "Review Mapping" button next to "Export to Excel".
  Sends each structure's rows (batched, not all at once — batching is a reliability measure, the
  judgment itself is fully AI-driven, not a deterministic pre-filter) to the `mapping-review` task
  on the shared Edge Function, gets back a list of policy-violation findings, and saves them onto
  the reviewed `fmd_versions` row (`sheets.mappingReview`) as an update to that same version — a
  review is an assessment of existing content, not new mapping content, so it never bumps the
  version number.

## Extending this policy

If a new MAPPING_TYPE value or a new per-type rule is needed:
1. Update `MAPPING_TYPE_VALUES` and `normalizeMappingType` in `mappingRulePolicy.ts`.
2. Update `MAPPING_RULE_POLICY_TEXT` in the same file.
3. Copy that same text into `MAPPING_REVIEW_POLICY` in the Edge Function, then redeploy:
   `supabase functions deploy convert-historical-fmd`.
4. If the new type needs its own generation default, extend `buildRow` in `GenerateFmdDialog.tsx`.

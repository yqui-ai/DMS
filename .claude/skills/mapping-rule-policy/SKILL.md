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

| MAPPING_TYPE | TRANSFORMATION_RULE | TECHNICAL_RULE |
|---|---|---|
| `COPY` | exactly `"1:1"` | `"<table>-<field>"` (target table/field, hyphen-separated) |
| `DEFAULT` | — | a literal value assignment: `"<table>-<field> = <value>"`, value quoted text (`"TEST"`) or a bare number (`123`) |
| `XREF` | must name the XREF table/object | must also name the same XREF table/object |
| `TRANSFORM` | real, non-generic transformation logic | real, non-generic transformation logic |

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

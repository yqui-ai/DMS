---
name: change-log-writing
description: How change-log entries must read — the rules for turning a database write into a sentence an end user understands. Load this before touching dms_log_change(), src/lib/queries/changeLog.ts, ChangeLogPage, or before registering a new table for logging. UPDATE THIS FILE whenever the rules change.
---

# Writing the change log

The change log is read by consultants and leads, not by developers. **Every line must make sense to
someone who has never seen the schema.** A log nobody can read is not an audit trail; it is a table
dump with a timestamp.

The bar: *could a data owner, six weeks later, read this line and know what happened without asking
anyone?* If not, it is not finished.

## The four things every entry must say

1. **What kind of record** — "Field Mapping", not `fmds`.
2. **Which one** — "FMDCST-9", "SIF_CUSTOMER_2", "1010 Stuttgart". Never a raw uuid.
3. **What happened** — created, changed, deleted, published, assigned.
4. **What moved**, when it was a change — "ETL developer", not `etl_developer`.

## Rules

### Never show a uuid to a person

A uuid is an internal handle. `Updated ba201d27-4f8b-455b-b480-fb47de6f708e` tells a reader nothing
at all — worse, it *looks* like it should mean something.

Every logged table needs a human label. Where the row carries one (`display_id`, `name`, `code`,
`object_id`, `version`) the trigger picks it up automatically. Where it does not — link tables and
join rows like `subproject_objects` and `subproject_plants` — **`dms_log_label()` resolves one by
joining out to the record that has a name.** A new logged table with no naming column of its own
must be given a case there, in the same change that registers it.

If a label genuinely cannot be resolved, say what the record *is* ("a scope entry") rather than
printing its id.

### Never show a column name

`etl_developer`, `fmd_id`, `based_on_golden_version_id`, `scope_finalized` are schema. Map them
through `FIELD_LABEL` in `src/lib/queries/changeLog.ts`. An unmapped column falls back to a
de-snake-cased, sentence-cased version (`etl_developer` → "ETL developer"), which is usually right
and never leaks an underscore — but add real labels for anything whose column name is not its
meaning (`fmd_id` is "Field Mapping"; `based_on_golden_version_id` is "Golden template version").

### Never dump JSON at a reader

`sheets`, `draft`, `changes` and the other JSONB columns hold entire documents. Printing 400
characters of `{"baseVersionId":"887309…","pendingChanges":[{…` in a diff column is noise that
buries every readable entry around it.

A JSON-valued field reports **that it changed and how much**, not its contents:
"Draft contents changed (3 pending edits)". Where the shape is known and small — a review point, a
status object — a short rendering is fine. The full value belongs in the record's own screen, which
is built to show it; the log's job is to say something moved and send you there.

### Say what changed, not that a row was written

`Updated FMDCST-9 (draft)` is the schema's account of events. `Draft edited on FMDCST-9` is the
user's. Prefer the verb that names the real action:

| Instead of | Write |
|---|---|
| Updated FMDCST-9 (published_at, published_by) | Published FMDCST-9 v1.0.2 |
| Updated <scope row> (fmd_id) | Assigned FMD_PROJX_SIF_CUSTOMER_2 to SIF_CUSTOMER_2 |
| Updated <scope row> (consultant) | SIF_CUSTOMER_2 consultant set to jordan.alvarez |
| Created <link row> | 1010 added to Subproject Test |
| Updated <subproject> (scope_finalized) | Scope finalized for Wave 1 |

These are recognised **field patterns**, not per-table special cases: a change whose columns match a
known signature gets the sentence for that signature. Add a pattern when a write is common enough
that its generic sentence is actively unhelpful.

### Insert and delete carry no diff

`dms_log_change()` computes a field diff only for UPDATE. An insert logs `changes = {}` — so the
detail view must say *"the record was created"* rather than rendering an empty table that reads as
a bug. Same for deletes. If per-column values on insert ever become necessary, change the trigger,
not the empty-state copy.

### Two summaries, and the deterministic one always wins as the record

- **`change_log.summary`** is written by the trigger, always present, never regenerated. It is what
  the entry *is*.
- **The AI summary** (Summarise with AI) is a rewrite of what is already on screen, held in
  component state and never persisted.

The AI line may sit above the recorded sentence but **must never replace it** — a generated sentence
must not be the only version of an audit entry on screen. A log that reads differently depending on
whether a model was reachable is not an audit trail.

## Where each rule lives

| Concern | Where |
|---|---|
| The stored sentence, and label resolution | `dms_log_change()` / `dms_log_label()` — migrations 0046, 0047, 0051 |
| Table → human name | `ENTITY_LABEL` in `src/lib/queries/changeLog.ts` |
| Column → human name | `FIELD_LABEL` + `fieldLabel()`, same file |
| Value rendering, JSON collapsing | `formatValue()`, same file |
| Verb patterns ("Published", "Assigned") | `describeChange()`, same file |
| Row and detail layout | `src/features/launchpad/ChangeLogPage.tsx` |

**Client-side, not only in the trigger.** Stored summaries cannot be rewritten retroactively — the
table is append-only by design. So the page derives its own sentence from `entity`, `op` and the
field diff, and falls back to the stored `summary` only when it cannot do better. Improving the
wording therefore fixes history already recorded, not just what happens next.

## Registering a new table

1. Add it to the `foreach t in array [...]` list (the pattern in 0046).
2. Add an `ENTITY_LABEL` entry — a singular, human noun.
3. If the row has no `display_id`/`name`/`code`/`object_id`, add a case to `dms_log_label()`.
4. Add `FIELD_LABEL` entries for any column whose name is not its meaning.
5. Open the Change Log and read your own entries. If a line needs the schema to decode, it is not
   done.

**Do not register a table whose writes are not interesting to a person.** Every logged write costs
a row and a line of attention; a table churned by machinery makes the log unreadable for the tables
that matter.

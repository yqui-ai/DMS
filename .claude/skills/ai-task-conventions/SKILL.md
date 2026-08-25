---
name: ai-task-conventions
description: How AI calls are architected in DMS — the shared Edge Function, deterministic-first philosophy, robust JSON extraction, and token-efficient request/response shapes. Load this before adding a new AI-calling feature or touching supabase/functions/convert-historical-fmd or src/lib/queries/aiEdgeFunction.ts.
---

# AI task conventions

Every AI call in this app goes through **one** Edge Function
(`supabase/functions/convert-historical-fmd/index.ts`), dispatched by a `task` field, invoked via
**one** shared client helper (`src/lib/queries/aiEdgeFunction.ts`'s `invokeAiTask`). Don't create a
second Edge Function or a second invoke helper for a new feature — add a new `task` case to the
existing one. This keeps there being exactly one place holding the `ANTHROPIC_API_KEY` secret and
exactly one throttle/timeout policy to reason about.

## Deterministic-first — the AI is the last resort, not the first

Every AI-calling feature in this app was originally built AI-first and later rebuilt
deterministic-first, after the AI-first version proved unreliable in practice (see the field-notes
history in the project's own build-log artifact if you want the specifics: rename detection,
version diffing, and column classification were all AI calls that got replaced with plain JS).
Before adding a new task to the Edge Function, ask: **does this have one demonstrably correct
answer given the inputs?** If yes, write it in TypeScript, not a prompt. Reserve the model for
things that genuinely require judgment (writing prose, auditing free text against a policy).

## Parsing the model's response defensively

Two real bugs already found here, both now fixed — don't reintroduce either:

1. **`content[0].text` is not a safe assumption.** The Messages API's `content` array isn't
   guaranteed to have the text block first. `callClaude()` searches the array for
   `type === 'text'` instead of indexing. If you ever see `.content?.[0]?.text` again anywhere,
   that's the bug.
2. **The model will ignore "no commentary, JSON only" some of the time.** `extractJson()` tries a
   fenced ` ```json ` block first, then falls back to a string-aware brace scan for the first
   balanced `{...}` anywhere in the text (aware of quoted strings/escapes, so a literal `{` inside
   a quoted string can't throw off the scan). Never replace this with a naive
   `JSON.parse(wholeResponseText)`.

A system prompt (`JSON_ONLY_SYSTEM_PROMPT`) reduces how often #2 happens, but doesn't eliminate
it — the parser has to be robust regardless, the system prompt is a mitigation, not a guarantee.

On a genuine parse failure, the error response includes a preview of what the model actually
returned (`The model did not return valid JSON: <preview>`), not just a generic message — this is
what made the `content[0].text` bug findable in the first place (it showed literally
`(empty response)` on every call, which is what pointed at "the extraction never finds anything,"
not "the model is being flaky"). Keep this preview when touching this code path.

## Client-side error surfacing

`supabase-js`'s default `FunctionsHttpError` message ("Edge Function returned a non-2xx status
code") throws away the function's actual response body. `invokeAiTask` in `aiEdgeFunction.ts`
reads `error.context` (the raw `Response`) to recover the real `{error: "..."}` message. Don't
catch-and-rethrow an Edge Function error anywhere without going through this helper, or you'll
reintroduce the generic-message problem.

## Token efficiency: hoist anything constant across a batch

A batch call should never repeat a value that's identical for every item in that batch. This was
found and fixed once already: the `mapping-review` task used to prefix every row's `id` with the
full 36-character structure UUID (`${structureId}::${rowIndex}`), even though every row in one
batch call is always from the same structure (batching happens per-table in
`mappingReview.ts`) — repeated in the request AND echoed back by the model in every finding in the
response. Fixed by moving `structureIdent` to the request's top level and shrinking each row's
`id` down to just its row index, matching the leaner scheme the `rules` task already used
correctly. When adding a new batched task: **only put per-row data in each row; anything shared
across the whole batch goes once, at the top of the request.**

## Batching is a reliability tool, not a judgment shortcut

`BATCH_SIZE` constants (20 for `rules`, 10 for `mapping-review`) exist so a large FMD can't blow
past a single call's practical output budget — they are NOT a way to pre-filter what the model
sees. If a task needs fewer rows sent per call for token-budget reasons, lower `BATCH_SIZE`; don't
try to deterministically guess which rows "probably" need review and skip sending the rest — that
silently narrows what gets checked.

## Failure isolation, not all-or-nothing

A batch that fails (timeout, malformed JSON, rate limit) should degrade the FEATURE, not crash the
whole operation: `aiHistoricalConvert.ts` falls back to `"Copy 1:1"` for that batch's rows;
`mappingReview.ts` pushes a synthetic "this batch's review failed, re-run to retry" finding instead
of losing the rest of the review. Keep this shape for any new batched task — one bad batch should
never take down the ones before or after it in the same run.

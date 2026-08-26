// Supabase Edge Function (Deno runtime) — not part of the Vite/tsc build (supabase/functions is
// outside tsconfig.app.json's "include": ["src"]), deployed separately via the Supabase CLI:
//   supabase functions deploy convert-historical-fmd
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Handles the narrow AI tasks used across the Field Mapping feature (src/lib/queries/
// aiHistoricalConvert.ts, src/lib/queries/mappingReview.ts). Kept as one function/deployment
// rather than one-per-feature so there's a single secret + endpoint to manage:
//   'rules'          — write transformation-rule text for a batch of Historical-conversion rows
//                       that don't already have one.
//   'mapping-review' — audit a batch of a Custom FMD's rows against the mapping rule policy
//                       (src/lib/mappingRulePolicy.ts — keep MAPPING_REVIEW_POLICY in sync with it).
// Column classification/row-building, filename rename-detection, and the version-to-version change
// summary are all pure deterministic JS on the client (src/lib/histClassify.ts,
// src/lib/fileNameMatch.ts, src/lib/rowDiff.ts) — their AI-based predecessors proved unreliable in
// practice, and there's no good fallback for "the AI call just didn't work" on something that
// should have a definite right answer.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RuleRequestRow { id: string; srcField?: string; srcFieldDesc?: string; tgtField?: string; tgtFieldDesc?: string; mappingType?: string }
// structureIdent lives once at the request level, not per row — every row in a mapping-review
// batch is always from the same structure (src/lib/queries/mappingReview.ts batches per table),
// so repeating a full structure identifier on every row was pure waste in both the request and,
// worse, the response (the model has to echo the row id back for every finding).
interface MappingReviewRow { id: string; fields: Record<string, string> }
interface GoldenSyncField { field: string; description?: string }

/** Everything the model may use when drafting a technical rule. Deliberately explicit: the prompt
 * forbids inventing any table or field name not present here, because a plausible-looking rule
 * naming a table that doesn't exist is worse than no rule at all — it looks implementable. */
interface TechnicalRuleContext {
  mappingType: string;
  transformationRule: string;
  srcTable?: string; srcField?: string; srcDataType?: string; srcLength?: string;
  tgtTable?: string; tgtField?: string; tgtDataType?: string; tgtLength?: string;
  /** Other fields on the same row, so a rule can reference a sibling column when the requirement
   * says "when the country is X". */
  siblingFields?: string[];
}

type RequestBody =
  | { task: 'rules'; rows: RuleRequestRow[] }
  | { task: 'mapping-review'; structureIdent: string; rows: MappingReviewRow[]; optionalFields: string[]; criticalFields?: string[] }
  | { task: 'golden-sync'; removed: GoldenSyncField[]; added: GoldenSyncField[] }
  | { task: 'technical-rule'; context: TechnicalRuleContext };

// Mirrors src/lib/mappingRulePolicy.ts's MAPPING_RULE_POLICY_TEXT — Deno can't import from src/,
// so this is a deliberate duplicate. Update both together.
const MAPPING_REVIEW_POLICY = `Every field in the Source, Mapping, and Target sections of a row must be populated, EXCEPT the fields listed as allowed to be blank below.

MAPPING_TYPE must be exactly one of: COPY, TRANSFORM, XREF, DEFAULT.

TECHNICAL_RULE must ALWAYS be written in SQL syntax, for every mapping type without exception. Prose such as "map accordingly", "same as legacy", "1:1" or a bare restatement of the field name is never acceptable in TECHNICAL_RULE, and must be flagged. The rule must name the actual source table(s) and field(s) it reads.

A rule that POINTS somewhere else instead of stating the rule — "See migration document chapter 3.2.5", "See tab \"RB Customer Rules\"", "refer to STORT", "as per the concept document", "TBD" — is treated as missing, in TRANSFORMATION_RULE and TECHNICAL_RULE alike. The FMD must carry the rule itself; an ETL developer cannot implement a reference to a document the FMD does not include.

- If MAPPING_TYPE is COPY: TRANSFORMATION_RULE must be exactly "1:1", and TECHNICAL_RULE must be a plain select of the source field, e.g. SELECT <source_field> FROM <source_table>.
- If MAPPING_TYPE is DEFAULT: TECHNICAL_RULE must set a literal value in SQL, e.g. SELECT 'X' AS <target_field> for an unconditional default, or CASE WHEN <source_field> IS NULL THEN 'X' ELSE <source_field> END when the default only applies to blanks. TRANSFORMATION_RULE must make clear which of the two it is.
- If MAPPING_TYPE is TRANSFORM: TECHNICAL_RULE must be a CASE expression or equivalent statement covering every stated condition INCLUDING the ELSE/otherwise case.
- If MAPPING_TYPE is XREF: the cross-reference (XREF) table/object name must be explicitly mentioned in BOTH TRANSFORMATION_RULE and TECHNICAL_RULE, and TECHNICAL_RULE must show the lookup in SQL. It must also show the no-match behaviour (for example a LEFT JOIN with COALESCE, or an explicit default) — a rule that only covers the matching case is incomplete.`;

function rulesPrompt(rows: RuleRequestRow[]): string {
  const lines = rows.map((r) =>
    `${r.id}: source "${r.srcField || '—'}" (${r.srcFieldDesc || 'no description'}) -> target "${r.tgtField || '—'}" (${r.tgtFieldDesc || 'no description'})${r.mappingType ? `, mapping type hint: ${r.mappingType}` : ''}`);
  return `You are writing short field-mapping transformation rules for a Field Mapping Document (FMD), one per line below. Each line is "id: source field (description) -> target field (description)".

${lines.join('\n')}

For each id, write a concise transformation rule (one short sentence, e.g. "Direct 1:1 copy", "Concatenate source fields", "Default value X if source blank", "Lookup via XREF table"). If nothing meaningful can be inferred, use "Copy 1:1".

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly:
{ "rules": [ { "id": "<id>", "transformationRule": "<rule text>" }, ... ] }
One entry per id given above, in any order.`;
}

/** Which removed Golden field became which added one. The added/removed lists themselves are
 * computed deterministically client-side — the ONLY judgement call here is whether a disappeared
 * field and a new one are the same concept renamed, which is exactly the kind of thing a name-and-
 * description comparison is good at and a string match is not (SRC_FIELD_DESC -> SRC_DESCRIPTION).
 * Getting this right is what stops a rename from silently discarding a column of real data. */
function goldenSyncPrompt(removed: GoldenSyncField[], added: GoldenSyncField[]): string {
  const fmt = (f: GoldenSyncField[]) =>
    f.map((x) => `- ${x.field}${x.description ? `: ${x.description}` : ''}`).join('\n') || '- (none)';
  return `A Field Mapping Document template (the "Golden FMD") has changed. These columns were REMOVED:
${fmt(removed)}

These columns were ADDED:
${fmt(added)}

Decide which removed column, if any, is the same concept as an added column under a new name — i.e. a rename rather than a genuine deletion plus a genuine addition. Only pair them when the meaning clearly matches; leave a column unpaired if you are not confident, because a wrong pairing moves data into the wrong column.

Reply with ONLY this JSON, no commentary:
{"renames":[{"from":"<removed column>","to":"<added column>","confidence":"high|medium","why":"<short reason>"}],"summary":"<two sentences, plain language, on what this change means for existing mapping data>"}`;
}

/** Drafts the SQL TECHNICAL_RULE from the plain-language TRANSFORMATION_RULE — or refuses.
 *
 * Refusing is a first-class outcome, not a failure mode. The whole value of this feature is that a
 * vague requirement gets sent back to a human instead of quietly becoming confident-looking SQL that
 * a developer will implement and nobody will question. So the prompt is explicit that inventing a
 * table name, guessing a code value, or filling a gap with something reasonable all count as
 * reasons to refuse rather than things to do. */
function technicalRulePrompt(c: TechnicalRuleContext): string {
  const known = [
    c.srcTable && `source table: ${c.srcTable}`,
    c.srcField && `source field: ${c.srcField}${c.srcDataType ? ` (${c.srcDataType}${c.srcLength ? `, length ${c.srcLength}` : ''})` : ''}`,
    c.tgtTable && `target table: ${c.tgtTable}`,
    c.tgtField && `target field: ${c.tgtField}${c.tgtDataType ? ` (${c.tgtDataType}${c.tgtLength ? `, length ${c.tgtLength}` : ''})` : ''}`,
    c.siblingFields?.length && `other columns available on the same source row: ${c.siblingFields.join(', ')}`,
  ].filter(Boolean).join('\n');

  return `You are writing the SQL TECHNICAL_RULE for one row of an SAP data-migration Field Mapping Document.

MAPPING_TYPE: ${c.mappingType || '(not set)'}
Plain-language requirement (TRANSFORMATION_RULE):
"""
${c.transformationRule || '(empty)'}
"""

Known facts you may use:
${known || '(none supplied)'}

Rules:
- Use ONLY the table and field names listed above. Never invent a table, field, code value, or cross-reference table name that is not given. If the requirement depends on something not listed, that is a reason to refuse.
- For MAPPING_TYPE XREF the rule must show the lookup AND the no-match behaviour (e.g. LEFT JOIN with COALESCE, or an explicit default).
- For MAPPING_TYPE TRANSFORM write a CASE expression or equivalent statement covering every stated condition, including the ELSE / otherwise case.
- Refuse if the requirement is vague, ambiguous, incomplete, or would require you to guess a value, a threshold, a code list, or a table. Examples of requirements you must refuse: "map accordingly", "same as legacy", "apply business logic", "convert as needed", "standard mapping".
- Do not invent an ELSE branch value if the requirement never says what happens otherwise — refuse and say so.

Reply with ONLY this JSON, no commentary:
{"ok":true,"sql":"<the SQL statement, single line or with \\n for newlines>","notes":"<optional one-sentence caveat, or empty>"}
or
{"ok":false,"reason":"<one or two sentences: what specifically is unclear, and what a person would need to add to make it implementable>"}`;
}

function mappingReviewPrompt(structureIdent: string, rows: MappingReviewRow[], optionalFields: string[], criticalFields: string[] = []): string {
  const rowLines = rows.map((r) => `${r.id}: ${JSON.stringify(r.fields)}`).join('\n');
  return `You are auditing rows of the "${structureIdent}" structure in a Field Mapping Document (FMD) against this policy:

${MAPPING_REVIEW_POLICY}

Fields allowed to be blank: ${optionalFields.join(', ') || '(none)'}.

CRITICAL fields — the ones this programme's Golden template says matter most: ${criticalFields.join(', ') || '(none marked)'}. Weight your judgement toward these: a rule that is wrong or ambiguous where it touches a critical field is an "error"; the same problem on a non-critical field is a "warning". Blankness in them is already checked in code — do not report it.

Rows to check, one per line as "<id>: <field JSON>":
${rowLines}

The mechanical checks have ALREADY been run in code before you see these rows, and their findings are already reported. Do not repeat them. Specifically, do NOT report: a blank field, a MAPPING_TYPE outside the four allowed values, TECHNICAL_RULE containing no SQL at all, or a rule that merely points at another document. Every row below has passed all of those.

Your job is the part code cannot decide: whether the TECHNICAL_RULE actually implements the requirement stated in TRANSFORMATION_RULE beside it, for this specific source and target field. Look for:
- TECHNICAL_RULE that is valid SQL but does something OTHER than what TRANSFORMATION_RULE describes.
- A stated condition in TRANSFORMATION_RULE that the SQL never tests, or a branch the SQL leaves undefined.
- TRANSFORMATION_RULE too vague to verify against ("map accordingly", "standard logic", "as required") even though it is not a pointer.
- SQL naming a table or field that contradicts SRC_TABLE/SRC_FIELD or TGT_TABLE/TGT_FIELD on the same row.
- An XREF row whose cross-reference table is not named in both rule fields.
- A DEFAULT row whose SQL does not actually assign a literal, or where TRANSFORMATION_RULE leaves it unclear whether the default is unconditional or blank-only.

Report EVERY distinct problem you find. A row may produce several findings — one per problem, each naming the single field key most responsible. Do not stop at the first. Skip rows that are genuinely correct; most rows should produce nothing.

Use "error" when the row cannot be implemented as written. Use "warning" when it is implementable but disagrees with its stated requirement or is ambiguous.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly:
{ "findings": [ { "id": "<id>", "field": "<field key>", "severity": "error" | "warning", "issue": "<short description>" }, ... ] }`;
}

const JSON_ONLY_SYSTEM_PROMPT = 'You are a strict JSON API. Your entire response must be exactly one valid JSON object — no prose before or after it, no markdown code fences, no explanation. If you have nothing to report, still return the JSON shape requested with empty arrays.';

/** Pulls a JSON object out of the model's text even if it ignored the "no commentary" instruction
 * and wrapped the JSON in explanation and/or markdown fences — tries a fenced block first, then
 * falls back to a string-aware brace scan for the first balanced {...} anywhere in the text (aware
 * of quoted strings/escapes, so a brace character inside a quoted "issue" description can't throw
 * the scan off). This is what actually fixed the "model did not return valid JSON" failures: the
 * model was reliably complying with the JSON shape, just not with "nothing else" — the naive
 * "whole text or fenced block" parse was failing on the leading/trailing text around it. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall through to the brace scan below */ }
  }
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in the model response.');
  let depth = 0; let inString = false; let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error('Unbalanced JSON object in the model response.');
}

async function callClaude(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5', max_tokens: maxTokens, system: JSON_ONLY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`);
  const json = await res.json();
  // `content[0]` isn't reliably the text block — a leading block of another type (e.g. thinking)
  // silently made this always return '' (json.content?.[0]?.text was undefined every time), which
  // is exactly what caused the "(empty response)" failures: the call was succeeding, just never
  // finding the text. Search the array instead of assuming position.
  const blocks = Array.isArray(json.content) ? json.content : [];
  const textBlock = blocks.find((b: any) => b?.type === 'text' && typeof b.text === 'string');
  if (textBlock) return textBlock.text;
  // Still nothing — surface exactly why, so this can't silently regress into another blind guess.
  const blockTypes = blocks.map((b: any) => b?.type ?? 'unknown').join(', ') || 'none';
  throw new Error(`Anthropic response had no text content block (stop_reason: ${json.stop_reason ?? 'unknown'}, content blocks: [${blockTypes}]).`);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured for this Edge Function.' }), { status: 500, headers: jsonHeaders });

    const body: RequestBody = await req.json();
    let prompt: string;
    let maxTokens: number;
    if (body.task === 'rules') {
      if (!body.rows?.length) return new Response(JSON.stringify({ error: 'No rows were provided.' }), { status: 400, headers: jsonHeaders });
      prompt = rulesPrompt(body.rows); maxTokens = 2000;
    } else if (body.task === 'golden-sync') {
      prompt = goldenSyncPrompt(body.removed ?? [], body.added ?? []); maxTokens = 1500;
    } else if (body.task === 'technical-rule') {
      if (!body.context) return new Response(JSON.stringify({ error: 'No row context supplied.' }), { status: 400, headers: jsonHeaders });
      prompt = technicalRulePrompt(body.context); maxTokens = 1200;
    } else if (body.task === 'mapping-review') {
      if (!body.rows?.length) return new Response(JSON.stringify({ findings: [] }), { headers: jsonHeaders });
      prompt = mappingReviewPrompt(body.structureIdent ?? '(unnamed structure)', body.rows, body.optionalFields ?? [], body.criticalFields ?? []); maxTokens = 4000;
    } else {
      return new Response(JSON.stringify({ error: 'Unknown task.' }), { status: 400, headers: jsonHeaders });
    }

    const text = await callClaude(apiKey, prompt, maxTokens);
    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch {
      // Truncated into the error message itself (not just the `raw` field) so it actually shows up
      // client-side — the client only surfaces `body.error`, and a truncated response cut off
      // mid-JSON (hit max_tokens) looks identical to a malformed one without seeing this.
      const preview = text.length > 300 ? `${text.slice(0, 300)}…` : text;
      return new Response(JSON.stringify({ error: `The model did not return valid JSON: ${preview || '(empty response)'}`, raw: text }), { status: 502, headers: jsonHeaders });
    }

    return new Response(JSON.stringify(parsed), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error.' }), { status: 500, headers: jsonHeaders });
  }
});

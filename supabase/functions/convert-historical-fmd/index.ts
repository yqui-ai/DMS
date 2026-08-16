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
interface MappingReviewRow { id: string; structureIdent: string; fields: Record<string, string> }
type RequestBody =
  | { task: 'rules'; rows: RuleRequestRow[] }
  | { task: 'mapping-review'; rows: MappingReviewRow[]; optionalFields: string[] };

// Mirrors src/lib/mappingRulePolicy.ts's MAPPING_RULE_POLICY_TEXT — Deno can't import from src/,
// so this is a deliberate duplicate. Update both together.
const MAPPING_REVIEW_POLICY = `Every field in the Source, Mapping, and Target sections of a row must be populated, EXCEPT the fields listed as allowed to be blank below.

MAPPING_TYPE must be exactly one of: COPY, TRANSFORM, XREF, DEFAULT.

- If MAPPING_TYPE is COPY: TRANSFORMATION_RULE must be exactly "1:1", and TECHNICAL_RULE must be in the form "<table>-<field>" (the target table and field, hyphen-separated).
- If MAPPING_TYPE is DEFAULT: TECHNICAL_RULE must express a literal default-value assignment in the form "<table>-<field> = <value>" (value may be quoted text like "TEST" or a bare number like 123).
- If MAPPING_TYPE is XREF: the cross-reference (XREF) table/object name must be explicitly mentioned in BOTH TRANSFORMATION_RULE and TECHNICAL_RULE.
- If MAPPING_TYPE is TRANSFORM: TRANSFORMATION_RULE and TECHNICAL_RULE must both be populated with real, non-generic transformation logic (not just restating the field name).`;

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

function mappingReviewPrompt(rows: MappingReviewRow[], optionalFields: string[]): string {
  const rowLines = rows.map((r) => `${r.id} (structure: ${r.structureIdent}): ${JSON.stringify(r.fields)}`).join('\n');
  return `You are auditing rows of a Field Mapping Document (FMD) against this policy:

${MAPPING_REVIEW_POLICY}

Fields allowed to be blank: ${optionalFields.join(', ') || '(none)'}.

Rows to check, one per line as "<id> (structure: <name>): <field JSON>":
${rowLines}

For each row that violates the policy, report ONE finding: a short, specific description (e.g. "TECHNICAL_RULE is blank", "MAPPING_TYPE is COPY but TRANSFORMATION_RULE is \\"Concat fields\\", expected \\"1:1\\"", "MAPPING_TYPE \\"Lookup\\" is not one of COPY/TRANSFORM/XREF/DEFAULT"), AND the single field key from the row's JSON most responsible for the violation (e.g. "TECHNICAL_RULE", "MAPPING_TYPE", "SRC_FIELD_DESC" — whichever field is blank or wrong; if MAPPING_TYPE itself is invalid, use "MAPPING_TYPE"). Only include rows with an actual violation — skip rows that fully comply. Use "error" for a blank required field or an invalid MAPPING_TYPE value; use "warning" for a formatting/content mismatch against an otherwise valid MAPPING_TYPE.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly:
{ "findings": [ { "id": "<id>", "field": "<field key>", "severity": "error" | "warning", "issue": "<short description>" }, ... ] }`;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}

async function callClaude(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return json.content?.[0]?.text ?? '';
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
    } else if (body.task === 'mapping-review') {
      if (!body.rows?.length) return new Response(JSON.stringify({ findings: [] }), { headers: jsonHeaders });
      prompt = mappingReviewPrompt(body.rows, body.optionalFields ?? []); maxTokens = 2000;
    } else {
      return new Response(JSON.stringify({ error: 'Unknown task.' }), { status: 400, headers: jsonHeaders });
    }

    const text = await callClaude(apiKey, prompt, maxTokens);
    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch {
      return new Response(JSON.stringify({ error: 'The model did not return valid JSON.', raw: text }), { status: 502, headers: jsonHeaders });
    }

    return new Response(JSON.stringify(parsed), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error.' }), { status: 500, headers: jsonHeaders });
  }
});

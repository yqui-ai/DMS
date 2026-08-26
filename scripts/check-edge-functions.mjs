/**
 * Parse-checks every Supabase Edge Function.
 *
 * `npm run build` compiles only `src/` — `supabase/functions/` is Deno code with URL imports and is
 * excluded from the app's tsconfig, so a syntax error there passes every local check and only
 * surfaces as a 400 from `supabase functions deploy`, minutes later and with a much worse message.
 * That happened: a string literal broken across two lines shipped straight through a clean build.
 *
 * This only checks that the file PARSES — it deliberately doesn't type-check, since resolving Deno's
 * `https://` imports isn't possible here. Catching syntax errors before a deploy round-trip is the
 * whole point; anything deeper is the function's own runtime error handling.
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'supabase/functions';
if (!fs.existsSync(ROOT)) {
  console.log('No edge functions to check.');
  process.exit(0);
}

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
};
walk(ROOT);

let failed = 0;
for (const file of files) {
  const source = ts.createSourceFile(
    file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS,
  );
  const diagnostics = source.parseDiagnostics ?? [];
  if (diagnostics.length === 0) {
    console.log(`ok   ${file}`);
    continue;
  }
  failed += 1;
  console.error(`FAIL ${file}`);
  for (const d of diagnostics.slice(0, 10)) {
    const { line, character } = source.getLineAndCharacterOfPosition(d.start ?? 0);
    console.error(`     ${line + 1}:${character + 1}  ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} edge function${failed === 1 ? '' : 's'} failed to parse — deploying would return a 400.`);
  process.exit(1);
}
console.log(`\n${files.length} edge function file${files.length === 1 ? '' : 's'} parse cleanly.`);

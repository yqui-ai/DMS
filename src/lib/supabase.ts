import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Which required variables are missing, or null when the app is configured.
 *
 * Vite inlines `import.meta.env.VITE_*` at BUILD time, so a deployment built without them ships a
 * bundle with `undefined` baked in — setting them on the host afterwards changes nothing until a
 * rebuild. That is the trap this exists for.
 *
 * It is a flag rather than a thrown error on purpose. `createClient(undefined, undefined)` throws
 * during module evaluation, and an import-time throw cannot be caught by anything in `main.tsx`:
 * the module graph is evaluated before the first statement runs, so React never mounts and the page
 * renders completely blank with only a console message. A blank page is the least diagnosable
 * failure a web app has. `main.tsx` reads this and renders something a person can act on. */
export const supabaseConfigError: string | null = (() => {
  const missing = [
    !url && 'VITE_SUPABASE_URL',
    !anonKey && 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean) as string[];
  return missing.length ? missing.join(' and ') : null;
})();

/** The placeholders keep `createClient` from throwing during import when configuration is missing.
 * Nothing ever calls through them: `main.tsx` refuses to mount the app while
 * `supabaseConfigError` is set. */
export const supabase = createClient(
  url ?? 'https://placeholder.invalid',
  anonKey ?? 'placeholder',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

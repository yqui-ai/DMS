import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../supabase';

const THROTTLE_MS = 4200;
const TIMEOUT_MS = 30000;

let lastCallAt = 0;
/** Anthropic rate limits are per-minute, not per-request — spacing batched calls out avoids
 * tripping them when a feature needs several calls back to back. Shared module-level state (not
 * per-caller) so throttling actually holds across every feature that calls the Edge Function, not
 * just within one of them. */
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastCallAt));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
  return fn();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timed out')), ms))]);
}

/** A non-2xx response from the function surfaces client-side as a generic "Edge Function returned
 * a non-2xx status code" — the supabase-js client doesn't read the response body for you, even
 * though our function always replies with `{error: "<real reason>"}` JSON on failure. Dig it out
 * of `error.context` (the raw Response) so callers/toasts show the actual cause — a bad API key,
 * an Anthropic rate limit, a stale/undeployed function — instead of a message that explains
 * nothing. Falls back to the generic message if the body isn't the JSON shape we expect. */
async function describeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return `${body.error} (HTTP ${error.context.status})`;
    } catch {
      // Body wasn't JSON — fall through to the generic message below.
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Invokes the shared 'convert-historical-fmd' Edge Function (see its file header for the full
 * task list) — throttled and timed out, throwing on either a transport error or an `{error}`
 * response body so every caller can just try/catch around one thing. */
export async function invokeAiTask(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await throttled(() => withTimeout(supabase.functions.invoke('convert-historical-fmd', { body }), TIMEOUT_MS));
  if (error) throw new Error(await describeError(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

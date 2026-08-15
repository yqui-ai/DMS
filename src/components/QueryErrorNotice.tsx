import { AlertTriangle } from 'lucide-react';

/** Distinguishes "query failed" (e.g. table doesn't exist — a migration wasn't applied) from a genuine empty result. */
export function QueryErrorNotice({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <AlertTriangle size={26} className="text-red mb-3" />
      <div className="text-lg font-semibold text-text">Couldn't load this data</div>
      <p className="mt-1.5 text-sm text-muted max-w-md">
        This usually means a database migration hasn't been applied yet. Check the Supabase SQL Editor
        against everything in <code className="font-mono text-xs2 bg-surface-2 px-1 py-0.5 rounded">supabase/migrations/</code>.
      </p>
      <p className="mt-2 text-xs2 font-mono text-red bg-red-light rounded px-2 py-1 max-w-lg break-words">{message}</p>
    </div>
  );
}

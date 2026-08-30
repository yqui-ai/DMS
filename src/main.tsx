import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './index.css';
import { Providers } from './app/providers';
import { router } from './app/router';
import { supabaseConfigError } from './lib/supabase';

const root = createRoot(document.getElementById('root')!);

/** A misconfigured deployment says so, on the page.
 *
 * Without this the app rendered nothing at all: `createClient` threw while the module graph was
 * being evaluated, React never mounted, and the only trace was a console message nobody sees unless
 * they open devtools and reload. A blank page is indistinguishable from a broken build, a bad
 * route, a CDN problem or an outage — it sends you looking everywhere except at the one setting
 * that is actually wrong.
 *
 * Deliberately plain DOM rather than a React tree: whatever is broken here is upstream of the app,
 * so the message must not depend on any of it. */
if (supabaseConfigError) {
  root.render(
    <div style={{
      fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
      maxWidth: 620, margin: '15vh auto', padding: '0 24px', color: '#1d2129', lineHeight: 1.55,
    }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 10px' }}>
        DMS is not configured
      </h1>
      <p style={{ fontSize: 14, margin: '0 0 14px' }}>
        This build is missing <code style={{
          fontFamily: 'ui-monospace, monospace', background: '#f1f5f9', padding: '2px 5px', borderRadius: 4,
        }}>{supabaseConfigError}</code>, so it cannot reach its database.
      </p>
      <p style={{ fontSize: 13, color: '#69707c', margin: 0 }}>
        These are read at build time, not at run time. Set them in the hosting project&apos;s
        environment variables and then <strong>redeploy</strong> — adding them without a rebuild
        leaves the old bundle in place, still missing them.
      </p>
    </div>,
  );
} else {
  root.render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );
}

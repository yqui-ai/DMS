# Starter scaffold

Drop these into a fresh Vite app to skip phase-1 boilerplate:

```bash
npm create vite@latest dms -- --template react-ts && cd dms
npm i @supabase/supabase-js @tanstack/react-query react-router-dom zustand reactflow lucide-react clsx
npm i -D tailwindcss postcss autoprefixer && npx tailwindcss init -p
```
Then copy: `tailwind.config.ts`, `src/styles/tokens.css` (from ../design/tokens.css),
`src/types/entities.ts` (from ../types), and every file under `src/` here.
Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

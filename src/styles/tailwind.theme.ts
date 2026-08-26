import type { Config } from 'tailwindcss';

/**
 * DMS Tailwind theme. Values are the exact prototype tokens.
 * Keep CSS variables as the source of truth (styles/tokens.css) so dark mode works
 * by swapping variables on <html class="dark">.
 */
export const dmsTheme: Config['theme'] = {
  extend: {
    colors: {
      ink: { DEFAULT: '#16191f', 2: '#20242c', 3: '#2a2f39' },
      bg: 'var(--bg)',
      surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)', 3: 'var(--surface-3)' },
      line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)', soft: 'var(--line-soft)' },
      text: 'var(--text)',
      muted: 'var(--muted)',
      blue: { DEFAULT: '#0a4f8c', deep: '#003a70', mid: '#3d7dbd', light: '#e8f0f9', pale: '#f3f7fb' },
      red: { DEFAULT: '#da291c', light: '#fdecea', ink: '#a81409' },
      amber: { DEFAULT: '#e2a900', ink: '#8a5a00', bg: '#fff7e6' },
      green: { DEFAULT: '#15803d', bg: '#e7f6ed' },
      violet: { DEFAULT: '#7c3aed', deep: '#6d28d9', bg: '#ede9fe' },
      teal: { DEFAULT: '#0f766e', bg: '#e6f4f1' },
      slate2: '#334155',
      neutralTag: { bg: '#eceff3', ink: '#525a66' },
    },
    fontFamily: {
      sans: ["'IBM Plex Sans'", 'system-ui', 'sans-serif'],
      mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
    },
    fontSize: {
      // FOUR real steps — 10.5 / 12 / 14 / 16 — plus kpi for big numbers. The scale previously had
      // twelve sizes with seven of them between 10.5px and 14px; 0.5px apart is invisible as
      // hierarchy but very visible as misalignment, which is why the UI never looked settled.
      '2xs': ['10.5px', '1.35'],   // micro labels, timestamps, counts
      sm2: ['12px', '1.45'],       // body, tables, form controls — the default
      md: ['14px', '1.45'],        // emphasis, subheads
      xl: ['16px', '1.35'],        // page and dialog titles
      kpi: ['22px', '1.1'],        // KPI figures only
      // Retired names, aliased to the nearest survivor so old markup keeps rendering correctly.
      // Don't use these in new code.
      xs2: ['10.5px', '1.35'],
      xs: ['10.5px', '1.35'],
      sm: ['12px', '1.45'],
      base: ['12px', '1.45'],
      lg: ['14px', '1.45'],
      '2xl': ['16px', '1.35'],
      '3xl': ['16px', '1.35'],
    },
    borderRadius: { sm: '6px', DEFAULT: '8px', md: '9px', lg: '10px', xl: '11px', '2xl': '12px', pill: '999px' },
    boxShadow: {
      card: '0 1px 2px rgba(22,28,40,.06), 0 0 0 1px rgba(22,28,40,.04)',
      cardHover: '0 6px 20px rgba(10,79,140,.13)',
      node: '0 1px 3px rgba(15,23,42,.08)',
      nodeSelected: '0 3px 12px rgba(15,23,42,.16)',
      frozenCol: '-6px 0 8px -6px rgba(22,28,40,.12)',
    },
    spacing: { 0.5: '2px', 1.5: '6px', 2.5: '10px', 3.5: '14px', 4.5: '18px', 5.5: '22px' },
  },
};

/**
 * Component recipes (implement as cva variants or plain components):
 *
 * Button  base: inline-flex items-center gap-[7px] font-semibold text-base rounded-[8px] px-4 py-[9px]
 *   primary: bg-blue text-white hover:bg-blue-deep
 *   secondary: bg-surface text-text shadow-[inset_0_0_0_1px_var(--line)] hover:bg-blue-pale
 *   ghost: text-blue px-2 py-1.5 hover:bg-blue-light
 *   dangerGhost: text-red hover:bg-red-light
 *   focus-visible: outline 2px solid var(--blue-mid), offset 1px
 *
 * Tag     base: inline-flex items-center gap-[5px] text-xs font-semibold px-2.5 py-[3px] rounded-pill
 *   accent: bg-blue-light text-blue-deep      neutral: bg-[#eceff3] text-[#525a66]
 *   warn:   bg-[#fff7e6] text-[#8a5a00]        danger: bg-red-light text-red-ink
 *   identifier tags (table/field/job/variable) always use font-mono font-bold:
 *     table/object → bg-blue-light text-blue     connection/format → bg-violet-bg text-violet-deep
 *     column/key   → bg-teal-bg  text-teal       rule column → bg-green-bg text-green
 *     variable     → bg-amber-bg text-amber-ink
 *
 * Card    bg-surface rounded-lg shadow-card p-4..p-5
 * Input   w-full text-base bg-surface border border-line-strong rounded-[8px] px-[11px] py-2 min-h-[38px]
 *         hover:border-[#b9c1cc] focus-visible:border-blue-mid focus-visible:ring-4 focus-visible:ring-blue-light
 * Field label: block text-sm2 font-semibold text-muted mb-[5px]
 * Table   th: 11.5px/700 uppercase tracking-[.04em] text-muted bg-surface-3 px-3.5 py-2.5 sticky top-0
 *         td: px-3.5 py-2.5 border-t border-line;  .num: text-right tabular-nums
 *         row hover: bg-blue-pale;  selected row: bg-blue-light
 * KPI     number 22px/700, label 11.5px/600 uppercase tracking-[.04em] text-muted
 * StatDot 6px circle: idle #9aa3af · running #e2a900 · ok #1e6bb8 · error #da291c
 */

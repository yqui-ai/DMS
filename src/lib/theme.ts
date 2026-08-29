import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'dms-theme';
const BRAND_KEY = 'dms-brand';

/** Brand themes repaint the ACCENTS only — primary actions, links, selection, tags, status. The
 * surfaces stay the same clean white/grey in every brand, which is what keeps a brand from turning
 * into a costume.
 *
 * Adding one is a block in `styles/tokens.css` plus an entry here. Nothing in a component changes,
 * because no component may write a colour literal (see the `design-system` skill) — that rule is
 * exactly what makes this possible. */
export interface Brand {
  id: string;
  label: string;
  /** A swatch for the picker, so the choice is visible before it is made. */
  swatch: string;
}

export const BRANDS: Brand[] = [
  { id: 'default', label: 'DMS', swatch: '#0a4f8c' },
  // The swatch has to be the palette it actually applies — it advertised the pre-2026-08-29 values
  // for a while, so the picker was showing one theme and the app was rendering another.
  { id: 'theme1', label: 'Theme 1', swatch: 'linear-gradient(90deg,#12295c,#0a63d2,#0c7684,#6d33d9,#d60006)' },
];

/** Dark mode and brand are independent. A brand has to look right in both, and someone who prefers
 * dark shouldn't lose it by picking a brand. */
export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [brand, setBrand] = useState(
    () => document.documentElement.dataset.brand ?? localStorage.getItem(BRAND_KEY) ?? 'default',
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    // The neutral default carries no attribute at all, so `:root` applies unmodified rather than
    // through a block that would have to restate every token.
    if (brand === 'default') delete document.documentElement.dataset.brand;
    else document.documentElement.dataset.brand = brand;
    localStorage.setItem(BRAND_KEY, brand);
  }, [brand]);

  const toggle = useCallback(() => setDark((d) => !d), []);
  return { dark, toggle, brand, setBrand };
}

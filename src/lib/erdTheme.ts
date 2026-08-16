import { useEffect, useState } from 'react';

/** Local (not DB-backed) preference for the dependency diagram's visual style — Simple matches the
 * rest of the app's light UI, Futuristic is a dark gradient/glow treatment. Remembered per browser
 * via localStorage since it's a personal display preference, not shared program data. */
export type ErdTheme = 'simple' | 'futuristic';
const STORAGE_KEY = 'dms.erdTheme';

/** Plain (non-hook) read of the current preference — for the Excel export, which builds its
 * dependency-diagram picture outside of React and needs to match whatever's on screen right now. */
export const getErdTheme = (): ErdTheme => (localStorage.getItem(STORAGE_KEY) === 'futuristic' ? 'futuristic' : 'simple');

export function useErdTheme(): [ErdTheme, (theme: ErdTheme) => void] {
  const [theme, setTheme] = useState<ErdTheme>(getErdTheme);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, theme); }, [theme]);
  return [theme, setTheme];
}

import type { Config } from 'tailwindcss';
import { dmsTheme } from './src/styles/tailwind.theme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: dmsTheme,
  plugins: [],
} satisfies Config;

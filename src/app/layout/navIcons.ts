import {
  AlertTriangle, ArrowLeftRight, ArrowRightLeft, BookOpen, CheckCheck, Circle, CircleHelp, Code,
  Database, FilePlus, FileText, Files, Filter, GitBranch, GitCompare, GitFork, History, Inbox, Key,
  Layers, LayoutDashboard, ListChecks, Merge, Plug, Repeat, Scale, Search, Settings, ShieldAlert,
  ShieldCheck, Shuffle, Split, Table2, Terminal, Upload, Wand2, Workflow,
  type LucideIcon,
} from 'lucide-react';

/** The icons the navigation refers to by name, resolved explicitly.
 *
 * Sidebar and TabStrip both used to do `import * as icons from 'lucide-react'` and index into it
 * with a kebab→Pascal conversion. That reads neatly and costs the entire library: a namespace
 * import is a live binding to every export, so no bundler can tree-shake it, and all ~1500 icons
 * shipped in the eager chunk — for the thirty-six actually named in a nav config. This map is the
 * same lookup with the set written down, which is also the only version a bundler can prove.
 *
 * Adding a nav item with a new icon means adding it here. That is the intended friction: the
 * failure is a missing icon at build time in one known place, rather than a silently absent glyph
 * discovered on the screen. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  'alert-triangle': AlertTriangle,
  'arrow-left-right': ArrowLeftRight,
  'arrow-right-left': ArrowRightLeft,
  'book-open': BookOpen,
  'check-check': CheckCheck,
  'circle-help': CircleHelp,
  code: Code,
  database: Database,
  'file-plus': FilePlus,
  'file-text': FileText,
  files: Files,
  filter: Filter,
  'git-branch': GitBranch,
  'git-compare': GitCompare,
  'git-fork': GitFork,
  history: History,
  inbox: Inbox,
  key: Key,
  layers: Layers,
  'layout-dashboard': LayoutDashboard,
  'list-checks': ListChecks,
  merge: Merge,
  plug: Plug,
  repeat: Repeat,
  scale: Scale,
  search: Search,
  settings: Settings,
  'shield-alert': ShieldAlert,
  'shield-check': ShieldCheck,
  shuffle: Shuffle,
  split: Split,
  'table-2': Table2,
  terminal: Terminal,
  upload: Upload,
  'wand-2': Wand2,
  workflow: Workflow,
};

/** The nav item's icon, or undefined when it names one that isn't registered. */
export const navIcon = (name?: string): LucideIcon | undefined => (name ? NAV_ICONS[name] : undefined);

/** The Sidebar's fallback — every row keeps its icon column aligned even if the name is unknown. */
export const FALLBACK_NAV_ICON = Circle;

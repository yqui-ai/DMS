import type { ErdTheme } from './erdTheme';

/** Renders the same star-shaped (root + direct prerequisites) dependency graph the on-screen
 * DependencyDiagram shows, as a flat SVG → PNG — used to embed a real picture of the ERD into the
 * FMD Excel export's Dependencies sheet, where a live React Flow canvas obviously can't run. Takes
 * the same Simple/Futuristic theme as the on-screen toggle so the exported picture always matches
 * whatever's currently selected, instead of drifting from it. Layout constants mirror the on-screen
 * component: 2 columns up to 10 dependencies, 3 beyond that, mandatory rows first. */

interface DiagramRoot { objectId: string; description?: string }
interface DiagramDependency {
  requiresIdent: string;
  requiresDescription?: string;
  requiresCategory?: string;
  requiresComponent?: string;
  mandatory: boolean;
}

const NODE_W = 240;
const NODE_H = 100;
const COL_GAP = 26;
const ROW_GAP = 30;
const TOP_GAP = 56;
const PAD = 18;
const LEGEND_W = 168;
const LEGEND_H = 50;

const RED = '#da291c';
const LINE = '#d6dbe2';
const MUTED = '#69707c';
const TEXT = '#1d2129';

const GLOW_RED = '#ff5470';
const GLOW_CYAN = '#4fd1ff';
const GLOW_BLUE = '#7cb3ff';

const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Greedy word-wrap into at most `maxLines` lines of ~`charsPerLine`, ellipsizing the last line if
 * there's more text than fits — good enough for a small SVG label, not a full typesetting engine. */
function wrapLines(text: string, charsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > charsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = next;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    const consumed = lines.slice(0, maxLines - 1).join(' ').length + (maxLines > 1 ? maxLines - 1 : 0);
    if (consumed + last.length < text.length) lines[maxLines - 1] = truncate(last, charsPerLine);
  }
  return lines;
}

export function buildDependencySvg(root: DiagramRoot, dependencies: DiagramDependency[], theme: ErdTheme = 'simple'): { svg: string; width: number; height: number } {
  const futuristic = theme === 'futuristic';
  const sorted = [...dependencies].sort((a, b) => Number(b.mandatory) - Number(a.mandatory));
  const maxCols = sorted.length > 10 ? 3 : 2;
  const cols = Math.max(1, Math.min(maxCols, sorted.length || 1));
  const rows = Math.ceil(sorted.length / cols) || 0;
  const gridWidth = cols * NODE_W + (cols - 1) * COL_GAP;
  const width = Math.max(gridWidth + PAD * 2, LEGEND_W + PAD * 2 + 40);
  const height = PAD + NODE_H + TOP_GAP + rows * NODE_H + Math.max(0, rows - 1) * ROW_GAP + PAD;

  const rootX = PAD + gridWidth / 2 - NODE_W / 2;
  const rootY = PAD;
  const rootCx = rootX + NODE_W / 2;
  const rootBottomY = rootY + NODE_H;

  const defs = futuristic ? `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1e2a4a" /><stop offset="55%" stop-color="#261c47" /><stop offset="100%" stop-color="#1f2b52" />
      </linearGradient>
      <linearGradient id="rootGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#2f6fed" /><stop offset="100%" stop-color="#17306e" />
      </linearGradient>
      <linearGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#253158" /><stop offset="100%" stop-color="#171f38" />
      </linearGradient>
      <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="5" />
      </filter>
    </defs>
  ` : '';

  const glowRect = (x: number, y: number, w: number, h: number, color: string) =>
    futuristic ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="none" stroke="${color}" stroke-width="5" opacity="0.6" filter="url(#glow)" />` : '';
  const glowLine = (d: string, color: string) =>
    futuristic ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="5" opacity="0.5" filter="url(#glow)" />` : '';

  const bg = futuristic
    ? `<rect width="${width}" height="${height}" fill="url(#bgGrad)" />`
    : `<rect width="${width}" height="${height}" fill="#ffffff" />`;

  let edges = '';
  let nodes = `
    ${glowRect(rootX, rootY, NODE_W, NODE_H, GLOW_BLUE)}
    <rect x="${rootX}" y="${rootY}" width="${NODE_W}" height="${NODE_H}" rx="9" fill="${futuristic ? 'url(#rootGrad)' : '#0a4f8c'}" stroke="${futuristic ? GLOW_BLUE : 'none'}" stroke-width="${futuristic ? 1 : 0}" />
    <text x="${rootCx}" y="${rootY + 26}" text-anchor="middle" font-family="Consolas,monospace" font-weight="bold" font-size="13" fill="#ffffff">${escapeXml(truncate(root.objectId, 24))}</text>
    ${wrapLines(root.description ?? '', 34, 2).map((line, i) => `<text x="${rootCx}" y="${rootY + 46 + i * 14}" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#ffffffcc">${escapeXml(line)}</text>`).join('')}
  `;

  sorted.forEach((d, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = PAD + col * (NODE_W + COL_GAP);
    const y = PAD + NODE_H + TOP_GAP + row * (NODE_H + ROW_GAP);
    const cx = x + NODE_W / 2;
    const semanticColor = d.mandatory ? RED : '#9aa4b2';
    const glowColor = d.mandatory ? GLOW_RED : GLOW_CYAN;
    const stroke = futuristic ? glowColor : (d.mandatory ? RED : LINE);
    const dash = d.mandatory ? '' : ' stroke-dasharray="5,4"';
    const edgePath = `M ${rootCx} ${rootBottomY} C ${rootCx} ${rootBottomY + 22}, ${cx} ${y - 22}, ${cx} ${y}`;
    edges += glowLine(edgePath, glowColor);
    edges += `<path d="${edgePath}" fill="none" stroke="${futuristic ? glowColor : semanticColor}" stroke-width="1.5"${dash} />`;

    const descLines = wrapLines(d.requiresDescription || '—', 30, 2);
    const meta = [d.requiresCategory, d.requiresComponent].filter(Boolean).join('  ·  ');

    nodes += `
      ${glowRect(x, y, NODE_W, NODE_H, glowColor)}
      <rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="9" fill="${futuristic ? 'url(#cardGrad)' : '#ffffff'}" stroke="${stroke}" stroke-width="${d.mandatory || futuristic ? '1.75' : '1'}" />
      <text x="${x + 13}" y="${y + 20}" font-family="Consolas,monospace" font-weight="bold" font-size="12" fill="${futuristic ? '#ffffff' : TEXT}">${escapeXml(truncate(d.requiresIdent, 22))}</text>
      ${descLines.map((line, li) => `<text x="${x + 13}" y="${y + 36 + li * 13}" font-family="Arial,sans-serif" font-size="9.5" fill="${futuristic ? '#ffffff99' : MUTED}">${escapeXml(line)}</text>`).join('')}
      ${meta ? `<text x="${x + 13}" y="${y + NODE_H - 22}" font-family="Arial,sans-serif" font-size="9" fill="${futuristic ? '#ffffff99' : MUTED}">${escapeXml(truncate(meta, 32))}</text>` : ''}
      <text x="${x + 13}" y="${y + NODE_H - 8}" font-family="Arial,sans-serif" font-size="9" font-weight="bold" fill="${d.mandatory ? (futuristic ? GLOW_RED : RED) : (futuristic ? GLOW_CYAN : MUTED)}">${d.mandatory ? 'MANDATORY' : 'OPTIONAL'}</text>
    `;
  });

  const legendX = width - LEGEND_W - 10;
  const legendY = 10;
  const legend = `
    <rect x="${legendX}" y="${legendY}" width="${LEGEND_W}" height="${LEGEND_H}" rx="6" fill="${futuristic ? '#141b30ee' : '#ffffff'}" stroke="${futuristic ? '#2c3a5f' : LINE}" />
    <line x1="${legendX + 12}" y1="${legendY + 16}" x2="${legendX + 32}" y2="${legendY + 16}" stroke="${futuristic ? GLOW_RED : RED}" stroke-width="2.5" />
    <text x="${legendX + 38}" y="${legendY + 19}" font-family="Arial,sans-serif" font-size="9" fill="${futuristic ? '#ffffff' : TEXT}">Mandatory</text>
    <line x1="${legendX + 12}" y1="${legendY + 34}" x2="${legendX + 32}" y2="${legendY + 34}" stroke="${futuristic ? GLOW_CYAN : '#9aa4b2'}" stroke-width="2.5" stroke-dasharray="4,3" />
    <text x="${legendX + 38}" y="${legendY + 37}" font-family="Arial,sans-serif" font-size="9" fill="${futuristic ? '#ffffff' : TEXT}">Optional</text>
  `;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defs}
    ${bg}
    ${edges}
    ${nodes}
    ${legend}
  </svg>`;
  return { svg, width, height };
}

/** Rasterizes an SVG string to a base64 PNG (no data: prefix) via an offscreen canvas — the format
 * ExcelJS's addImage needs, since it doesn't accept SVG directly. */
export async function svgToPngBase64(svg: string, width: number, height: number, scale = 2): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not rasterize dependency diagram.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

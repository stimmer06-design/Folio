/**
 * Invoice fonts: the families offered in the generator's font picker, and how
 * an invoice's font (meta.font) is applied to its document. Pure, so the
 * renderer can use it anywhere; the app adds the user's own fonts (from the
 * device, or uploaded) at runtime with registerFont().
 *
 * A font replaces both typefaces a template uses (document.css reads them from
 * --serif and --sans), so any template works with any font. Type sizes are
 * multiplied by --d-scale: each template's sizes were set for its own fonts
 * (EB Garamond, or Hanken Grotesk), and a font with a larger x-height or wider
 * letters is set a little smaller, so the layout keeps its proportions.
 *
 * Files: src/assets/invoice-fonts/ (tools/make-invoice-fonts.py) — WOFF2 for
 * the screen and print, TrueType with identical metrics for PDF embedding.
 */

/** Picker groups, in order. "Your fonts" (device and uploads) is added by the app. */
export const FONT_GROUPS = [
  ['recommended', 'Recommended'],
  ['serif', 'Serif'],
  ['sans', 'Sans'],
  ['mono', 'Monospace'],
];

// xh: x-height, lower: mean lowercase advance, both per em (from make-invoice-fonts.py).
// builtin: the site's own fonts, already loaded and embedded in PDFs by pdf.js.
export const FONTS = [
  { id: 'inter', name: 'Inter', group: 'recommended', kind: 'sans', file: 'inter', xh: 0.546, lower: 0.536 },
  { id: 'eb-garamond', name: 'EB Garamond', group: 'recommended', kind: 'serif', builtin: 'serif', xh: 0.4, lower: 0.437 },
  { id: 'ibm-plex-sans', name: 'IBM Plex Sans', group: 'recommended', kind: 'sans', file: 'ibm-plex-sans', xh: 0.516, lower: 0.505 },
  { id: 'source-serif', name: 'Source Serif', group: 'recommended', kind: 'serif', file: 'source-serif', xh: 0.475, lower: 0.564 },
  { id: 'libre-baskerville', name: 'Libre Baskerville', group: 'serif', kind: 'serif', file: 'libre-baskerville', xh: 0.53, lower: 0.587 },
  { id: 'lora', name: 'Lora', group: 'serif', kind: 'serif', file: 'lora', xh: 0.5, lower: 0.524 },
  { id: 'crimson-pro', name: 'Crimson Pro', group: 'serif', kind: 'serif', file: 'crimson-pro', xh: 0.42, lower: 0.46 },
  { id: 'hanken-grotesk', name: 'Hanken Grotesk', group: 'sans', kind: 'sans', builtin: 'sans', xh: 0.493, lower: 0.504 },
  { id: 'dm-sans', name: 'DM Sans', group: 'sans', kind: 'sans', file: 'dm-sans', xh: 0.513, lower: 0.524 },
  { id: 'work-sans', name: 'Work Sans', group: 'sans', kind: 'sans', file: 'work-sans', xh: 0.5, lower: 0.548 },
  { id: 'manrope', name: 'Manrope', group: 'sans', kind: 'sans', file: 'manrope', xh: 0.54, lower: 0.523 },
  { id: 'ibm-plex-mono', name: 'IBM Plex Mono', group: 'mono', kind: 'mono', file: 'ibm-plex-mono', xh: 0.516, lower: 0.6 },
  { id: 'jetbrains-mono', name: 'JetBrains Mono', group: 'mono', kind: 'mono', file: 'jetbrains-mono', xh: 0.55, lower: 0.6 },
];

/** The fonts each template face was designed with. */
const REFERENCE = { serif: { xh: 0.4, lower: 0.437 }, sans: { xh: 0.493, lower: 0.504 } };
const FALLBACK = {
  serif: 'Garamond, "Times New Roman", serif',
  sans: '"Helvetica Neue", Arial, sans-serif',
  mono: 'Menlo, Consolas, "Liberation Mono", monospace',
};

/** The CSS family name a font is loaded under. */
export const cssFamily = (f) => (f.builtin === 'serif' ? 'EB Garamond' : f.builtin === 'sans' ? 'Hanken Grotesk' : f.family || `Folio ${f.name}`);

/** Fonts added at runtime: { id, name, family, kind: 'serif'|'sans'|'mono'|'custom', xh, lower, source: 'local'|'upload' }. */
const runtime = new Map();
export const registerFont = (def) => runtime.set(def.id, def);
export const unregisterFont = (id) => runtime.delete(id);
export const runtimeFonts = () => [...runtime.values()];

export const fontById = (id) => (id && (FONTS.find((f) => f.id === id) || runtime.get(id))) || null;

/** Size multiplier for a font in a template face ('serif' | 'sans'). */
export function fontScale(f, face) {
  const r = REFERENCE[face] || REFERENCE.serif;
  if (!(f.xh > 0.2 && f.lower > 0.2)) return 1;
  const s = Math.sqrt(r.xh / f.xh) * Math.pow(r.lower / f.lower, 0.2);
  return Math.round(Math.min(1.15, Math.max(0.78, s)) * 1000) / 1000;
}

export function fontStack(f) {
  const quote = (s) => `"${String(s).replace(/["\\]/g, '')}"`;
  return `${quote(cssFamily(f))}, ${FALLBACK[f.kind] || FALLBACK.sans}`;
}

/**
 * Inline style for a document in this font, or '' for the template's own fonts
 * (no font, or one that isn't available in this browser).
 */
export function docFontStyle(fontId, face) {
  const f = fontById(fontId);
  if (!f) return '';
  const stack = fontStack(f);
  return `--serif: ${stack}; --sans: ${stack}; --d-scale: ${fontScale(f, face)}`;
}

/** @font-face rules for the curated families (bundled into site.css; files load only when used). */
export function fontFaceCss(base = 'invoice-fonts/') {
  return FONTS.filter((f) => f.file)
    .map((f) => [['regular', 400], ['semibold', 600]]
      .map(([style, weight]) => `@font-face{font-family:"${cssFamily(f)}";src:url("${base}${f.file}-${style}.woff2") format("woff2");font-weight:${weight};font-style:normal;font-display:swap}`)
      .join('\n'))
    .join('\n');
}

/** TrueType files for the PDF, by weight; null for the built-in fonts (pdf.js embeds those itself). */
export const pdfFiles = (f) => (f && f.file ? { normal: `${f.file}-regular.ttf`, bold: `${f.file}-semibold.ttf` } : null);

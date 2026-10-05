/**
 * Vector PDF export.
 *
 * The invoice is rendered off-screen with the real stylesheet (render.js +
 * document.css), then every word, rule, logo and page break is read from that
 * layout and redrawn with jsPDF using the same typefaces, embedded. The PDF is
 * therefore exactly what the preview shows, for every template, present and
 * future: no template has PDF-specific code. Text stays selectable; a typical
 * invoice is 30–60 KB.
 *
 * Pagination breaks only where no text or keep-together block is cut, repeats
 * the table header on continuation pages and stamps the footer (with page
 * numbers) on each page. jsPDF and the fonts load on demand (loadPdfDeps).
 *
 * Links (the payment link) become clickable link annotations; QR codes are
 * re-encoded and drawn as vector squares, and simple line icons (the button
 * arrow) as vector lines.
 *
 * Fonts: Folio's two families are always embedded. An invoice in another font
 * (core/fonts.js) is embedded when the caller supplies it as TrueType
 * (options.font); jsPDF can embed only TrueType outlines, so for OpenType-CFF,
 * WOFF2 or font-collection files the caller passes nothing and the PDF uses
 * Folio's own font for that face instead. Characters a font lacks fall back,
 * word by word, to Folio's fonts.
 */
import { renderInvoice } from './render.js';
import { encodeQr, qrRuns } from './qr.js';

const PX = 0.75; // CSS px → pt
const PAGE_PX = { letter: [816, 1056], a4: [794, 1123] };

const FONT_FILES = {
  serif: { normal: 'serif-regular.ttf', bold: 'serif-semibold.ttf', italic: 'serif-italic.ttf' },
  sans: { normal: 'sans-regular.ttf', bold: 'sans-semibold.ttf' },
};

// Characters present in the embedded subsets (see README › Fonts).
const SUPPORTED = [[0x20, 0x7e], [0xa0, 0xff], [0x131, 0x131], [0x152, 0x153], [0x160, 0x161], [0x178, 0x178], [0x17d, 0x17e], [0x192, 0x192], [0x2c6, 0x2c6], [0x2dc, 0x2dc], [0x2013, 0x2014], [0x2018, 0x201e], [0x2020, 0x2022], [0x2026, 0x2026], [0x2030, 0x2030], [0x2039, 0x203a], [0x20ac, 0x20ac], [0x20b9, 0x20b9], [0x2122, 0x2122], [0x2212, 0x2212]];
const MISSING = { sans: new Set([0x20b9]), serif: new Set() };
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

function supports(cp, family, embedded) {
  if (!embedded) return cp <= 0xff || WINANSI_EXTRA.includes(String.fromCodePoint(cp));
  if (MISSING[family].has(cp)) return false;
  return SUPPORTED.some(([a, b]) => cp >= a && cp <= b);
}

// Elements that must not be split across pages.
const KEEP = '.doc__pay, .doc__paid, .doc__totals, .doc__note, .doc__to, .doc__due, .doc__dates, .doc__project, thead, tr, .lh__strip, .lh__line, .lg__box, .lg__info, .st__hero, .ti__title, .doc__head, .lh__head, .ti__top, .st__head, .mn__head, .lg__head, .sb__head, .sb__summary';

// ---------------------------------------------------------------- loading
let depsPromise = null;
const fontCache = {};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

function fetchFont(base, file) {
  if (!fontCache[file]) {
    fontCache[file] = fetch(new URL(file, base))
      .then((r) => {
        if (!r.ok) throw new Error(`Font ${file}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      });
  }
  return fontCache[file];
}

/** Load jsPDF and the embedded fonts. Safe to call repeatedly (prefetch). */
export function loadPdfDeps({ jspdfUrl, fontBase }) {
  if (!depsPromise) {
    depsPromise = Promise.all([
      window.jspdf ? Promise.resolve() : loadScript(jspdfUrl),
      ...Object.values(FONT_FILES).flatMap((f) => Object.values(f)).map((file) => fetchFont(fontBase, file).catch(() => null)),
    ]).catch((err) => {
      depsPromise = null;
      throw err;
    });
  }
  return depsPromise;
}

// ---------------------------------------------------------------- measuring
const rgba = (str) => {
  const m = /rgba?\(([^)]+)\)/.exec(str || '');
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return a === 0 ? null : [r, g, b];
};

/** 'custom' for the invoice's own embedded font; otherwise the Folio family closest to the CSS stack. */
function familyOf(cs, custom) {
  const first = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  if (custom && first === custom.family) return 'custom';
  if (/Garamond/i.test(first)) return 'serif';
  if (/Hanken|Grotesk/i.test(first)) return 'sans';
  return /(sans-serif|monospace)\s*$/i.test(cs.fontFamily) ? 'sans' : 'serif';
}

/** Line segments of an inline SVG's stroked paths (M/L/H/V/Z, absolute or relative), in px relative to `rel`. */
function svgLines(svg, r) {
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || !(vb[2] > 0 && vb[3] > 0)) return [];
  const k = Math.min(r.w / vb[2], r.h / vb[3]); // preserveAspectRatio: xMidYMid meet
  const ox = r.x + (r.w - vb[2] * k) / 2 - vb[0] * k;
  const oy = r.y + (r.h - vb[3] * k) / 2 - vb[1] * k;
  const out = [];
  for (const path of svg.querySelectorAll('path')) {
    const cs = getComputedStyle(path);
    const color = rgba(cs.stroke);
    const w = parseFloat(cs.strokeWidth) * k;
    if (!color || !w) continue;
    const tokens = (path.getAttribute('d') || '').match(/[MmLlHhVvZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
    let cmd = '';
    let x = 0;
    let y = 0;
    let start = null;
    let poly = null;
    const flush = () => { if (poly && poly.length > 1) out.push({ type: 'path', points: poly.map(([px, py]) => [ox + px * k, oy + py * k]), w, color }); poly = null; };
    for (let i = 0; i < tokens.length;) {
      if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
      const n = () => parseFloat(tokens[i++]);
      if (cmd === 'Z' || cmd === 'z') { if (poly && start) poly.push([...start]); flush(); [x, y] = start || [x, y]; continue; }
      if (cmd === 'M' || cmd === 'm') {
        flush();
        x = cmd === 'M' ? n() : x + n();
        y = cmd === 'M' ? n() : y + n();
        start = [x, y];
        poly = [[x, y]];
        cmd = cmd === 'M' ? 'L' : 'l'; // further pairs are line-tos
        continue;
      }
      if (cmd === 'L') { x = n(); y = n(); } else if (cmd === 'l') { x += n(); y += n(); } else if (cmd === 'H') x = n(); else if (cmd === 'h') x += n(); else if (cmd === 'V') y = n(); else if (cmd === 'v') y += n(); else break;
      if (!poly) poly = [[x, y]]; else poly.push([x, y]);
    }
    flush();
  }
  return out;
}

const baselineCache = new Map();
/** Where the baseline sits within a text range's box, as a fraction of its height. */
function baselineRatio(cs) {
  const key = `${cs.fontFamily}|${cs.fontWeight}|${cs.fontStyle}`;
  if (!baselineCache.has(key)) {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;left:-30000px;top:0;white-space:nowrap;font-family:${cs.fontFamily};font-weight:${cs.fontWeight};font-style:${cs.fontStyle};font-size:100px;line-height:normal`;
    const text = document.createTextNode('Hxg');
    const mark = document.createElement('span');
    mark.style.cssText = 'display:inline-block;width:1px;height:0;vertical-align:baseline';
    probe.append(text, mark);
    document.body.appendChild(probe);
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 3);
    const r = range.getBoundingClientRect();
    const baseline = mark.getBoundingClientRect().bottom;
    baselineCache.set(key, r.height ? (baseline - r.top) / r.height : 0.8);
    probe.remove();
  }
  return baselineCache.get(key);
}

function blockAlign(el) {
  for (let n = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.display !== 'inline') return cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : cs.textAlign === 'center' ? 'center' : 'left';
  }
  return 'left';
}

/** Read text, rules, fills, images, links and QR codes from a rendered subtree, relative to `origin`. */
function collect(root, origin, skip, custom = null) {
  const ops = [];
  const rel = (r) => ({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });

  const visit = (el) => {
    if (skip && skip(el)) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = rel(el.getBoundingClientRect());

    if (el !== root) {
      const bg = rgba(cs.backgroundColor);
      if (bg && r.w && r.h) ops.push({ type: 'rect', ...r, color: bg });
    }
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(cs[`border${side}Width`]);
      const style = cs[`border${side}Style`];
      const color = rgba(cs[`border${side}Color`]);
      if (!w || style === 'none' || style === 'hidden' || !color) continue;
      const half = w / 2;
      if (side === 'Top') ops.push({ type: 'line', x1: r.x, y1: r.y + half, x2: r.x + r.w, y2: r.y + half, w, color });
      if (side === 'Bottom') ops.push({ type: 'line', x1: r.x, y1: r.y + r.h - half, x2: r.x + r.w, y2: r.y + r.h - half, w, color });
      if (side === 'Left') ops.push({ type: 'line', x1: r.x + half, y1: r.y, x2: r.x + half, y2: r.y + r.h, w, color });
      if (side === 'Right') ops.push({ type: 'line', x1: r.x + r.w - half, y1: r.y, x2: r.x + r.w - half, y2: r.y + r.h, w, color });
    }
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth) {
      ops.push({ type: 'image', ...r, src: el.currentSrc || el.src });
      return;
    }
    if (el.namespaceURI === 'http://www.w3.org/2000/svg') {
      if (el.hasAttribute('data-qr')) ops.push({ type: 'qr', ...r, text: el.getAttribute('data-qr'), margin: Number(el.getAttribute('data-qr-margin')) || 0 });
      else ops.push(...svgLines(el, r));
      return;
    }
    if (el.tagName === 'A' && /^https?:/i.test(el.href)) ops.push({ type: 'link', ...r, url: el.href });

    for (const child of el.childNodes) {
      if (child.nodeType === 1) visit(child);
      else if (child.nodeType === 3 && child.data.trim()) text(child, cs, el);
    }
  };

  const text = (node, cs, parent) => {
    const color = rgba(cs.color);
    if (!color) return;
    const upper = cs.textTransform === 'uppercase';
    const ls = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0;
    const base = {
      family: familyOf(cs, custom),
      bold: parseInt(cs.fontWeight, 10) >= 550,
      italic: cs.fontStyle === 'italic',
      size: parseFloat(cs.fontSize),
      color,
      ls,
      ratio: baselineRatio(cs),
      align: blockAlign(parent),
    };
    const range = document.createRange();
    const re = /\S+/g;
    const words = [...node.data.matchAll(re)];
    for (const [wi, m] of words.entries()) {
      // A real space after each word keeps copied PDF text readable; it is invisible.
      const space = wi < words.length - 1 ? ' ' : '';
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      if (rects.length <= 1) {
        if (rects[0]) ops.push({ type: 'text', str: upper ? m[0].toUpperCase() : m[0], space, ...rel(rects[0]), ...base });
        continue;
      }
      // A long word broken across lines: split it where the browser did.
      let seg = '';
      let segRect = null;
      for (let i = 0; i < m[0].length; i++) {
        range.setStart(node, m.index + i);
        range.setEnd(node, m.index + i + 1);
        const cr = range.getBoundingClientRect();
        if (segRect && Math.abs(cr.top - segRect.top) > 1) {
          ops.push({ type: 'text', str: upper ? seg.toUpperCase() : seg, ...rel(segRect), ...base, align: 'left' });
          seg = '';
          segRect = null;
        }
        seg += m[0][i];
        segRect = segRect ? new DOMRect(segRect.left, segRect.top, cr.right - segRect.left, Math.max(segRect.height, cr.height)) : cr;
      }
      if (seg) ops.push({ type: 'text', str: upper ? seg.toUpperCase() : seg, space, ...rel(segRect), ...base, align: 'left' });
    }
  };

  visit(root);
  return ops;
}

const opTop = (o) => (o.type === 'line' ? Math.min(o.y1, o.y2) : o.type === 'path' ? Math.min(...o.points.map((p) => p[1])) : o.y);
const opBottom = (o) => (o.type === 'line' ? Math.max(o.y1, o.y2) : o.type === 'path' ? Math.max(...o.points.map((p) => p[1])) : o.y + o.h);

// ---------------------------------------------------------------- pagination
function paginate(ops, keeps, { pageH, top, bottom, tables }) {
  const texts = ops.filter((o) => o.type === 'text');
  const contentEnd = Math.max(0, ...ops.filter((o) => o.type !== 'rect').map(opBottom));
  const candidates = [...new Set([...texts.map((o) => o.y + o.h), ...keeps.map((k) => k.bottom)].map((y) => Math.round(y * 2) / 2))].sort((a, b) => a - b);
  const valid = (y) =>
    !texts.some((o) => o.y < y - 0.5 && o.y + o.h > y + 0.5) && !keeps.some((k) => k.top < y - 0.5 && k.bottom > y + 0.5);

  const pages = [];
  let start = 0;
  let headH = 0;
  for (let guard = 0; guard < 200; guard++) {
    const offset = pages.length ? top + headH : 0; // where window content lands on the page
    const limit = start + (pageH - bottom) - offset;
    if (contentEnd <= limit) {
      pages.push({ start, end: Infinity, offset, head: pages.length ? pages[pages.length - 1].nextHead : null });
      break;
    }
    let end = [...candidates].reverse().find((y) => y <= limit && y > start + 40 && valid(y));
    if (end == null) end = [...candidates].reverse().find((y) => y <= limit && y > start + 40) ?? limit;
    const table = tables.find((t) => t.top < end && t.bottom > end + 1 && t.head);
    pages.push({ start, end, offset, head: pages.length ? pages[pages.length - 1].nextHead : null, nextHead: table ? table.head : null });
    headH = table ? table.head.bottom - table.head.top : 0;
    // the next page begins at the first content below the break
    const below = ops.filter((o) => opTop(o) >= end - 0.5).map(opTop);
    start = below.length ? Math.max(end, Math.min(...below) - 1) : end;
  }
  return pages;
}

// ---------------------------------------------------------------- export
export const __debug = {};
/**
 * @param {object} options
 * @param {string} options.fontBase   URL of assets/pdf-fonts/
 * @param {string} options.jspdfUrl
 * @param {object} [options.font]     the invoice's own font, as TrueType:
 *   { family (its CSS family name), face ('serif'|'sans': Folio's font to fall back to),
 *     normal (base64), bold (base64, optional), covers(codePoint) → boolean }
 */
export async function createPdf(inv, totals, { fontBase, jspdfUrl, font = null }) {
  await loadPdfDeps({ jspdfUrl, fontBase });
  const { jsPDF } = window.jspdf;
  const paper = inv.meta.paper === 'a4' ? 'a4' : 'letter';
  const [PW, PH] = PAGE_PX[paper];

  // Fonts first: whether the invoice's own font embeds decides how its words are read.
  const doc = new jsPDF({ unit: 'pt', format: paper, compress: true });
  let embedded = true;
  for (const [fam, styles] of Object.entries(FONT_FILES)) {
    for (const [style, file] of Object.entries(styles)) {
      const data = await fontCache[file];
      if (!data) { embedded = false; continue; }
      doc.addFileToVFS(file, data);
      doc.addFont(file, `Folio-${fam}`, style);
    }
  }
  let custom = null;
  if (font && font.normal && embedded) {
    try {
      doc.addFileToVFS('invoice-font-normal.ttf', font.normal);
      doc.addFont('invoice-font-normal.ttf', 'Folio-custom', 'normal');
      if (font.bold) {
        doc.addFileToVFS('invoice-font-bold.ttf', font.bold);
        doc.addFont('invoice-font-bold.ttf', 'Folio-custom', 'bold');
      }
      // Parse now, so a font jsPDF can't read falls back here rather than mid-page.
      for (const style of font.bold ? ['normal', 'bold'] : ['normal']) {
        doc.setFont('Folio-custom', style);
        if (!(doc.getTextWidth('Ag0') > 0)) throw new Error('unreadable font');
      }
      custom = font;
    } catch {
      custom = null;
    }
  }
  const has = (cp, fam) => (fam === 'custom' ? custom.covers(cp) : supports(cp, fam, embedded));

  // 1. Render off-screen with the live stylesheet.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  // Exact glyph advances: some platforms round them to whole pixels on screen,
  // which would leave uneven gaps between words drawn at their true widths.
  host.style.cssText = 'position:absolute;left:-30000px;top:0;pointer-events:none;text-rendering:geometricPrecision;';
  host.innerHTML = renderInvoice(inv, totals);
  document.body.appendChild(host);
  try {
    const docEl = host.querySelector('.doc');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all([...docEl.querySelectorAll('img')].map((img) => (img.decode ? img.decode().catch(() => {}) : null)));

    const origin = docEl.getBoundingClientRect();
    const cs = getComputedStyle(docEl);
    const padTop = parseFloat(cs.paddingTop);
    const padBottom = parseFloat(cs.paddingBottom);
    const foot = docEl.querySelector('.doc__foot');

    // 2. Measure.
    const ops = collect(docEl, origin, (el) => el === foot, custom);
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - origin.top, bottom: r.bottom - origin.top };
    };
    const keeps = [...docEl.querySelectorAll(KEEP)].filter((el) => !foot || !foot.contains(el)).map(box);
    // never leave a group heading alone at the foot of a page
    docEl.querySelectorAll('.doc__group-head').forEach((h) => {
      if (h.nextElementSibling) keeps.push({ top: box(h).top, bottom: box(h.nextElementSibling).bottom });
    });
    const tables = [...docEl.querySelectorAll('table')].map((t) => {
      const head = t.tHead;
      return { ...box(t), head: head ? { ...box(head), ops: collect(head, origin, null, custom) } : null };
    });

    // 3. Paginate.
    // Content may run down to just above the footer rule, as it does in the preview.
    const footTop = foot ? PH - (origin.bottom - foot.getBoundingClientRect().top) : PH - padBottom;
    const bottom = Math.min(padBottom, PH - footTop + 14);
    const pages = paginate(ops, keeps, { pageH: PH, top: padTop, bottom, tables });
    Object.assign(__debug, { ops, pages, PH, bottom });

    // 4. Draw.
    const setFont = (o, fam) => {
      if (fam === 'custom') {
        doc.setFont('Folio-custom', o.bold && custom.bold ? 'bold' : 'normal');
        return;
      }
      const style = o.bold ? 'bold' : o.italic && fam === 'serif' ? 'italic' : 'normal';
      doc.setFont(embedded ? `Folio-${fam}` : fam === 'serif' ? 'times' : 'helvetica', embedded ? style : o.bold ? 'bold' : o.italic ? 'italic' : 'normal');
    };

    const draw = (list, dy, clip) => {
      const inWindow = (o) => !clip || (opTop(o) >= clip.start - 0.5 && opBottom(o) <= clip.end + 0.5);
      for (const o of list) {
        if (o.type === 'rect') {
          const t = clip ? Math.max(o.y, clip.start) : o.y;
          const b = clip ? Math.min(o.y + o.h, clip.end) : o.y + o.h;
          if (b <= t) continue;
          doc.setFillColor(...o.color);
          doc.rect(o.x * PX, (t + dy) * PX, o.w * PX, (b - t) * PX, 'F');
        }
      }
      for (const o of list) {
        if (o.type !== 'line') continue;
        let { y1, y2 } = o;
        if (clip) {
          if (y1 === y2) { if (!inWindow(o)) continue; }
          else {
            y1 = Math.max(y1, clip.start);
            y2 = Math.min(y2, clip.end);
            if (y2 <= y1) continue;
          }
        }
        doc.setDrawColor(...o.color);
        doc.setLineWidth(o.w * PX);
        doc.line(o.x1 * PX, (y1 + dy) * PX, o.x2 * PX, (y2 + dy) * PX);
      }
      for (const o of list) {
        if (o.type !== 'image' || !inWindow(o)) continue;
        try {
          const fmt = /^data:image\/jpe?g/.test(o.src) ? 'JPEG' : 'PNG';
          doc.addImage(o.src, fmt, o.x * PX, (o.y + dy) * PX, o.w * PX, o.h * PX, undefined, 'FAST');
        } catch { /* unreadable image: skip */ }
      }
      for (const o of list) {
        if (!inWindow(o)) continue;
        if (o.type === 'path') {
          doc.setDrawColor(...o.color);
          doc.setLineWidth(o.w * PX);
          doc.setLineCap('round');
          doc.setLineJoin('round');
          const [x0, y0] = o.points[0];
          const deltas = o.points.slice(1).map(([x, y], i) => [(x - o.points[i][0]) * PX, (y - o.points[i][1]) * PX]);
          doc.lines(deltas, x0 * PX, (y0 + dy) * PX, [1, 1], 'S', false);
          doc.setLineCap('butt');
          doc.setLineJoin('miter');
        } else if (o.type === 'qr') {
          // Re-encode the link and draw each run of dark modules as one square-ended bar.
          const qr = encodeQr(o.text);
          const m = o.w / (qr.size + o.margin * 2);
          const eps = 0.04; // overlap neighbouring bars so viewers show no hairline seams
          doc.setFillColor(255, 255, 255);
          doc.rect(o.x * PX, (o.y + dy) * PX, o.w * PX, o.h * PX, 'F');
          doc.setFillColor(0, 0, 0);
          for (const [x, y, len] of qrRuns(qr)) {
            doc.rect((o.x + (x + o.margin) * m) * PX, (o.y + dy + (y + o.margin) * m) * PX, (len * m + eps) * PX, (m + eps) * PX, 'F');
          }
        } else if (o.type === 'link') {
          doc.link(o.x * PX, (o.y + dy) * PX, o.w * PX, o.h * PX, { url: o.url });
        }
      }
      for (const o of list) {
        if (o.type !== 'text' || !inWindow(o)) continue;
        // Prefer the word's own face; fall back to the other if a glyph is missing (₹ in Grotesk).
        // An invoice font that lacks a character falls back to Folio's font for the template's face.
        let fam = o.family;
        const cps = [...o.str].map((c) => c.codePointAt(0));
        if (!cps.every((cp) => has(cp, fam))) {
          const others = fam === 'custom' ? [custom.face, custom.face === 'serif' ? 'sans' : 'serif'] : [fam === 'serif' ? 'sans' : 'serif'];
          const other = others.find((f) => cps.every((cp) => has(cp, f)));
          if (other) fam = other;
          else if (fam === 'custom') fam = custom.face;
        }
        const str = [...o.str].map((c) => (has(c.codePointAt(0), fam) ? c : '?')).join('');
        setFont(o, fam);
        doc.setFontSize(o.size * PX);
        doc.setTextColor(...o.color);
        const cs = o.ls * PX;
        doc.setCharSpace(0); // measure bare glyphs (getTextWidth would include the spacing)
        const width = doc.getTextWidth(str) + cs * Math.max(0, str.length - 1);
        doc.setCharSpace(cs);
        let x = o.x * PX;
        if (o.align === 'right') x = (o.x + o.w - o.ls) * PX - width;
        else if (o.align === 'center') x = (o.x + (o.w - o.ls) / 2) * PX - width / 2;
        doc.text(str + (o.space || ''), x, (o.y + o.h * o.ratio + dy) * PX);
        doc.setCharSpace(0);
      }
    };

    pages.forEach((p, i) => {
      if (i > 0) doc.addPage();
      if (p.head) draw(p.head.ops, padTop - p.head.top, null);
      draw(ops, p.offset - p.start, { start: p.start, end: p.end });
    });

    // 5. Footer (with page numbers when there is more than one page).
    if (foot) {
      const spans = foot.querySelectorAll('span');
      const last = spans[spans.length - 1];
      const original = last ? last.textContent : '';
      for (let i = 0; i < pages.length; i++) {
        if (pages.length > 1 && last) last.textContent = `${original}${original ? ' · ' : ''}Page ${i + 1} of ${pages.length}`;
        const fr = foot.getBoundingClientRect();
        const footOps = collect(foot, origin, null, custom);
        const footTopOnPage = PH - (origin.bottom - fr.top);
        doc.setPage(i + 1);
        draw(footOps, footTopOnPage - (fr.top - origin.top), null);
      }
      if (last) last.textContent = original;
    }

    doc.folioFont = custom ? 'embedded' : font ? 'fallback' : 'none'; // for the caller's notice and the tests
    doc.setProperties({
      title: `Invoice ${inv.meta.number}`.trim(),
      subject: inv.client.name ? `Invoice for ${inv.client.name}` : 'Invoice',
      author: inv.business.name || '',
      creator: 'Folio',
    });
    return doc;
  } finally {
    host.remove();
  }
}

export function pdfFileName(inv) {
  const safe = (inv.meta.number || '').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  const client = (inv.client.name || '').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `Invoice${safe ? `-${safe}` : ''}${client ? `-${client}` : ''}.pdf`;
}

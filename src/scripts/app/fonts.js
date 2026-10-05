/**
 * The user's own fonts, in the browser only.
 *
 * - Device fonts: listed with the Local Font Access API (queryLocalFonts), only
 *   after the user asks and the browser grants permission. Fonts chosen from
 *   the list are remembered by name and drawn with CSS local(), so the list
 *   itself is never stored or sent anywhere.
 * - Uploaded fonts (TTF, OTF, WOFF, WOFF2): kept in IndexedDB on this device.
 *
 * Nothing about fonts goes to Folio or to analytics.
 *
 * For PDFs, pdfFont() turns the invoice's font into what core/pdf.js embeds —
 * TrueType only (see core/sfnt.js) — or explains why the PDF uses Folio's own
 * font instead.
 */
import { FONTS, fontById, registerFont, unregisterFont, cssFamily, pdfFiles } from '../core/fonts.js';
import { fontFlavor, fontInfo, covers, woffToSfnt } from '../core/sfnt.js';

export const FONTS_KEY = 'folio:fonts';
const DB_NAME = 'folio-fonts';
const MAX_UPLOAD = 15 * 1024 * 1024;
const MAX_EMBED = 12 * 1024 * 1024;
const EXT = /\.(ttf|otf|woff2?)$/i;

const local = () => { try { return window.localStorage; } catch { return null; } };

// ---------------------------------------------------------------- IndexedDB
function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB is not available'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB blocked'));
  });
}
async function idb(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('files', mode);
      const req = fn(tx.objectStore('files'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('IndexedDB error'));
    });
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------- helpers
export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The font file a PDF could embed: WOFF unpacked; everything else as is. */
async function sfntOf(bytes) {
  return fontFlavor(bytes) === 'woff' ? woffToSfnt(bytes, inflate) : bytes;
}

/** x-height and mean lowercase width per em, measured in the browser (any font format). */
async function measure(family) {
  try { await document.fonts.load(`100px "${family}"`); } catch { /* measured with whatever loaded */ }
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `100px "${family}", serif`;
  const xh = (ctx.measureText('x').actualBoundingBoxAscent || 0) / 100;
  const lower = ctx.measureText('abcdefghijklmnopqrstuvwxyz').width / 26 / 100;
  return { xh: Math.round(xh * 1000) / 1000, lower: Math.round(lower * 1000) / 1000 };
}

const familyFor = (id) => `Folio User ${id.replace(/[^A-Za-z0-9]+/g, ' ').trim()}`.slice(0, 80);

/** Why a font can't go into a PDF, in words. */
export function notEmbeddableReason(reason, name) {
  const why = {
    cff: 'it is an OpenType (CFF) font, and PDFs made here can only include TrueType fonts',
    woff2: 'WOFF2 files can only be shown on screen here; upload the TTF version to include it in PDFs',
    collection: 'it comes from a font collection (.ttc), which PDFs made here can’t include',
    licence: 'its licence doesn’t allow it to be included in documents',
    size: 'the font file is too large to include',
    permission: 'Folio isn’t allowed to read your fonts right now',
    missing: 'it isn’t installed on this device',
    unreadable: 'the font file couldn’t be read',
  }[reason] || 'it can’t be included';
  return `“${name}” isn’t in the PDF because ${why}.`;
}

// ---------------------------------------------------------------- the manager
export class FontLibrary {
  constructor(storage = local()) {
    this.storage = storage;
    this.items = [];
    this.available = new Set(); // ids that loaded in this browser
    this.ttfCache = new Map();
    try {
      const saved = JSON.parse(storage?.getItem(FONTS_KEY) || 'null');
      if (saved && Array.isArray(saved.items)) this.items = saved.items.filter((x) => x && typeof x.id === 'string' && /^(local|upload):/.test(x.id)).slice(0, 60);
    } catch { this.items = []; }
  }

  static get canScan() {
    return typeof window !== 'undefined' && 'queryLocalFonts' in window;
  }

  persist() {
    try { this.storage?.setItem(FONTS_KEY, JSON.stringify({ v: 1, items: this.items })); } catch { /* storage full: fonts work until reload */ }
  }

  /** Make the user's fonts usable in this page. Resolves when each has loaded or failed. */
  async init() {
    await Promise.all(this.items.map((item) => this.activate(item).catch(() => false)));
  }

  /** Load one font into document.fonts and register it with the renderer. */
  async activate(item) {
    const family = familyFor(item.id);
    const faces = [];
    if (item.source === 'local') {
      faces.push(new FontFace(family, `local("${item.faces.normal}")`, { weight: '400' }));
      if (item.faces.bold) faces.push(new FontFace(family, `local("${item.faces.bold}")`, { weight: '600' }));
    } else {
      const rec = await idb('readonly', (s) => s.get(item.id));
      if (!rec || !rec.data) throw new Error('missing');
      faces.push(new FontFace(family, rec.data, { weight: '400 700' }));
    }
    await Promise.all(faces.map((f) => f.load()));
    faces.forEach((f) => document.fonts.add(f));
    registerFont({ id: item.id, name: item.name, family, kind: item.kind || 'custom', xh: item.xh, lower: item.lower, source: item.source });
    this.available.add(item.id);
    return true;
  }

  isAvailable(id) {
    return !/^(local|upload):/.test(id || '') || this.available.has(id);
  }

  nameOf(id) {
    const f = fontById(id);
    if (f) return f.name;
    const item = this.items.find((x) => x.id === id);
    return item ? item.name : '';
  }

  /** Fonts installed on the device, grouped by family (asks for permission). */
  async scan() {
    const fonts = await window.queryLocalFonts();
    const byFamily = new Map();
    for (const f of fonts) {
      if (!byFamily.has(f.family)) byFamily.set(f.family, []);
      byFamily.get(f.family).push(f);
    }
    const pick = (list, re) => list.find((f) => re.test(f.style));
    const out = [];
    for (const [family, list] of byFamily) {
      const regular = pick(list, /^(regular|book|roman|normal|text|plain)$/i) || pick(list, /^medium$/i) || list.find((f) => !/italic|oblique/i.test(f.style)) || list[0];
      const bold = pick(list, /^(semi ?bold|demi ?bold|semibold|demi)$/i) || pick(list, /^bold$/i) || null;
      out.push({ family, regular, bold: bold && bold !== regular ? bold : null });
    }
    return out.sort((a, b) => a.family.localeCompare(b.family));
  }

  /** Add a scanned device family to "Your fonts". */
  async addLocal({ family, regular, bold }) {
    const id = `local:${regular.postscriptName}`.slice(0, 70);
    let item = this.items.find((x) => x.id === id);
    if (!item) {
      item = { id, source: 'local', name: family, faces: { normal: regular.postscriptName, bold: bold ? bold.postscriptName : '' }, kind: 'custom', addedAt: new Date().toISOString() };
      // Whether the PDF can include it (read once, now that the user has chosen it).
      try {
        const bytes = new Uint8Array(await (await regular.blob()).arrayBuffer());
        const info = fontInfo(bytes);
        item.embeddable = info.embeddable && bytes.length <= MAX_EMBED;
        item.reason = info.embeddable ? (bytes.length > MAX_EMBED ? 'size' : '') : info.reason;
      } catch {
        item.embeddable = false;
        item.reason = 'unreadable';
      }
      await this.activate(item);
      Object.assign(item, await measure(familyFor(id)));
      registerFont({ id, name: item.name, family: familyFor(id), kind: 'custom', xh: item.xh, lower: item.lower, source: 'local' });
      this.items.unshift(item);
      this.persist();
    }
    return item;
  }

  /** Add an uploaded font file. Throws with a message for the user. */
  async addUpload(file) {
    if (!EXT.test(file.name)) throw new Error('Choose a font file: TTF, OTF, WOFF or WOFF2.');
    if (file.size > MAX_UPLOAD) throw new Error('That font file is larger than 15 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const flavor = fontFlavor(bytes);
    if (!flavor || flavor === 'collection') throw new Error(flavor === 'collection' ? 'Font collections (.ttc) can’t be used. Choose a single font file.' : 'That file isn’t a font Folio can read.');
    const id = `upload:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    let info = { names: {}, embeddable: false, reason: flavor };
    try {
      if (flavor !== 'woff2') info = fontInfo(await sfntOf(bytes));
    } catch {
      info = { names: {}, embeddable: false, reason: 'unreadable' };
    }
    const fromFile = file.name.replace(EXT, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const name = (info.names.family || fromFile).trim().slice(0, 60) || 'Uploaded font';
    // Check the browser can draw it before keeping it.
    const family = familyFor(id);
    const face = new FontFace(family, bytes.buffer.slice(0), { weight: '400 700' });
    try { await face.load(); } catch { throw new Error('Your browser can’t use that font file.'); }
    await idb('readwrite', (s) => s.put({ data: bytes.buffer, name: file.name, type: flavor }, id));
    document.fonts.add(face);
    const item = { id, source: 'upload', name, file: file.name.slice(0, 120), format: flavor, size: bytes.length, kind: 'custom', embeddable: info.embeddable && bytes.length <= MAX_EMBED, reason: info.embeddable ? (bytes.length > MAX_EMBED ? 'size' : '') : info.reason, addedAt: new Date().toISOString() };
    Object.assign(item, await measure(family));
    registerFont({ id, name, family, kind: 'custom', xh: item.xh, lower: item.lower, source: 'upload' });
    this.available.add(id);
    this.items.unshift(item);
    this.persist();
    return item;
  }

  async remove(id) {
    this.items = this.items.filter((x) => x.id !== id);
    this.persist();
    this.available.delete(id);
    unregisterFont(id);
    if (id.startsWith('upload:')) await idb('readwrite', (s) => s.delete(id)).catch(() => {});
  }

  /**
   * The invoice's font for core/pdf.js, as { font, notice }:
   *   font    { family, face, normal, bold, covers } to embed, or null
   *   notice  a sentence for the user when the PDF uses Folio's font instead
   * `face` is the template's face ('serif' | 'sans'), the fallback.
   */
  async pdfFont(fontId, face, base) {
    const f = fontById(fontId);
    if (!f || f.builtin) return { font: null, notice: '' };
    try {
      if (f.file || FONTS.includes(f)) {
        const files = pdfFiles(f);
        const [normal, bold] = await Promise.all([this.fetchTtf(base + files.normal), this.fetchTtf(base + files.bold)]);
        const ranges = fontInfo(normal).coverage;
        return { font: { family: cssFamily(f), face, normal: toBase64(normal), bold: toBase64(bold), covers: (cp) => covers(ranges, cp) }, notice: '' };
      }
      const item = this.items.find((x) => x.id === fontId);
      if (!item) return { font: null, notice: '' };
      let normal;
      let bold = null;
      if (item.source === 'local') {
        if (!FontLibrary.canScan) return { font: null, notice: notEmbeddableReason('permission', item.name) };
        let found;
        try {
          found = await window.queryLocalFonts({ postscriptNames: [item.faces.normal, item.faces.bold].filter(Boolean) });
        } catch {
          return { font: null, notice: notEmbeddableReason('permission', item.name) };
        }
        const reg = found.find((x) => x.postscriptName === item.faces.normal);
        if (!reg) return { font: null, notice: notEmbeddableReason('missing', item.name) };
        normal = new Uint8Array(await (await reg.blob()).arrayBuffer());
        const b = item.faces.bold && found.find((x) => x.postscriptName === item.faces.bold);
        if (b) bold = new Uint8Array(await (await b.blob()).arrayBuffer());
      } else {
        const rec = await idb('readonly', (s) => s.get(item.id));
        if (!rec) return { font: null, notice: notEmbeddableReason('missing', item.name) };
        normal = await sfntOf(new Uint8Array(rec.data));
      }
      const info = fontInfo(normal);
      if (!info.embeddable) return { font: null, notice: notEmbeddableReason(info.reason, item.name) };
      if (normal.length > MAX_EMBED) return { font: null, notice: notEmbeddableReason('size', item.name) };
      if (bold && !(fontInfo(bold).embeddable && bold.length <= MAX_EMBED)) bold = null;
      return { font: { family: cssFamily(f), face, normal: toBase64(normal), bold: bold ? toBase64(bold) : null, covers: (cp) => covers(info.coverage, cp) }, notice: '' };
    } catch (err) {
      console.error(err);
      return { font: null, notice: notEmbeddableReason('unreadable', f.name) };
    }
  }

  async fetchTtf(url) {
    if (!this.ttfCache.has(url)) {
      this.ttfCache.set(url, fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Font ${url}: HTTP ${r.status}`);
        return r.arrayBuffer();
      }).then((b) => new Uint8Array(b)).catch((err) => { this.ttfCache.delete(url); throw err; }));
    }
    return this.ttfCache.get(url);
  }
}

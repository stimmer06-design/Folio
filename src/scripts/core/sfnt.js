/**
 * Just enough of the OpenType file format to decide whether a user's font can
 * go into a PDF, and to name it. Pure (Uint8Array in, plain values out).
 *
 *   fontFlavor(bytes)    'truetype' | 'cff' | 'collection' | 'woff' | 'woff2' | null
 *   fontInfo(bytes)      { names, coverage, embeddable } for a TrueType/CFF file
 *   woffToSfnt(bytes, inflate)   WOFF 1.0 → the font file inside it
 *
 * jsPDF embeds TrueType outlines only, so CFF-flavoured OpenType, WOFF2 and
 * font collections are recognised here and reported as "not embeddable".
 */

const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
const i16 = (b, o) => { const v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; };

export function fontFlavor(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const t = tag(bytes, 0);
  if (t === '\0\x01\0\0' || t === 'true') return 'truetype';
  if (t === 'OTTO') return 'cff';
  if (t === 'ttcf') return 'collection';
  if (t === 'wOFF') return 'woff';
  if (t === 'wOF2') return 'woff2';
  return null;
}

/** The table directory of a plain (sfnt) font: tag → { offset, length }. */
export function tables(bytes) {
  const n = u16(bytes, 4);
  const out = new Map();
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (o + 16 > bytes.length) break;
    out.set(tag(bytes, o), { offset: u32(bytes, o + 8), length: u32(bytes, o + 12) });
  }
  return out;
}

/** Unicode code points with a glyph, as sorted [first, last] ranges. */
export function coverage(bytes, dir = tables(bytes)) {
  const cmap = dir.get('cmap');
  if (!cmap) return [];
  const base = cmap.offset;
  const count = u16(bytes, base + 2);
  let best = null;
  let rank = -1;
  for (let i = 0; i < count; i++) {
    const r = base + 4 + i * 8;
    const platform = u16(bytes, r);
    const encoding = u16(bytes, r + 2);
    const sub = base + u32(bytes, r + 4);
    const format = u16(bytes, sub);
    const score = (format === 12 ? 2 : format === 4 ? 1 : 0) * 10 + (platform === 3 && (encoding === 10 || encoding === 1) ? 2 : platform === 0 ? 1 : 0);
    if ((format === 4 || format === 12) && (platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))) && score > rank) {
      best = { sub, format };
      rank = score;
    }
  }
  if (!best) return [];
  const ranges = [];
  const add = (a, b) => {
    const last = ranges[ranges.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else ranges.push([a, b]);
  };
  const s = best.sub;
  if (best.format === 4) {
    const segX2 = u16(bytes, s + 6);
    const ends = s + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const offsets = deltas + segX2;
    const segs = [];
    for (let i = 0; i < segX2 / 2; i++) {
      const end = u16(bytes, ends + i * 2);
      const start = u16(bytes, starts + i * 2);
      const delta = i16(bytes, deltas + i * 2);
      const ro = u16(bytes, offsets + i * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let glyph;
        if (ro === 0) glyph = (c + delta) & 0xffff;
        else {
          const at = offsets + i * 2 + ro + (c - start) * 2;
          glyph = at + 1 < bytes.length ? u16(bytes, at) : 0;
          if (glyph) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph) segs.push(c);
      }
    }
    segs.sort((a, b) => a - b).forEach((c) => add(c, c));
  } else {
    const groups = u32(bytes, s + 12);
    const list = [];
    for (let i = 0; i < Math.min(groups, 100000); i++) {
      const g = s + 16 + i * 12;
      list.push([u32(bytes, g), u32(bytes, g + 4)]);
    }
    list.sort((a, b) => a[0] - b[0]).forEach(([a, b]) => add(a, b));
  }
  return ranges;
}

/** Binary search in coverage ranges. */
export function covers(ranges, cp) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid][0]) hi = mid - 1;
    else if (cp > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Family, style, full and PostScript names from the 'name' table. */
export function names(bytes, dir = tables(bytes)) {
  const t = dir.get('name');
  const out = {};
  if (!t) return out;
  const count = u16(bytes, t.offset + 2);
  const strings = t.offset + u16(bytes, t.offset + 4);
  const want = { 1: 'family', 2: 'style', 4: 'full', 6: 'postscript', 16: 'typoFamily' };
  const found = {};
  for (let i = 0; i < count; i++) {
    const r = t.offset + 6 + i * 12;
    const platform = u16(bytes, r);
    const lang = u16(bytes, r + 4);
    const id = u16(bytes, r + 6);
    const len = u16(bytes, r + 8);
    const at = strings + u16(bytes, r + 10);
    if (!want[id] || at + len > bytes.length) continue;
    let text = '';
    if (platform === 3 || platform === 0) for (let k = 0; k + 1 < len; k += 2) text += String.fromCharCode(u16(bytes, at + k));
    else if (platform === 1) for (let k = 0; k < len; k++) text += String.fromCharCode(bytes[at + k]);
    else continue;
    const score = platform === 3 && lang === 0x409 ? 3 : platform === 3 ? 2 : 1;
    if (!found[id] || score > found[id].score) found[id] = { text, score };
  }
  for (const [id, key] of Object.entries(want)) if (found[id]) out[key] = found[id].text.replace(/[\u0000-\u001f]/g, '').trim();
  if (out.typoFamily) out.family = out.typoFamily;
  delete out.typoFamily;
  return out;
}

/**
 * OS/2 fsType: 2 means "restricted license embedding" — the font's licence
 * forbids putting it in documents, so Folio doesn't.
 */
export function licenceAllowsEmbedding(bytes, dir = tables(bytes)) {
  const os2 = dir.get('OS/2');
  if (!os2) return true;
  return (u16(bytes, os2.offset + 8) & 0x000f) !== 0x0002;
}

/** Everything the app needs to know about a font file. */
export function fontInfo(bytes) {
  const flavor = fontFlavor(bytes);
  if (flavor !== 'truetype' && flavor !== 'cff') return { flavor, names: {}, coverage: [], embeddable: false, reason: flavor };
  const dir = tables(bytes);
  const truetype = flavor === 'truetype' && dir.has('glyf') && dir.has('loca');
  const licensed = licenceAllowsEmbedding(bytes, dir);
  return {
    flavor,
    names: names(bytes, dir),
    coverage: coverage(bytes, dir),
    embeddable: truetype && licensed,
    reason: !truetype ? 'cff' : !licensed ? 'licence' : '',
  };
}

/** Unpack a WOFF 1.0 file. `inflate(Uint8Array) → Promise<Uint8Array>` decompresses zlib data. */
export async function woffToSfnt(bytes, inflate) {
  if (fontFlavor(bytes) !== 'woff') throw new Error('Not a WOFF file');
  const numTables = u16(bytes, 12);
  const entries = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    entries.push({ tag: bytes.subarray(o, o + 4), offset: u32(bytes, o + 4), compLength: u32(bytes, o + 8), origLength: u32(bytes, o + 12), checksum: u32(bytes, o + 16) });
  }
  const datas = [];
  for (const e of entries) {
    const raw = bytes.subarray(e.offset, e.offset + e.compLength);
    const data = e.compLength < e.origLength ? await inflate(raw) : raw;
    if (data.length !== e.origLength) throw new Error('Damaged WOFF file');
    datas.push(data);
  }
  const headerLen = 12 + numTables * 16;
  const total = headerLen + datas.reduce((s, d) => s + ((d.length + 3) & ~3), 0);
  const out = new Uint8Array(total);
  const put32 = (o, v) => { out[o] = v >>> 24; out[o + 1] = (v >>> 16) & 255; out[o + 2] = (v >>> 8) & 255; out[o + 3] = v & 255; };
  const put16 = (o, v) => { out[o] = v >>> 8; out[o + 1] = v & 255; };
  out.set(bytes.subarray(4, 8), 0); // the original sfnt version
  put16(4, numTables);
  let pow = 1;
  let log = 0;
  while (pow * 2 <= numTables) { pow *= 2; log++; }
  put16(6, pow * 16);
  put16(8, log);
  put16(10, numTables * 16 - pow * 16);
  let at = headerLen;
  entries.forEach((e, i) => {
    const d = 12 + i * 16;
    out.set(e.tag, d);
    put32(d + 4, e.checksum);
    put32(d + 8, at);
    put32(d + 12, datas[i].length);
    out.set(datas[i], at);
    at += (datas[i].length + 3) & ~3;
  });
  return out;
}

// Invoice fonts: node --test tests/unit.fonts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONTS, FONT_GROUPS, fontById, fontScale, docFontStyle, fontFaceCss, registerFont, unregisterFont, pdfFiles, cssFamily } from '../src/scripts/core/fonts.js';
import { fontFlavor, fontInfo, covers, woffToSfnt, tables } from '../src/scripts/core/sfnt.js';
import { createInvoice, createItem, normalizeInvoice, profileFrom, FONT_ID } from '../src/scripts/core/model.js';
import { computeTotals } from '../src/scripts/core/calc.js';
import { renderInvoice } from '../src/scripts/core/render.js';
import { Library } from '../src/scripts/core/store.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const asset = (f) => new Uint8Array(readFileSync(path.join(ROOT, 'src', 'assets', 'invoice-fonts', f)));

test('fonts: thirteen curated families, grouped, each with matching WOFF2 + TrueType files and a licence', () => {
  assert.equal(FONTS.length, 13);
  assert.deepEqual(FONT_GROUPS.map((g) => g[0]), ['recommended', 'serif', 'sans', 'mono']);
  for (const g of ['recommended', 'serif', 'sans', 'mono']) assert.ok(FONTS.some((f) => f.group === g), g);
  for (const f of FONTS) {
    assert.match(f.id, FONT_ID);
    if (f.builtin) continue;
    for (const file of [`${f.file}-regular.woff2`, `${f.file}-semibold.woff2`, `${f.file}-regular.ttf`, `${f.file}-semibold.ttf`]) {
      assert.ok(existsSync(path.join(ROOT, 'src/assets/invoice-fonts', file)), file);
    }
    const ttf = asset(`${f.file}-regular.ttf`);
    const info = fontInfo(ttf);
    assert.equal(info.flavor, 'truetype', f.name);
    assert.equal(info.embeddable, true, `${f.name} can be embedded in PDFs`);
    assert.equal(info.names.family, f.name === 'Source Serif' ? 'Source Serif 4' : f.name);
    for (const ch of 'AZaz09$€£¥.,-–—') assert.ok(covers(info.coverage, ch.codePointAt(0)), `${f.name} has ${ch}`);
    assert.equal(fontFlavor(asset(`${f.file}-regular.woff2`)), 'woff2');
    assert.deepEqual(pdfFiles(f), { normal: `${f.file}-regular.ttf`, bold: `${f.file}-semibold.ttf` });
    assert.ok(existsSync(path.join(ROOT, 'src/assets/invoice-fonts', `OFL-${(f.name === 'Source Serif' ? 'Source Serif 4' : f.name).replace(/ /g, '-')}.txt`)), `${f.name} licence`);
  }
  const css = fontFaceCss('invoice-fonts/');
  assert.equal((css.match(/@font-face/g) || []).length, 22, 'two weights × eleven families (Garamond and Grotesk are already on the site)');
  assert.match(css, /font-family:"Folio Inter";src:url\("invoice-fonts\/inter-regular\.woff2"\) format\("woff2"\);font-weight:400/);
});

test('fonts: sizes are matched to each template face; a template in its own font is unchanged', () => {
  assert.equal(fontScale(fontById('eb-garamond'), 'serif'), 1);
  assert.equal(fontScale(fontById('hanken-grotesk'), 'sans'), 1);
  const inter = fontById('inter');
  assert.ok(fontScale(inter, 'serif') < fontScale(inter, 'sans'), 'a large x-height is set smaller in a Garamond template');
  assert.ok(fontScale(fontById('eb-garamond'), 'sans') > 1, 'Garamond is set larger in a sans template');
  for (const f of FONTS) for (const face of ['serif', 'sans']) {
    const s = fontScale(f, face);
    assert.ok(s >= 0.78 && s <= 1.15, `${f.id} ${face} ${s}`);
  }
  assert.equal(fontScale({ xh: 0, lower: 0 }, 'serif'), 1, 'unknown metrics: no scaling');
  assert.equal(docFontStyle('', 'serif'), '');
  assert.equal(docFontStyle('no-such-font', 'serif'), '');
  assert.equal(docFontStyle('local:Missing-Font', 'serif'), '', 'a device font that isn’t here: the template’s own fonts');
  assert.match(docFontStyle('inter', 'serif'), /^--serif: "Folio Inter", "Helvetica Neue", Arial, sans-serif; --sans: "Folio Inter", .*; --d-scale: 0\.8\d+$/);
  registerFont({ id: 'upload:abc123', name: 'Mine', family: 'Folio User upload abc123', kind: 'custom', xh: 0.5, lower: 0.5 });
  assert.equal(cssFamily(fontById('upload:abc123')), 'Folio User upload abc123');
  assert.match(docFontStyle('upload:abc123', 'sans'), /"Folio User upload abc123"/);
  unregisterFont('upload:abc123');
  assert.equal(fontById('upload:abc123'), null);
});

test('fonts: the invoice keeps its font — across templates, reloads and new invoices — and stays safe', () => {
  const inv = createInvoice({ template: 'modern' });
  inv.items = [createItem({ description: 'Design', quantity: '1', price: '100' })];
  inv.meta.font = 'eb-garamond';
  inv.meta.template = 'executive';
  const back = normalizeInvoice(JSON.parse(JSON.stringify(inv)));
  assert.equal(back.meta.font, 'eb-garamond');
  assert.equal(back.meta.template, 'executive');
  for (const ok of ['inter', 'local:AvenirNext-Regular', 'upload:muu1x2']) assert.equal(normalizeInvoice({ meta: { font: ok } }).meta.font, ok);
  for (const bad of ['x"; background:url(//evil)', 'local:../x y', 'upload:<script>', 'INTER', 42, 'a'.repeat(41)]) {
    assert.equal(normalizeInvoice({ meta: { font: bad } }).meta.font, '', String(bad));
  }
  assert.equal(normalizeInvoice({ meta: {} }).meta.font, '', 'old invoices: the template’s own fonts');
  assert.equal(createInvoice({}).meta.font, '');
  assert.equal(profileFrom(inv).font, 'eb-garamond');
  // the next invoice starts in the same font; a duplicate keeps it but not the payment link
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const lib = new Library(storage);
  const first = lib.ensureCurrent();
  first.meta.font = 'lora';
  first.items = [createItem({ description: 'Work', quantity: '1', price: '50' })];
  first.paylink = { id: 'k3x9m2q7v8w4p1t6r5n0', url: 'https://folioinvoice.com/pay/k3x9m2q7v8w4p1t6r5n0', provider: 'stripe', amount: 5000, currency: 'USD', number: first.meta.number, status: 'unpaid', createdAt: '', paidAt: '', onInvoice: true, qr: false };
  lib.save(first);
  const copy = lib.duplicate(first.id);
  assert.equal(copy.meta.font, 'lora');
  assert.equal(copy.paylink, null);
  const reloaded = new Library(storage);
  assert.equal(reloaded.get(first.id).meta.font, 'lora');
  assert.equal(reloaded.get(first.id).paylink.id, 'k3x9m2q7v8w4p1t6r5n0');
  const next = reloaded.create();
  assert.equal(next.meta.font, 'lora');
  // rendered: the font replaces both template faces, with matched sizes
  const html = renderInvoice(inv, computeTotals(inv));
  assert.match(html, /<article class="doc doc--[a-z]+ [^"]*doc--font" style="--serif: &quot;EB Garamond&quot;[^"]*--d-scale: 1(\.\d+)?"/);
  inv.meta.font = '';
  assert.doesNotMatch(renderInvoice(inv, computeTotals(inv)), /doc--font|style=/);
});

test('sfnt: tells TrueType from CFF, WOFF2 and collections; unpacks WOFF; respects licences', () => {
  const ttf = asset('lora-regular.ttf');
  assert.equal(fontFlavor(ttf), 'truetype');
  assert.equal(fontFlavor(new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 0, 0, 0, 0, 0, 0, 0])), 'cff');
  assert.equal(fontFlavor(new Uint8Array([0x74, 0x74, 0x63, 0x66, 0, 0, 0, 0, 0, 0, 0, 0])), 'collection');
  assert.equal(fontFlavor(asset('lora-regular.woff2')), 'woff2');
  assert.equal(fontFlavor(new Uint8Array(4)), null);
  assert.equal(fontInfo(asset('lora-regular.woff2')).embeddable, false);
  const info = fontInfo(ttf);
  assert.equal(info.names.full, 'Lora Regular');
  assert.equal(covers(info.coverage, 0x20b9), false, 'Lora has no ₹: the PDF falls back to Folio’s font for it');

  // A WOFF 1.0 file built here from the TrueType file unpacks to the same font.
  const woff = toWoff(ttf);
  assert.equal(fontFlavor(woff), 'woff');
  return woffToSfnt(woff, async (d) => new Uint8Array(inflateSync(d))).then((sfnt) => {
    assert.equal(fontFlavor(sfnt), 'truetype');
    assert.deepEqual([...tables(sfnt).keys()].sort(), [...tables(ttf).keys()].sort());
    assert.equal(fontInfo(sfnt).names.full, 'Lora Regular');
    assert.equal(fontInfo(sfnt).embeddable, true);
    // fsType 2 (restricted licence embedding): not embedded
    const restricted = ttf.slice();
    const os2 = tables(restricted).get('OS/2').offset;
    restricted[os2 + 8] = 0;
    restricted[os2 + 9] = 2;
    assert.equal(fontInfo(restricted).embeddable, false);
    assert.equal(fontInfo(restricted).reason, 'licence');
  });
});

/** WOFF 1.0 encoder (test helper): zlib-compresses each table. */
function toWoff(ttf) {
  const dir = [...tables(ttf).entries()];
  const u32 = (b, o) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
  const parts = dir.map(([tag, { offset, length }]) => {
    const raw = ttf.subarray(offset, offset + length);
    const z = new Uint8Array(deflateSync(raw));
    const data = z.length < raw.length ? z : raw;
    const rec = 12 + dir.findIndex(([t]) => t === tag) * 16;
    return { tag, data, origLength: length, checksum: u32(ttf, rec + 4) };
  });
  const header = 44 + dir.length * 20;
  const total = header + parts.reduce((s, p) => s + ((p.data.length + 3) & ~3), 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  out.set([0x77, 0x4f, 0x46, 0x46], 0);
  out.set(ttf.subarray(0, 4), 4);
  v.setUint32(8, total);
  v.setUint16(12, dir.length);
  let at = header;
  parts.forEach((p, i) => {
    const e = 44 + i * 20;
    out.set([...p.tag].map((c) => c.charCodeAt(0)), e);
    v.setUint32(e + 4, at);
    v.setUint32(e + 8, p.data.length);
    v.setUint32(e + 12, p.origLength);
    v.setUint32(e + 16, p.checksum);
    out.set(p.data, at);
    at += (p.data.length + 3) & ~3;
  });
  return out;
}

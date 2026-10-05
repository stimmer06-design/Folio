// Unit tests for the DOM-free core: node --test tests/unit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals } from '../src/scripts/core/calc.js';
import { createInvoice, createItem, nextInvoiceNumber, incrementNumber, dueDateFor, termsForDueDate, normalizeInvoice, isPristine } from '../src/scripts/core/model.js';
import { renderInvoice } from '../src/scripts/core/render.js';
import { formatMoney, round, parseAmount } from '../src/scripts/core/format.js';
import { Library, STORAGE_KEY } from '../src/scripts/core/store.js';

const inv = (over = {}) => {
  const i = createInvoice({ now: new Date(2026, 9, 1) });
  i.items = [createItem({ description: 'Design', quantity: '2', price: '1200' }), createItem({ description: 'Hosting', quantity: '3', price: '79.99' })];
  Object.assign(i.adjustments, over);
  return i;
};

test('totals: subtotal, discount before tax, shipping untaxed', () => {
  const t = computeTotals(inv({ discountType: 'percent', discountValue: '10', taxRate: '8.25', shipping: '25' }));
  assert.equal(t.subtotal, 2639.97);
  assert.equal(t.discount, 264);
  assert.equal(t.tax, 196.02);           // 8.25% of 2,375.97 = 196.017 → 196.02
  assert.equal(t.shipping, 25);
  assert.equal(t.total, round(2375.97 + t.tax + 25, 2));
});

test('totals: rounding, caps, fixed discount, zero-decimal currency', () => {
  let i = inv({ discountType: 'amount', discountValue: '99999' });
  assert.equal(computeTotals(i).discount, computeTotals(i).subtotal);
  assert.equal(computeTotals(i).total, 0);
  i = inv({ taxRate: '250' });
  assert.equal(computeTotals(i).taxRate, 100);
  i = inv();
  i.meta.currency = 'JPY';
  i.items = [createItem({ quantity: '3', price: '333.4' })];
  assert.equal(computeTotals(i).total, 1000);
  assert.equal(parseAmount('-5'), 0);
  assert.equal(parseAmount('1,250.50'), 1250.5);
});

test('numbering and terms', () => {
  assert.equal(incrementNumber('INV-0041'), 'INV-0042');
  assert.equal(nextInvoiceNumber(['INV-0009', 'INV-0012', 'INV-0003']), 'INV-0013');
  assert.equal(nextInvoiceNumber([]), 'INV-0001');
  assert.equal(nextInvoiceNumber(['2026/7']), '2026/8');
  assert.equal(dueDateFor('2026-10-01', 'net30'), '2026-10-31');
  assert.equal(dueDateFor('2026-10-01', 'receipt'), '2026-10-01');
  assert.equal(dueDateFor('2026-10-01', 'custom', '2026-12-24'), '2026-12-24');
  assert.equal(termsForDueDate('2026-10-01', '2026-10-15'), 'net14');
  assert.equal(termsForDueDate('2026-10-01', '2026-10-20'), 'custom');
});

test('normalize: corrupt and hostile data cannot break the model', () => {
  const n = normalizeInvoice({ items: 'x', meta: { currency: 'XXX', paper: 'scroll' }, business: { name: 42, logo: 'javascript:alert(1)' } });
  assert.equal(n.meta.currency, 'USD');
  assert.equal(n.meta.paper, 'letter');
  assert.equal(n.business.name, '42');
  assert.equal(n.business.logo, null);
  assert.equal(n.items.length, 1);
  assert.equal(isPristine(createInvoice()), true);
});

test('render: escapes user input, shows only filled rows, all totals lines', () => {
  const i = inv({ discountType: 'percent', discountValue: '10', taxRate: '20', taxLabel: 'VAT', shipping: '15', shippingLabel: 'Courier' });
  i.business.name = '<script>alert(1)</script> & Co';
  i.items.push(createItem());
  const html = renderInvoice(i, computeTotals(i));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co'));
  assert.equal((html.match(/doc__desc/g) || []).length, 2, 'blank row omitted without placeholders');
  for (const s of ['Discount (10%)', 'VAT (20%)', 'Courier', 'Total <span>USD</span>', 'Net 30']) assert.ok(html.includes(s), s);
  assert.ok(renderInvoice(i, computeTotals(i), { placeholders: true }).includes('class="is-ph"'));
});

test('library: create, save, duplicate, delete, logo de-duplication, persistence', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let lib = new Library(storage);
  const a = lib.ensureCurrent();
  a.business.name = 'Northwind';
  a.business.logo = 'data:image/png;base64,' + 'A'.repeat(5000);
  a.client.name = 'Harbor & Pine';
  lib.save(a);
  const b = lib.duplicate(a.id);
  assert.equal(b.meta.number, 'INV-0002');
  assert.equal(b.client.name, 'Harbor & Pine');
  const c = lib.create();
  assert.equal(c.meta.number, 'INV-0003');
  assert.equal(c.business.name, 'Northwind', 'business details carry over');
  assert.equal(lib.create().id, c.id, 'New on an untouched invoice re-uses it');
  const stored = JSON.parse(mem.get(STORAGE_KEY));
  assert.equal(Object.keys(stored.assets).length, 1, 'logo stored once');
  lib.remove(b.id);
  lib = new Library(storage);
  assert.equal(lib.invoices.length, 2);
  assert.equal(lib.get(a.id).business.logo.length, a.business.logo.length, 'logo restored');
  lib.remove(a.id); lib.remove(c.id);
  assert.equal(lib.invoices.length, 1, 'deleting the last invoice leaves a fresh one');
});

test('library: imports the original app’s saved invoice', () => {
  const mem = new Map([['invoice-generator:v1', JSON.stringify({ business: { name: 'Old Co' }, customer: { name: 'Client' }, invoice: { number: 'INV-0042', date: '2026-01-01', dueDate: '2026-01-31' }, items: [{ description: 'X', quantity: '1', price: '10' }], taxRate: '5', settings: { currency: 'EUR' } })]]);
  const lib = new Library({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: () => {} });
  const cur = lib.current();
  assert.equal(cur.business.name, 'Old Co');
  assert.equal(cur.client.name, 'Client');
  assert.equal(cur.meta.currency, 'EUR');
  assert.equal(formatMoney(computeTotals(cur).total, 'EUR'), '€10.50');
});

// ---------------------------------------------------------------- templates
import { TEMPLATES, templateById, templateBySlug, CATEGORIES } from '../src/scripts/core/templates.js';
import { sampleInvoice } from '../src/scripts/core/sample.js';

test('templates: registry is complete and consistent', () => {
  assert.ok(TEMPLATES.length >= 12);
  const ids = new Set(); const slugs = new Set();
  for (const t of TEMPLATES) {
    assert.ok(!ids.has(t.id) && !slugs.has(t.slug), `unique ${t.id}`);
    ids.add(t.id); slugs.add(t.slug);
    assert.ok(CATEGORIES.some((c) => c.id === t.category), `${t.id} category`);
    assert.ok(['serif', 'sans'].includes(t.face), `${t.id} uses a brand face`);
    assert.ok(t.summary && t.summary.length > 20, `${t.id} summary`);
    for (const a of t.aliases || []) assert.equal(templateBySlug(a), t, `${t.id} alias ${a}`);
  }
  assert.equal(templateById('nope').id, 'classic', 'unknown ids fall back to Classic');
  assert.equal(templateBySlug('small-business').id, 'professional');
  assert.equal(templateBySlug('design-studio').id, 'studio', 'old links still work');
  assert.equal(templateBySlug('home-services').id, 'services');
});

test('templates: old invoices map typeface → template; new fields default safely', () => {
  assert.equal(normalizeInvoice({ meta: { typeface: 'sans' } }).meta.template, 'modern');
  assert.equal(normalizeInvoice({ meta: { typeface: 'serif' } }).meta.template, 'classic');
  assert.equal(normalizeInvoice({ meta: { template: '<script>' } }).meta.template, 'classic');
  const n = normalizeInvoice({ meta: { template: 'contractor' }, items: [{ description: 'x', group: 'Labor' }] });
  assert.equal(n.meta.template, 'contractor');
  assert.equal(n.items[0].group, 'Labor');
  assert.equal(n.adjustments.paid, '');
  assert.equal(n.meta.project, '');
});

test('templates: switching changes only meta.template (same data, different output)', () => {
  const inv = sampleInvoice({ template: 'freelancer' });
  const before = JSON.stringify({ ...inv, meta: { ...inv.meta, template: null } });
  const outputs = new Set();
  for (const t of TEMPLATES) {
    inv.meta.template = t.id;
    const html = renderInvoice(inv, computeTotals(inv));
    assert.ok(html.includes('Brightwater Analytics') && html.includes('Customer portal redesign'), `${t.id} shows the data`);
    outputs.add(html);
  }
  assert.equal(JSON.stringify({ ...inv, meta: { ...inv.meta, template: null } }), before, 'invoice content untouched');
  assert.equal(outputs.size, TEMPLATES.length, 'every template renders differently');
});

test('templates: deposits, groups, fixed fees, numbering, labels', () => {
  const c = sampleInvoice({ template: 'contractor' });
  const t = computeTotals(c);
  assert.equal(t.paid, 3000);
  assert.equal(t.due, Math.round((t.total - 3000) * 100) / 100);
  const html = renderInvoice(c, t);
  for (const s of ['Labor', 'Materials', 'Labor subtotal', 'Less deposit received', 'Balance due']) assert.ok(html.includes(s), s);
  const s = sampleInvoice({ template: 'studio' });
  const sh = renderInvoice(s, computeTotals(s));
  assert.ok(sh.includes('doc__index">01') && sh.includes('doc__detail'), 'numbered phases with details');
  assert.ok(!sh.includes('>Qty<'), 'fixed fees hide quantity');
  s.items[0].quantity = '2';
  assert.ok(renderInvoice(s, computeTotals(s)).includes('>Qty<'), 'quantity returns when not every line is a fixed fee');
  const f = sampleInvoice({ template: 'freelancer' });
  assert.ok(renderInvoice(f, computeTotals(f)).includes('>Hours<'));
  // a deposit larger than the total never produces a negative balance
  c.adjustments.paid = '999999';
  assert.equal(computeTotals(c).due, 0);
});

test('templates: every composition survives empty, hostile and extreme data', () => {
  const empty = createInvoice();
  const hostile = sampleInvoice();
  hostile.business.name = '<img src=x onerror=alert(1)>';
  hostile.items[0].description = '"><script>alert(1)</script>';
  hostile.items[0].group = '<b>x</b>';
  hostile.meta.project = '</table><script>';
  for (const t of TEMPLATES) {
    for (const inv of [empty, hostile]) {
      inv.meta.template = t.id;
      const html = renderInvoice(inv, computeTotals(inv), { placeholders: inv === empty });
      assert.ok(!/<script|<img src=x|<b>x/.test(html), `${t.id} escapes input`);
    }
  }
});

// ---------------------------------------------------------------- SEO machine: tools, content, markdown, events
import { formatInvoiceNumber, invoiceNumberSequence, salesTax, prefillFromParams, generatorLink } from '../src/scripts/core/tools.js';
import { markdown, inline } from '../build/markdown.mjs';
import { loadContent } from '../build/content.mjs';
import { robotsTxt, sitemapXml, auditPage } from '../build/seo.mjs';
import { mkdtemp, mkdir as mkdirp, writeFile as write } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const registry = { TEMPLATES, CATEGORIES, hasTemplate: (id) => TEMPLATES.some((t) => t.id === id) };
const CONTENT = new URL('../src/content/', import.meta.url).pathname;

test('tools: invoice numbers in every format', () => {
  const date = new Date(2026, 9, 5);
  assert.equal(formatInvoiceNumber({ prefix: 'INV', datePart: 'yyyy', number: 42, digits: 4, date }), 'INV-2026-0042');
  assert.equal(formatInvoiceNumber({ prefix: '', datePart: 'none', number: 7, digits: 3, date }), '007');
  assert.equal(formatInvoiceNumber({ prefix: 'RO', separator: '', datePart: 'yy', number: 9, digits: 1, date }), 'RO269');
  assert.equal(formatInvoiceNumber({ prefix: 'A', separator: '/', datePart: 'yyyy-mm', number: 1, digits: 2, date }), 'A/2026/10/01');
  assert.equal(formatInvoiceNumber({ prefix: 'A', datePart: 'yyyymm', number: -5, digits: 99, date }), 'A-202610-00000000');
  assert.deepEqual(invoiceNumberSequence({ prefix: 'INV', datePart: 'none', number: 9, digits: 4 }, 3), ['INV-0009', 'INV-0010', 'INV-0011']);
  // the generator continues any of these formats
  assert.equal(nextInvoiceNumber(['INV-2026-0042']), 'INV-2026-0043');
});

test('tools: sales tax added and extracted, rounded to the cent', () => {
  assert.deepEqual(salesTax({ amount: '250', rate: '7' }), { net: 250, tax: 17.5, gross: 267.5, rate: 7 });
  assert.deepEqual(salesTax({ amount: '267.50', rate: '7', inclusive: true }), { net: 250, tax: 17.5, gross: 267.5, rate: 7 });
  assert.deepEqual(salesTax({ amount: '541.25', rate: '8.25', inclusive: true }), { net: 500, tax: 41.25, gross: 541.25, rate: 8.25 });
  assert.equal(salesTax({ amount: '100', rate: '500' }).rate, 100, 'rate capped');
  assert.equal(salesTax({ amount: 'abc', rate: '' }).gross, 0);
});

test('tools: prefill parameters are validated, never guessed', () => {
  const p = prefillFromParams(new URLSearchParams('number=INV-2026-0001&item=Design&qty=2&price=1,200.50&tax=8.25&taxLabel=VAT&discount=10&discountType=amount&shipping=25&paid=100&currency=eur'));
  assert.deepEqual(p.meta, { number: 'INV-2026-0001', currency: 'EUR' });
  assert.deepEqual(p.items, [{ description: 'Design', quantity: '2', price: '1200.5' }]);
  assert.deepEqual(p.adjustments, { taxRate: '8.25', taxLabel: 'VAT', discountValue: '10', discountType: 'amount', shipping: '25', paid: '100' });
  const bad = prefillFromParams(new URLSearchParams('price=-5&tax=150&discount=1e9x&currency=XXX&number=' + 'x'.repeat(80)));
  assert.equal(bad.items, null, 'negative price dropped');
  assert.equal(bad.adjustments.taxRate, undefined, 'tax over 100% dropped');
  assert.equal(bad.meta.currency, undefined);
  assert.equal(bad.meta.number.length, 40, 'number truncated');
  assert.equal(prefillFromParams(new URLSearchParams('template=classic')), null);
  assert.equal(generatorLink('../../app/', { number: 'A 1', tax: '', price: '10' }), '../../app/?number=A+1&price=10');
});

test('markdown: headings, lists, tables, notes, FAQ, steps and links', () => {
  const r = markdown(`Intro with a [link](/invoice-guides/x/) and **bold**.

## Step by step

1. **First.** Do this.
2. **Second.** Then that.

| A | B |
| --- | --- |
| 1 | 2 |

> A note.

## Frequently asked questions

### Is it free?

Yes.`, { root: '../../', stepsUnder: 'Step by step' });
  assert.deepEqual(r.headings, [{ id: 'step-by-step', text: 'Step by step' }]);
  assert.match(r.html, /href="\.\.\/\.\.\/invoice-guides\/x\/"/);
  assert.match(r.html, /<ol class="article__list article__list--ordered">/);
  assert.match(r.html, /<th scope="col">A<\/th>[\s\S]*<th scope="row">1<\/th>/);
  assert.match(r.html, /<aside class="article__note"><p>A note.<\/p><\/aside>/);
  assert.deepEqual(r.faqs, [{ q: 'Is it free?', a: ['<p>Yes.</p>'] }]);
  assert.deepEqual(r.steps.map((s) => s.name), ['First', 'Second']);
  assert.deepEqual(r.links, ['/invoice-guides/x/']);
  assert.ok(!r.html.includes('Frequently'), 'FAQ is not repeated in the body');
  assert.equal(inline('<script>'), '&lt;script&gt;');
  assert.throws(() => markdown('<div>raw html</div>'), /Unsupported/);
  assert.throws(() => markdown('[x](javascript:alert(1))'), /root-relative or https/);
  assert.throws(() => markdown('| a |\n| b |'), /separator/);
  assert.throws(() => markdown('## A\n\ntext', { stepsUnder: 'Missing' }), /HowTo/);
});

test('content: the database is valid and covers every layout', async () => {
  const db = await loadContent(CONTENT, registry);
  assert.ok(db.templates.length >= 15 && db.guides.length >= 10 && db.tools.length >= 3);
  // every layout has a page with its slug, so /app/?template=<slug> and the page agree
  for (const t of TEMPLATES) assert.ok(db.get('template', t.slug), `content page for ${t.slug}`);
  for (const slug of ['freelancer', 'contractor', 'photographer', 'designer', 'consultant', 'cleaning-service', 'landscaper', 'web-developer', 'marketing-agency', 'construction', 'plumber', 'electrician', 'mechanic', 'videographer', 'small-business']) {
    const e = db.get('template', slug);
    assert.ok(e, slug);
    assert.match(e.title, /^Free .+ Invoice Template$/, `${slug} H1`);
  }
  // linking engine: explicit first, never itself, never more than asked for
  const plumber = db.get('template', 'plumber');
  const rel = db.related(plumber, 'template', 3);
  assert.deepEqual(rel.map((x) => x.slug), ['electrician', 'contractor', 'cleaning-service']);
  for (const e of db.published) for (const k of ['template', 'guide', 'tool']) {
    const r = db.related(e, k, 3);
    assert.ok(r.length <= 3 && !r.includes(e));
  }
  // samples are distinct: no two pages share a preview
  const firstLines = db.templates.map((e) => JSON.stringify((e.sample || TEMPLATES.find((t) => t.id === e.layout).sample).items[0]));
  const dupes = firstLines.filter((x, i) => firstLines.indexOf(x) !== i);
  assert.ok(dupes.length <= 2, 'pages sharing a layout mostly bring their own example'); // web-developer reuses the freelancer layout’s own example
});

test('content: bad entries fail the build with every problem listed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-content-'));
  await mkdirp(join(dir, 'templates'));
  await mkdirp(join(dir, 'guides'));
  await write(join(dir, 'templates', 'Bad Slug.json'), JSON.stringify({ name: 'X', layout: 'nope', title: 'A title that is far, far too long to be a good title tag on Google', description: 'short', summary: 's', updated: '2026-1-1' }));
  await write(join(dir, 'guides', 'ok.md'), '---\nname: Ok\ntitle: Ok\ndescription: ' + 'x'.repeat(100) + '\nsummary: s\ngroup: g\nupdated: 2026-10-01\nrelatedGuides: missing\n---\nBody');
  await assert.rejects(loadContent(dir, registry), (err) => {
    for (const s of ['slug must be lowercase', 'title tag is', 'description is 5 characters', 'yyyy-mm-dd', 'layout "nope"', 'fields']) assert.match(err.message, new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), s);
    return true;
  });
  // a draft is loaded but not published or linkable
  await write(join(dir, 'templates', 'Bad Slug.json'), '{}');
  const dir2 = await mkdtemp(join(tmpdir(), 'folio-content-'));
  await mkdirp(join(dir2, 'guides'));
  await write(join(dir2, 'guides', 'draft.md'), '---\nname: D\ntitle: D\ndescription: ' + 'x'.repeat(100) + '\nsummary: s\ngroup: g\nupdated: 2026-10-01\nstatus: draft\n---\nBody');
  const db = await loadContent(dir2, registry);
  assert.equal(db.drafts.length, 1);
  assert.equal(db.guides.length, 0);
});

test('seo: robots, sitemap and the page audit', () => {
  const robots = robotsTxt({ url: 'https://x.com' }, { dashboard: true });
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Disallow: \/app\/\?$/m, 'generator states are not crawled');
  assert.match(robots, /^Disallow: \/_seo\/$/m);
  assert.doesNotMatch(robotsTxt({ url: 'https://x.com' }, { dashboard: false }), /_seo/);
  const xml = sitemapXml([{ canonical: 'https://x.com/a/', indexable: true, lastmod: '2026-10-01' }, { canonical: 'https://x.com/404', indexable: false }]);
  assert.match(xml, /<loc>https:\/\/x.com\/a\/<\/loc><lastmod>2026-10-01<\/lastmod>/);
  assert.doesNotMatch(xml, /404/);
  const a = auditPage('<title>T</title><h1>H</h1><main><a href="../b/">b</a><a href="https://e.com">e</a><a href="#x">x</a> one two three</main>', '/a/', 'https://x.com');
  assert.deepEqual(a.links, ['/b/']);
  assert.equal(a.h1, 'H');
});

test('events: only known names and slug-like properties are kept', async () => {
  const events = [];
  globalThis.window = {
    dispatchEvent: (e) => events.push(e.detail),
    location: { pathname: '/invoice-templates/plumber/', search: '', hostname: 'folioinvoice.com' },
    document: { referrer: '', body: { getAttribute: () => null }, documentElement: { classList: { contains: () => false } } },
    innerWidth: 1440, matchMedia: () => ({ matches: false }), sessionStorage: null,
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
  const { track } = await import('../src/scripts/core/track.js');
  assert.equal(track('made_up_event'), null);
  const e = track('template_selected', { template: 'plumber', slug: 'x', email: 'jane@example.com', cta: 'customize', from_page: 'Jane Smith <jane@example.com>' });
  assert.equal(e.props.template, 'plumber');
  assert.equal(e.props.cta, 'customize');
  assert.ok(!('email' in e.props) && !('slug' in e.props) && !('from_page' in e.props), 'no personal data, nothing unknown');
  assert.equal(events.length, 1);
  assert.equal(window.folioEvents.length, 1);
  delete globalThis.window;
});

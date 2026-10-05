// Unit tests for analytics (events, GA4 provider, usage) and the growth dashboard's
// Google, CSV and metrics modules: node --test tests/unit.growth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createInvoice } from '../src/scripts/core/model.js';

const require = createRequire(import.meta.url);

/** A minimal browser for the event layer: location, referrer, storage, events. */
function fakeWindow({ href = 'https://folioinvoice.com/invoice-templates/plumber/', referrer = '', pageType = 'template', slug = 'plumber', app = false, width = 1440, nav = {} } = {}) {
  const u = new URL(href);
  const listeners = {};
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const head = { children: [], appendChild(el) { this.children.push(el); } };
  return {
    location: { href, pathname: u.pathname, search: u.search, hostname: u.hostname },
    document: {
      referrer, title: 'Free Plumber Invoice Template · Folio', readyState: 'complete', head,
      body: { getAttribute: (k) => ({ 'data-page-type': pageType, 'data-page-slug': slug }[k] ?? null) },
      documentElement: { classList: { contains: (c) => app && c === 'app-html' } },
      createElement: (tag) => ({ tag }),
    },
    navigator: nav,
    innerWidth: width,
    matchMedia: () => ({ matches: false }),
    sessionStorage: mem(),
    localStorage: mem(),
    addEventListener: (t, fn) => (listeners[t] = listeners[t] || []).push(fn),
    dispatchEvent: (e) => (listeners[e.type] || []).forEach((fn) => fn(e)),
    setTimeout: (fn) => fn(),
    listeners,
  };
}
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };

const T = await import('../src/scripts/core/track.js');
const A = await import('../src/scripts/core/analytics.js');

// ---------------------------------------------------------------- events

test('analytics: acquisition source from what the browser provides, nothing inferred', () => {
  const c = (search, referrer) => T.classifyVisit({ search, referrer, host: 'folioinvoice.com' });
  assert.deepEqual(c('', ''), { source: 'direct', medium: 'none' });
  assert.deepEqual(c('', 'https://www.google.com/'), { source: 'google', medium: 'organic', referrer_host: 'google.com' });
  assert.deepEqual(c('', 'https://www.google.co.uk/'), { source: 'google', medium: 'organic', referrer_host: 'google.co.uk' });
  assert.deepEqual(c('', 'https://old.reddit.com/r/freelance/comments/x'), { source: 'reddit', medium: 'social', referrer_host: 'old.reddit.com' });
  assert.deepEqual(c('', 'https://www.tiktok.com/'), { source: 'tiktok', medium: 'social', referrer_host: 'tiktok.com' });
  assert.deepEqual(c('', 'https://m.youtube.com/watch?v=1'), { source: 'youtube', medium: 'social', referrer_host: 'm.youtube.com' });
  assert.deepEqual(c('', 'https://blog.example.com/post'), { source: 'blog.example.com', medium: 'referral', referrer_host: 'blog.example.com' });
  assert.equal(c('', 'https://folioinvoice.com/invoice-guides/'), null, 'a click inside the site keeps the visit');
  assert.deepEqual(c('?utm_source=Newsletter&utm_medium=Email&utm_campaign=Spring Launch!', 'https://mail.example.com/'), { source: 'newsletter', medium: 'email', campaign: 'spring-launch', referrer_host: 'mail.example.com' });
  assert.deepEqual(c('?utm_source=reddit', ''), { source: 'reddit', medium: 'not-set', campaign: undefined, referrer_host: undefined });
  assert.deepEqual(c('?gclid=abc', 'https://www.google.com/'), { source: 'google', medium: 'cpc', referrer_host: 'google.com' });
});

test('analytics: the visit is kept for the tab; a new campaign or outside referrer starts a new one', () => {
  const win = fakeWindow({ href: 'https://folioinvoice.com/invoice-templates/plumber/?utm_source=reddit&utm_medium=social', referrer: 'https://www.reddit.com/' });
  assert.deepEqual(T.visit(win), { source: 'reddit', medium: 'social', campaign: undefined, referrer_host: 'reddit.com', landing_page: '/invoice-templates/plumber/' });
  Object.assign(win.location, { pathname: '/app/', search: '' });
  win.document.referrer = 'https://folioinvoice.com/invoice-templates/plumber/';
  assert.equal(T.visit(win).landing_page, '/invoice-templates/plumber/', 'internal click: same visit');
  win.document.referrer = '';
  assert.equal(T.visit(win).source, 'reddit', 'a typed address mid-visit keeps it');
  win.document.referrer = 'https://duckduckgo.com/';
  Object.assign(win.location, { pathname: '/invoice-guides/invoice-vs-bill/' });
  const v = T.visit(win);
  assert.deepEqual([v.source, v.landing_page], ['duckduckgo', '/invoice-guides/invoice-vs-bill/'], 'a search click starts a new visit');
});

test('analytics: events carry context and only allow-listed, slug-like values', () => {
  const win = fakeWindow({ referrer: 'https://www.bing.com/', width: 390 });
  globalThis.window = win;
  try {
    assert.equal(T.track('made_up_event'), null, 'unknown events are dropped');
    const e = T.track('template_selected', {
      template: 'plumber', cta: 'customize',
      customer_name: 'John Smith', email: 'jane@example.com', invoice_total: '14832.22', description: 'Water heater',
      from_page: 'Jane Smith <jane@example.com>',
    });
    assert.deepEqual(e.props, {
      page_path: '/invoice-templates/plumber/', page_type: 'template', content_slug: 'plumber',
      template: 'plumber', cta: 'customize', source: 'bing', medium: 'organic', landing_page: '/invoice-templates/plumber/',
      referrer_host: 'bing.com', device_type: 'mobile',
    });
    assert.ok(!JSON.stringify(win.folioEvents).match(/John|jane@|14832|Water/), 'nothing personal anywhere in the log');
    for (const name of ['seo_page_view', 'template_view', 'template_selected', 'invoice_generator_opened', 'invoice_created', 'pdf_downloaded', 'print_clicked']) {
      assert.ok(T.EVENTS.includes(name), `${name} is a known event`);
    }
  } finally { delete globalThis.window; }
});

test('analytics: GA4 is off without a valid ID or with a privacy signal, and sends only clean data', () => {
  assert.deepEqual(A.startAnalytics(undefined, fakeWindow()), { enabled: false, reason: 'not-configured' });
  assert.deepEqual(A.startAnalytics({ ga4: '' }, fakeWindow()), { enabled: false, reason: 'not-configured' });
  assert.deepEqual(A.startAnalytics({ ga4: 'UA-12345-1' }, fakeWindow()), { enabled: false, reason: 'invalid-id' });
  const gpc = fakeWindow({ nav: { globalPrivacyControl: true } });
  assert.deepEqual(A.startAnalytics({ ga4: 'G-TEST1234' }, gpc), { enabled: false, reason: 'privacy-signal' });
  assert.equal(gpc.dataLayer, undefined);
  assert.equal(gpc.document.head.children.length, 0, 'no script loaded');
  assert.equal(A.startAnalytics({ ga4: 'G-TEST1234' }, fakeWindow({ nav: { doNotTrack: '1' } })).reason, 'privacy-signal');
  assert.equal(A.startAnalytics({ ga4: 'G-TEST1234', respectPrivacySignals: false }, fakeWindow({ nav: { doNotTrack: '1' } })).enabled, true);

  const win = fakeWindow({ href: 'https://folioinvoice.com/app/?item=Secret%20project&price=14832.22&utm_source=reddit', referrer: 'https://www.google.com/search?q=private' });
  win.folioEvents = [{ name: 'invoice_generator_opened', props: { via: 'tool', page_path: '/app/', source: 'reddit', medium: 'social' } }];
  assert.deepEqual(A.startAnalytics({ ga4: 'G-TEST1234' }, win), { enabled: true, reason: 'ga4' });
  const calls = win.dataLayer.map((a) => [...a]);
  assert.deepEqual(calls.find((c) => c[0] === 'set')[1], { page_location: 'https://folioinvoice.com/app/?utm_source=reddit', page_referrer: 'https://www.google.com/' });
  const cfg = calls.find((c) => c[0] === 'config');
  assert.equal(cfg[1], 'G-TEST1234');
  assert.equal(cfg[2].send_page_view, false);
  assert.equal(cfg[2].allow_google_signals, false);
  assert.deepEqual(calls.find((c) => c[1] === 'invoice_generator_opened'), ['event', 'invoice_generator_opened', { via: 'tool', visit_source: 'reddit', visit_medium: 'social' }], 'events recorded before start are replayed');
  win.dispatchEvent(new CustomEvent('folio:track', { detail: { name: 'pdf_downloaded', props: { template: 'plumber' } } }));
  assert.deepEqual([...win.dataLayer.at(-1)], ['event', 'pdf_downloaded', { template: 'plumber' }]);
  assert.ok(!JSON.stringify(calls).match(/Secret|14832|q=private/), 'no query strings or referrer paths');
  assert.equal(win.document.head.children[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST1234');
  assert.equal(A.cleanUrl('https://x.com/a/?utm_campaign=c&email=a@b.c#top'), 'https://x.com/a/?utm_campaign=c');
});

test('analytics: no consent is asked for, so the EEA, UK and Switzerland are not measured', () => {
  const tz = (zone) => ({ DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: zone }) }) });
  for (const zone of ['Europe/Berlin', 'Europe/London', 'Europe/Zurich', 'Atlantic/Canary', 'Asia/Nicosia']) {
    const win = Object.assign(fakeWindow(), { Intl: tz(zone) });
    assert.deepEqual(A.startAnalytics({ ga4: 'G-TEST1234' }, win), { enabled: false, reason: 'consent-region' }, zone);
    assert.equal(win.dataLayer, undefined, `${zone}: nothing queued`);
    assert.equal(win.document.head.children.length, 0, `${zone}: nothing loaded`);
  }
  const win = Object.assign(fakeWindow(), { Intl: tz('America/Chicago') });
  assert.equal(A.startAnalytics({ ga4: 'G-TEST1234' }, win).enabled, true);
  const consent = win.dataLayer.map((a) => [...a]).filter((c) => c[0] === 'consent');
  assert.equal(consent.length, 2, 'consent defaults are set before anything is sent');
  assert.ok(win.dataLayer.map((a) => [...a]).findIndex((c) => c[0] === 'consent') < win.dataLayer.map((a) => [...a]).findIndex((c) => c[0] === 'config'));
  const regional = consent.find((c) => c[2].region)[2];
  assert.equal(regional.analytics_storage, 'denied');
  for (const code of ['DE', 'FR', 'IE', 'GB', 'CH', 'NO']) assert.ok(regional.region.includes(code), code);
  const elsewhere = consent.find((c) => !c[2].region)[2];
  assert.deepEqual(elsewhere, { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' }, 'no advertising storage anywhere');
});

test('analytics: an invoice counts as created once, on its first edit or export', async () => {
  const win = fakeWindow({ app: true, href: 'https://folioinvoice.com/app/' });
  globalThis.window = win;
  try {
    const { Usage, USAGE_KEY } = await import('../src/scripts/app/usage.js');
    const old = createInvoice();
    old.client.name = 'Existing client';
    const library = { invoices: [old] };
    const usage = new Usage(library, win.localStorage);
    assert.ok(!usage.edited(old), 'invoices from before measurement are not counted');
    const inv = createInvoice({ template: 'contractor' });
    usage.started(inv, { template: 'plumber', via: 'template', start: 'example' });
    assert.ok(!usage.edited(inv), 'a blank invoice is not created yet');
    inv.client.name = 'Robert Liu';
    inv.items[0].description = 'Water heater';
    assert.ok(usage.edited(inv));
    assert.ok(!usage.edited(inv), 'once per invoice');
    usage.exported(inv, 'pdf_downloaded');
    assert.deepEqual(win.folioEvents.map((e) => e.name), ['invoice_started', 'invoice_created', 'pdf_downloaded']);
    const created = win.folioEvents[1].props;
    assert.deepEqual([created.template, created.layout, created.via, created.start, created.page_type], ['plumber', 'contractor', 'template', 'example', 'app']);
    assert.ok(!JSON.stringify(win.folioEvents).match(/Robert|Water heater/), 'invoice contents never in events');
    assert.ok(!win.localStorage.getItem(USAGE_KEY).match(/Robert|Water/), 'nor in what is remembered');
    inv.meta.template = 'classic';
    assert.equal(usage.templateOf(inv), 'classic', 'a new layout moves the attribution to its page');
    const blank = createInvoice();
    usage.exported(blank, 'print_clicked');
    assert.deepEqual(win.folioEvents.slice(-1).map((e) => e.name), ['print_clicked'], 'printing a blank invoice is not creating one');
    assert.ok(!new Usage(library, win.localStorage).edited(inv), 'remembered across reloads');
  } finally { delete globalThis.window; }
});

// ---------------------------------------------------------------- growth dashboard: Google, CSV, metrics

const G = await import('../src/scripts/growth/google.js');
const C = await import('../src/scripts/growth/csv.js');
const M = await import('../src/scripts/growth/metrics.js');
const { report: fakeReport } = require('./fixtures/google.cjs');

const INDEX = [
  { path: '/', type: 'page', slug: '', name: 'Home' }, { path: '/app/', type: 'app', slug: '', name: 'Generator' },
  ...['contractor', 'plumber', 'freelancer', 'photographer', 'cleaning-service'].map((s) => ({ path: `/invoice-templates/${s}/`, type: 'template', slug: s, name: s[0].toUpperCase() + s.slice(1) })),
  { path: '/invoice-guides/how-to-create-an-invoice-pdf/', type: 'guide', slug: 'how-to-create-an-invoice-pdf', name: 'How to create an invoice PDF' },
  { path: '/invoice-guides/how-to-make-an-invoice/', type: 'guide', slug: 'how-to-make-an-invoice', name: 'How to make an invoice' },
  { path: '/tools/invoice-number-generator/', type: 'tool', slug: 'invoice-number-generator', name: 'Invoice number generator' },
];
const RANGE = M.dateRange('28', new Date(2026, 9, 2));
const gaData = () => G.normalizeGa4(G.ga4Requests(RANGE).map((requests) => ({ reports: requests.map(fakeReport) })), { missing: ['via'] });

test('growth: date ranges end yesterday and compare with the period before', () => {
  assert.deepEqual(M.dateRange('28', new Date(2026, 9, 2)), { start: '2026-09-04', end: '2026-10-01', days: 28, previous: { start: '2026-08-07', end: '2026-09-03' } });
  assert.equal(M.dateRange('7', new Date(2026, 9, 2)).start, '2026-09-25');
  assert.equal(M.dateRange('90', new Date(2026, 9, 2)).days, 90);
  assert.deepEqual(M.dateRange('custom', new Date(), { start: '2026-09-10', end: '2026-09-01' }), { start: '2026-09-01', end: '2026-09-10', days: 10, previous: { start: '2026-08-22', end: '2026-08-31' } });
  assert.equal(M.dateRange('custom', new Date(2026, 9, 2), { start: 'bad', end: '' }).days, 28, 'a bad custom range falls back to 28 days');
});

test('growth: GA4 requests and responses', () => {
  const [a, b] = G.ga4Requests(RANGE);
  assert.ok(a.length <= 5 && b.length <= 5, 'batchRunReports takes at most five');
  assert.deepEqual(a[0].dateRanges.map((r) => r.name), ['current', 'previous']);
  assert.ok(b.some((r) => (r.dimensions || []).some((d) => d.name === 'customEvent:template')));
  assert.ok(!G.ga4Requests(RANGE, { withTemplates: false })[1].some((r) => (r.dimensions || []).some((d) => d.name === 'customEvent:template')));
  const ga = gaData();
  assert.deepEqual(ga.totals, { current: { users: 1284, sessions: 1610 }, previous: { users: 1088, sessions: 1350 } });
  assert.deepEqual(ga.events.current.invoice_created, { users: 190, count: 240 });
  assert.deepEqual(ga.events.previous.invoice_created, { users: 150, count: 189 });
  assert.equal(ga.landing.find((l) => l.path === '/invoice-templates/photographer/').events.invoice_created.users, 26);
  assert.equal(ga.templates.find((t) => t.template === 'contractor').events.template_view.count, 421);
  assert.deepEqual(G.missingDimensions({ dimensions: [{ apiName: 'customEvent:template' }, { apiName: 'customEvent:cta' }] }), ['page_type', 'via']);
  const gsc = G.normalizeGsc([{ rows: [{ keys: ['https://x.com/a/'], clicks: 5, impressions: 100, ctr: 0.05, position: 3.2 }] }, {}], RANGE);
  assert.deepEqual(gsc.pages, [{ path: 'https://x.com/a/', clicks: 5, impressions: 100, ctr: 0.05, position: 3.2 }]);
  assert.deepEqual(gsc.queries, []);
});

test('growth: overview compares with the previous period only when it has data', () => {
  const t = Object.fromEntries(M.overview(gaData()).tiles.map((x) => [x.key, x]));
  assert.equal(t.visitors.value, 1284);
  assert.equal(Math.round(t.visitors.change * 100), 18);
  assert.equal(t.invoices_created.value, 240);
  assert.equal(Math.round(t.invoices_created.change * 100), 27);
  assert.equal(t.pdf_downloads.value, 198);
  const fresh = gaData();
  fresh.totals.previous = { users: 0, sessions: 0 };
  fresh.events.previous = {};
  const ov = M.overview(fresh);
  assert.equal(ov.history, false);
  assert.ok(ov.tiles.every((x) => x.change === null && x.previous === null), 'no comparison is made up');
  assert.equal(M.overview(null), null);
  assert.equal(M.hasData({ totals: { current: { users: 0, sessions: 0 } } }), false);
});

test('growth: funnel numbers, conversion, drop-off and the biggest drop-off', () => {
  const f = M.funnel(gaData());
  assert.deepEqual(f.steps.map((s) => s.value), [1284, 820, 380, 190, 150]);
  assert.equal(f.steps[1].ofVisitors.toFixed(4), (820 / 1284).toFixed(4));
  assert.equal(f.steps[2].fromPrevious.toFixed(4), (380 / 820).toFixed(4));
  assert.equal(f.steps[2].dropOff.toFixed(4), (1 - 380 / 820).toFixed(4));
  assert.equal(f.steps[4].dropOff.toFixed(4), (1 - 150 / 190).toFixed(4));
  assert.equal(f.biggest, 2, 'SEO page → generator loses the most');
  const g = gaData();
  g.events.current.seo_page_view.users = 100;
  const f2 = M.funnel(g);
  assert.equal(f2.steps[2].notNested, true, 'more generator users than SEO visitors: not a drop');
  assert.equal(f2.steps[2].dropOff, null);
  assert.equal(f2.biggest, 1);
  const small = gaData();
  small.totals.current.users = 20;
  assert.equal(M.funnel(small).biggest, null, 'too few visitors: no verdict');
});

test('growth: landing pages, content types, templates and sources', () => {
  const ga = gaData();
  const landing = M.landingPages(ga, INDEX);
  assert.equal(landing[0].path, '/');
  const photo = landing.find((r) => r.path === '/invoice-templates/photographer/');
  assert.deepEqual([photo.type, photo.visitors, photo.opens, photo.created], ['template', 60, 40, 26]);
  assert.equal(photo.conversion.toFixed(3), (26 / 60).toFixed(3));
  assert.equal(M.sortRows(landing, 'conversion', 'desc')[0].path, '/app/');
  assert.equal(M.sortRows(landing, 'visitors', 'asc')[0].path, '/tools/invoice-number-generator/');
  const types = Object.fromEntries(M.contentByType(landing).map((g) => [g.type, g]));
  assert.deepEqual([types.template.visitors, types.guide.visitors, types.tool.visitors], [474, 330, 50]);
  const tpl = M.templatePerformance(ga, INDEX);
  assert.ok(!tpl.some((t) => t.template === '(not set)'));
  const c = tpl.find((t) => t.template === 'contractor');
  assert.deepEqual([c.views, c.customizations, c.opens, c.created, c.pdfs], [421, 173, 120, 96, 82]);
  assert.equal(c.viewToOpen.toFixed(3), (120 / 421).toFixed(3));
  assert.equal(M.templatePerformance({ ...ga, templates: null }, INDEX), null, 'unregistered dimension: no table, not zeros');
  const src = M.trafficSources(ga);
  assert.deepEqual(src.buckets.map((b) => [b.name, b.users]), [['Organic Search', 760], ['Direct', 300], ['Referral', 90], ['Social', 110], ['Other', 24]]);
  assert.equal(M.normalizePath('https://folioinvoice.com/tools/x?utm_source=a'), '/tools/x/');
  assert.equal(M.normalizePath('/assets/og.jpg'), '/assets/og.jpg');
});

test('growth: opportunities and recommendations only from enough data', () => {
  const ga = gaData();
  const landing = M.landingPages(ga, INDEX);
  const gsc = {
    pages: [['/invoice-templates/contractor/', 240, 12000, 6.2], ['/invoice-guides/how-to-create-an-invoice-pdf/', 200, 9000, 5], ['/invoice-guides/how-to-make-an-invoice/', 140, 6000, 4.2], ['/invoice-templates/plumber/', 30, 5000, 7.5], ['/invoice-templates/freelancer/', 90, 4000, 9], ['/', 260, 3000, 2.1], ['/invoice-templates/photographer/', 50, 800, 8]]
      .map(([path, clicks, impressions, position]) => ({ path, clicks, impressions, ctr: clicks / impressions, position })),
  };
  const o = M.opportunities(M.searchPages(gsc, landing, INDEX), landing);
  assert.deepEqual(o.lowCtr.map((p) => p.path), ['/invoice-templates/plumber/']);
  assert.match(o.lowCtr[0].evidence, /5,000 impressions, 0\.6% click-through/);
  assert.ok(o.underexposed.some((p) => p.path === '/invoice-templates/photographer/'));
  const recs = M.recommendations({ funnel: M.funnel(ga), templates: M.templatePerformance(ga, INDEX), landing, opportunities: o, sources: M.trafficSources(ga) });
  assert.equal(recs[0].kind, 'funnel');
  assert.match(recs[0].title, /SEO page views → Generator opens/);
  assert.ok(recs.some((r) => r.kind === 'guide' && r.path === '/invoice-guides/how-to-create-an-invoice-pdf/'));
  assert.ok(recs.some((r) => r.kind === 'template' && r.title === 'Plumber template'));
  assert.ok(recs.every((r) => r.observation && r.action));
  const tiny = M.opportunities(null, landing.map((r) => ({ ...r, visitors: 5 })));
  assert.deepEqual([tiny.lowCtr, tiny.underexposed, tiny.winners].map((x) => x.length), [0, 0, 0]);
  assert.match(tiny.notes[0], /at least 3 pages with 20\+ visitors/);
  assert.deepEqual(M.recommendations({ funnel: null, templates: null, landing: null, opportunities: null, sources: null }), []);
});

test('growth: Search Console CSV import and CSV export', () => {
  const pages = C.parseSearchConsoleCsv('﻿"Top pages",Clicks,Impressions,CTR,Position\r\nhttps://folioinvoice.com/invoice-templates/plumber/,30,"5,000",0.6%,7.5\r\n"https://folioinvoice.com/a,b/",1,10,10%,2\r\n');
  assert.equal(pages.kind, 'pages');
  assert.deepEqual(pages.rows[0], { path: 'https://folioinvoice.com/invoice-templates/plumber/', clicks: 30, impressions: 5000, ctr: 0.006, position: 7.5 });
  assert.equal(pages.rows[1].path, 'https://folioinvoice.com/a,b/');
  const queries = C.parseSearchConsoleCsv('Top queries,Clicks,Impressions,CTR,Position\ninvoice pdf,90,4100,2.2%,6.4\n');
  assert.equal(queries.kind, 'queries');
  assert.throws(() => C.parseSearchConsoleCsv('Date,Clicks\n2026-01-01,3'), /Search Console Pages or Queries export/);
  const gsc = C.searchConsoleFromFiles([pages, queries], '2026-10-02T00:00:00Z');
  assert.deepEqual([gsc.origin, gsc.pages.length, gsc.queries.length], ['csv', 2, 1]);
  const csv = C.toCsv([{ q: '=HYPERLINK("x")', n: 0.12345, s: 'a, "b"' }], [{ key: 'q', label: 'Query' }, { key: 'n', label: 'Rate' }, { key: 's', label: 'Text' }]);
  assert.equal(csv, 'Query,Rate,Text\r\n"\'=HYPERLINK(""x"")",0.1235,"a, ""b"""\r\n', 'formulas neutralised, quotes escaped');
});

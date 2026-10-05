#!/usr/bin/env node
/**
 * Folio — static build. No dependencies.
 *
 *   node build.mjs                → dist/  (includes the unlisted SEO dashboard at /_seo/)
 *   node build.mjs --production   → dist/  without the dashboard
 *   node build.mjs --out=<dir>     → another output directory (tests)
 *
 * Two sources of pages:
 *
 * 1. src/pages/**: hand-written pages. Each starts with front matter:
 *      ---
 *      title: Pricing                  (or `titleFull` to set the whole <title>)
 *      description: …
 *      layout: site | app              (default: site)
 *      nav: pricing                    (marks the current item in the navigation)
 *      schema: faq | app | home        (structured data for the page)
 *      hub: templates | guides | tools (a hub: breadcrumbs + a list of its pages)
 *      ---
 * 2. src/content/**: the content database (see build/content.mjs). One file per
 *    template, guide or tool; the page, its hub card, breadcrumbs, structured
 *    data, related links and sitemap entry are generated from it.
 *
 * Template syntax: {{> partial}} includes src/partials/partial.html, {{key}} inserts a variable.
 *
 * The app's JavaScript is shipped as native ES modules (src/scripts/core + app).
 * The same core modules render every invoice preview on the marketing pages here.
 */
import { readFile, writeFile, mkdir, readdir, rm, cp, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { markdown, inline } from './build/markdown.mjs';
import { loadContent, frontMatter, KINDS } from './build/content.mjs';
import * as seo from './build/seo.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT_ARG = process.argv.find((a) => a.startsWith('--out='));
const DIST = OUT_ARG ? path.resolve(OUT_ARG.slice(6)) : path.join(ROOT, 'dist');
const PRODUCTION = process.argv.includes('--production');
const core = (f) => import(pathToFileURL(path.join(SRC, 'scripts', 'core', f)).href);

const { renderInvoice } = await core('render.js');
const { computeTotals } = await core('calc.js');
const { sampleInvoice } = await core('sample.js');
const { formatMoney } = await core('format.js');
const { TEMPLATES, CATEGORIES, categoryLabel, COMPOSITIONS, hasTemplate, templateById } = await core('templates.js');
const { fontFaceCss } = await core('fonts.js');

const site = JSON.parse(await readFile(path.join(SRC, 'site.json'), 'utf8'));
// Every canonical, sitemap entry, Open Graph URL and robots line is built from site.url.
if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/.test(site.url)) {
  throw new Error(`src/site.json "url" must be the production origin: https://, no path, no trailing slash (e.g. https://example.com). Got "${site.url}".`);
}

// ---------------------------------------------------------------- analytics configuration
// site.json → analytics, overridden by environment variables at build time. Every value
// is optional: with none, no analytics script is added and the dashboard explains setup.
const env = (k, fallback) => String(process.env[k] ?? fallback ?? '').trim();
const analyticsSettings = {
  ga4: env('PUBLIC_GA_MEASUREMENT_ID', site.analytics?.ga4MeasurementId),
  respectPrivacySignals: site.analytics?.respectPrivacySignals !== false,
  ga4PropertyId: env('GA4_PROPERTY_ID', site.analytics?.ga4PropertyId),
  oauthClientId: env('GOOGLE_OAUTH_CLIENT_ID', site.analytics?.googleOAuthClientId),
  searchConsoleSite: env('SEARCH_CONSOLE_SITE', site.analytics?.searchConsoleSite),
};
if (analyticsSettings.ga4 && !/^G-[A-Z0-9]{4,20}$/.test(analyticsSettings.ga4)) {
  console.warn(`Analytics off: "${analyticsSettings.ga4}" is not a GA4 measurement ID (G-XXXXXXXXXX).`);
  analyticsSettings.ga4 = '';
}
if (analyticsSettings.ga4PropertyId && !/^\d{5,15}$/.test(analyticsSettings.ga4PropertyId)) {
  console.warn(`Dashboard: "${analyticsSettings.ga4PropertyId}" is not a numeric GA4 property ID; ignored.`);
  analyticsSettings.ga4PropertyId = '';
}
const analytics = {
  enabled: Boolean(analyticsSettings.ga4),
  config: analyticsSettings.ga4
    ? `\n  <script>window.folioAnalytics=${JSON.stringify({ ga4: analyticsSettings.ga4, respectPrivacySignals: analyticsSettings.respectPrivacySignals })};</script>`
    : '',
  // The privacy notice states what is actually running.
  privacy: analyticsSettings.ga4
    ? 'The site uses Google Analytics to count visits and to see how the invoice generator is used: which page a visit starts on, where it came from (for example a search engine or another website), which templates and tools are opened, and whether an invoice is created, downloaded or printed. Analytics never receives anything you type into an invoice, and page addresses are sent without their query strings. Google Analytics sets its own cookies; it does not run if your browser sends a Global Privacy Control or Do Not Track signal. Visitors in the European Economic Area, the UK and Switzerland are not measured: analytics does not run in browsers set to a European time zone, and for any other visit Google locates in those countries, no analytics cookies are set. The site sets no advertising cookies. Our hosting provider keeps standard server logs (IP address, page requested, time) for security, for up to 30 days.'
    : 'The site sets no advertising or tracking cookies and uses no third-party analytics. Our hosting provider keeps standard server logs (IP address, page requested, time) for security, for up to 30 days.',
};
const content = await loadContent(path.join(SRC, 'content'), { TEMPLATES, CATEGORIES, hasTemplate });
const redirects = JSON.parse(await readFile(path.join(SRC, 'content', 'redirects.json'), 'utf8'));
const faqItems = JSON.parse(await readFile(path.join(SRC, 'content', 'faq.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);
const NUMBER_WORDS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five'.split(' ');
const words = (n) => NUMBER_WORDS[n] || String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];

// ---------------------------------------------------------------- FAQ
/** FAQ items are { q, a: [html paragraphs] }. */
const faqHtml = (items) => items.map((f) =>
  `<details><summary>${esc(f.q)}</summary><div class="faq__answer">${f.a.map((p) => `<p>${p}</p>`).join('')}</div></details>`).join('\n');
const siteFaq = faqItems.map((f) => ({ ...f, a: f.a.map(esc) }));
const faqGroups = [...new Set(siteFaq.map((f) => f.group))];
// Counts written out in faq.json ("sixteen layouts") must stay true as templates are added.
for (const [count, noun] of [[TEMPLATES.length, 'layouts'], [content.templates.length, 'trades and styles']]) {
  for (const f of faqItems) for (const p of f.a) {
    const m = new RegExp(`\\b([a-z-]+) ${noun}`).exec(p);
    if (m && NUMBER_WORDS.includes(m[1]) && m[1] !== NUMBER_WORDS[count]) throw new Error(`faq.json says "${m[0]}", but there are ${count}`);
  }
}
const faq = {
  home: faqHtml(siteFaq.filter((f) => f.home)),
  generator: faqHtml(siteFaq.filter((f) => f.generator)),
  groups: faqGroups.map((g, i) => `<section class="faq-group" aria-labelledby="faq-g${i}">
        <h2 class="label faq-group__title" id="faq-g${i}">${esc(g)}</h2>
        <div class="faq">${faqHtml(siteFaq.filter((f) => f.group === g))}</div>
      </section>`).join('\n'),
};

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}
const exists = (f) => access(f).then(() => true, () => false);

const partials = new Map();
for (const file of await walk(path.join(SRC, 'partials'))) partials.set(path.basename(file, '.html'), await readFile(file, 'utf8'));

function render(template, vars, depth = 0) {
  if (depth > 12) throw new Error('Partial recursion too deep');
  return template
    .replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
      if (!partials.has(name)) throw new Error(`Unknown partial: ${name}`);
      return render(partials.get(name), vars, depth + 1);
    })
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const value = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);
      if (value === undefined) throw new Error(`Unknown variable: ${key}`);
      return String(value);
    });
}

async function bundleCss() {
  const seen = new Set();
  async function inline(file) {
    if (seen.has(file)) return '';
    seen.add(file);
    let out = '';
    for (const line of (await readFile(file, 'utf8')).split('\n')) {
      const m = /^@import\s+["'](.+?)["'];/.exec(line.trim());
      out += m ? await inline(path.join(path.dirname(file), m[1])) : line + '\n';
    }
    return out;
  }
  const css = await inline(path.join(SRC, 'styles', 'main.css'));
  // The generator's invoice fonts (core/fonts.js): declared here, downloaded only when an invoice uses one.
  return (css + fontFaceCss('invoice-fonts/')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n+/g, '\n').trim() + '\n';
}

async function bundleSiteJs() {
  // The event layer is one ES module shared with the app; here it becomes a plain script.
  // Shared ES modules become plain scripts: exports and the long doc comments are dropped.
  const core = async (f) => (await readFile(path.join(SRC, 'scripts', 'core', f), 'utf8')).replace(/^export /gm, '').replace(/^\s*\/\*\*[\s\S]*?\*\/\n/gm, '');
  let js = `/* Folio — site.js (marketing pages) */\n\n/* core/track.js */\n(function () {\n${await core('track.js')}})();\n`;
  js += `\n/* core/analytics.js */\n(function () {\n${await core('analytics.js')}\nstartAnalytics(window.folioAnalytics);\n})();\n`;
  for (const name of ['header.js', 'menu.js', 'reveal.js', 'docfit.js', 'form.js', 'templates.js', 'funnel.js']) {
    js += `\n/* ${name} */\n` + (await readFile(path.join(SRC, 'scripts', 'site', name), 'utf8'));
  }
  return js;
}

// ---------------------------------------------------------------- samples
const sample = sampleInvoice();
const sampleTotals = computeTotals(sample);
const sampleSans = sampleInvoice({ typeface: 'sans' });
const samples = {
  invoice: renderInvoice(sample, sampleTotals),
  invoiceSans: renderInvoice(sampleSans, computeTotals(sampleSans)),
  total: formatMoney(sampleTotals.total, 'USD'),
  subtotal: formatMoney(sampleTotals.subtotal, 'USD'),
  discount: formatMoney(sampleTotals.discount, 'USD'),
  tax: formatMoney(sampleTotals.tax, 'USD'),
};

// ---------------------------------------------------------------- build
await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, 'assets', 'js'), { recursive: true });
await cp(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true });
await cp(path.join(SRC, 'vendor'), path.join(DIST, 'assets', 'vendor'), { recursive: true });
for (const dir of PRODUCTION ? ['core', 'app', 'tools'] : ['core', 'app', 'tools', 'growth']) await cp(path.join(SRC, 'scripts', dir), path.join(DIST, 'assets', 'js', dir), { recursive: true });

const css = await bundleCss();
const js = await bundleSiteJs();
await writeFile(path.join(DIST, 'assets', 'site.css'), css);
await writeFile(path.join(DIST, 'assets', 'site.js'), js);
// Payment links: on a static-only deploy the generator asks this file and finds no providers.
// Deployed with the Netlify Functions, the function at the same path answers instead (functions win).
await mkdir(path.join(DIST, 'api', 'payments'), { recursive: true });
await writeFile(path.join(DIST, 'api', 'payments', 'config'), JSON.stringify({ providers: { stripe: false, paypal: false }, test: { stripe: false, paypal: false }, unsupported: { stripe: [], paypal: [] }, static: true }) + '\n');
const appJsHash = hash(
  (await Promise.all((await walk(path.join(SRC, 'scripts'))).map((f) => readFile(f, 'utf8')))).join('')
);

const layouts = {
  site: await readFile(path.join(SRC, 'layouts', 'site.html'), 'utf8'),
  app: await readFile(path.join(SRC, 'layouts', 'app.html'), 'utf8'),
};
const bodies = {};
for (const name of ['template-detail', 'guide', 'tool']) bodies[name] = await readFile(path.join(SRC, 'layouts', `${name}.html`), 'utf8');

/** Every page written, for the sitemap and the dashboard. */
const pages = [];

const CTA = {
  label: 'Free · No account · No watermark',
  title: 'Your next invoice, in three minutes.',
  text: 'Open the generator, fill in the details, download the PDF. Your business details are remembered for next time.',
  button: 'Create an invoice',
  href: 'app/',
  track: '',
  slug: '',
};

/**
 * Render one page with its layout and record it.
 *   data   front matter, plus: pageType, pageSlug, crumbs [{ name, short?, path }],
 *          ld [schema objects], lastmod, scripts (extra <script> tags), cta overrides
 */
async function emitPage(rel, data, body, extra = {}) {
  const depth = rel.split('/').length - 1;
  const root = data.root || (depth ? '../'.repeat(depth) : './');
  const urlPath = rel === 'index.html' ? '' : rel.replace(/index\.html$/, '');
  const canonical = `${site.url}/${urlPath}`;
  const title = data.titleFull || `${data.title} — ${site.name}`;
  const crumbs = data.crumbs ? data.crumbs.map((c) => ({ ...c, url: `${site.url}${c.path}` })) : null;

  const vars = {
    site, samples, faq, root, canonical, analytics,
    templates: templateLib(root),
    library: hubLists(root),
    page: data,
    year: new Date().getFullYear(),
    title: attr(title),
    description: attr(data.description || site.description),
    ogTitle: attr(data.ogTitle || title),
    ogType: data.ogType || 'website',
    bodyClass: data.bodyClass || '',
    pageType: data.pageType || 'page',
    pageSlug: data.pageSlug || '',
    crumbs: crumbs ? seo.crumbsHtml(crumbs, root) : '',
    cta: { ...CTA, ...(data.cta || {}), href: attr(root + (data.cta?.href || CTA.href)) },
    cssVersion: hash(css),
    jsVersion: hash(js),
    appVersion: appJsHash,
    robots: data.noindex === 'true' ? 'noindex' : 'index, follow',
    scripts: data.scripts ? data.scripts.replace(/\{\{root\}\}/g, root).replace(/\{\{appVersion\}\}/g, appJsHash) : '',
    schema: '',
    ...extra,
  };
  const ld = [...(data.ld || [])];
  if (crumbs) ld.unshift(seo.breadcrumbList(crumbs));
  let schema = '';
  if (data.schema === 'faq') ld.push(seo.faqPage(siteFaq));
  else if (data.schema) schema = render(partials.get(`schema-${data.schema}`), vars);
  vars.schema = [schema, seo.ldScripts(ld)].filter(Boolean).join('\n  ');

  const layout = layouts[data.layout || 'site'];
  let html = render(layout.replace('{{content}}', body), vars);
  if (data.nav) html = html.replace(new RegExp(`data-nav="${data.nav}"`, 'g'), `data-nav="${data.nav}" aria-current="page"`);

  const out = path.join(DIST, rel);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html);
  pages.push({ rel, url: '/' + urlPath, type: vars.pageType, status: 'published', indexable: data.noindex !== 'true', lastmod: data.lastmod || '', html });
}

// ---------------------------------------------------------------- template cards & previews
const docs = new Map();
/** The page's example, rendered by the generator's own renderer. */
function entryDoc(e) {
  if (!docs.has(e.slug)) {
    const inv = sampleInvoice({ template: e.layout, sample: e.sample || undefined });
    docs.set(e.slug, renderInvoice(inv, computeTotals(inv)));
  }
  return docs.get(e.slug);
}
const arrow = () => partials.get('arrow').trim();
const md = (text, root) => inline(text, { root });

function tplCard(e, root, { compact = false } = {}) {
  const h = compact ? 3 : 2;
  return `<li class="tcard" data-category="${e.category}" data-reveal>
          <a class="tcard__plate" href="${root}${e.url.slice(1)}" tabindex="-1" aria-hidden="true">
            <div class="doc-fit" data-doc-fit><div class="doc-fit__inner">${entryDoc(e)}</div></div>
          </a>
          <p class="tcard__cat label">${esc(categoryLabel(e.category))}</p>
          <h${h} class="tcard__name"><a href="${root}${e.url.slice(1)}">${esc(e.name)}</a></h${h}>
          <p class="tcard__desc">${esc(e.summary)}</p>
          <div class="tcard__actions">
            <a class="btn btn--sm btn--outline" href="${root}app/?template=${e.slug}" data-track="template_selected" data-track-slug="${e.slug}" data-track-cta="card">Use template<span class="visually-hidden">: ${esc(e.name)}</span></a>
            <a class="go" href="${root}${e.url.slice(1)}">Details<span class="visually-hidden"> of the ${esc(e.name)} template</span> ${arrow()}</a>
          </div>
        </li>`;
}
function templateLib(root) {
  const n = content.templates.length;
  return {
    count: String(n),
    countWord: words(n),
    CountWord: cap(words(n)),
    layouts: words(TEMPLATES.length),
    filters: [{ id: 'all', label: 'All' }, ...CATEGORIES.filter((c) => content.templates.some((e) => e.category === c.id))]
      .map((c) => `<button type="button" class="tpl-filter__btn" data-filter="${c.id}" aria-pressed="${c.id === 'all'}">${esc(c.label)}</button>`).join(''),
    grid: content.templates.map((e) => tplCard(e, root)).join('\n'),
  };
}

// ---------------------------------------------------------------- reusable link components

/** Index rows (the site's numbered hairline list) for guides and tools. */
function indexRows(entries, root, { kindLabel = false } = {}) {
  return `<ol class="index index--links" data-reveal-group>${entries.map((e, i) => `
          <li data-reveal><a class="index__row" href="${root}${e.url.slice(1)}"><span class="index__num">${kindLabel ? { guide: 'Guide', tool: 'Tool', template: 'Template' }[e.kind] : ROMAN[i] + '.'}</span><span class="index__title">${esc(e.name)}</span><span class="index__desc">${esc(e.summary)}</span><span class="index__go">${arrow()}</span></a></li>`).join('')}
        </ol>`;
}
function relatedTemplatesSection(entries, root, { label = 'Related templates', heading = 'Other templates to try.' } = {}) {
  if (!entries.length) return '';
  return `<section class="section" aria-labelledby="rt-title">
      <div class="wrap">
        <div class="grid opening">
          <h2 class="label opening__label" id="rt-title" data-reveal>${esc(label)}</h2>
          <div class="opening__body work-intro">
            <p class="h2" data-reveal>${esc(heading)}</p>
            <a class="go work-intro__all" href="${root}invoice-templates/" data-reveal>All templates ${arrow()}</a>
          </div>
        </div>
        <ul class="tlib tlib--related mt-8" data-reveal-group>
        ${entries.map((r) => tplCard(r, root, { compact: true })).join('\n')}
        </ul>
      </div>
    </section>`;
}
function readNextSection(entries, root, { label = 'Guides & tools', heading = 'Before you send it.', ivory = false } = {}) {
  if (!entries.length) return '';
  return `<section class="section${ivory ? ' section--ivory' : ''}" aria-labelledby="rn-title">
      <div class="wrap">
        <div class="grid opening">
          <h2 class="label opening__label" id="rn-title" data-reveal>${esc(label)}</h2>
          <div class="opening__body"><p class="h2" data-reveal>${esc(heading)}</p></div>
        </div>
        <div class="mt-8">${indexRows(entries, root, { kindLabel: true })}</div>
      </div>
    </section>`;
}
function hubLists(root) {
  const groups = [...new Set(content.guides.map((g) => g.group))];
  return {
    guideGroups: groups.map((g, i) => `<section class="section${i ? ' section--tight' : ' section--flush-top'}" aria-labelledby="gg-${i}">
      <div class="wrap">
        <div class="grid opening">
          <h2 class="label opening__label" id="gg-${i}" data-reveal>${esc(g)}</h2>
          <div class="opening__body">${indexRows(content.guides.filter((x) => x.group === g), root)}</div>
        </div>
      </div>
    </section>`).join('\n'),
    guides: indexRows(content.guides, root),
    tools: indexRows(content.tools, root),
    toolsFew: indexRows(content.tools.slice(0, 3), root, { kindLabel: true }),
    guidesFew: indexRows(content.guides.slice(0, 4), root, { kindLabel: true }),
    templatesFew: content.templates.filter((e) => ['freelancer', 'contractor', 'small-business'].includes(e.slug)).map((e) => tplCard(e, root, { compact: true })).join('\n'),
    guideCount: words(content.guides.length),
    toolCount: words(content.tools.length),
  };
}

const crumbsFor = (e) => [
  { name: 'Home', path: '/' },
  { name: KINDS[e.kind].hub, short: { template: 'Templates', guide: 'Guides', tool: 'Tools' }[e.kind], path: `/${KINDS[e.kind].base}/` },
  { name: e.title, short: e.name, path: e.url },
];
const HUBS = {
  templates: { name: 'Invoice templates', short: 'Templates', path: '/invoice-templates/', items: () => content.templates },
  guides: { name: 'Invoice guides', short: 'Guides', path: '/invoice-guides/', items: () => content.guides },
  tools: { name: 'Free tools', short: 'Tools', path: '/tools/', items: () => content.tools },
};

// ---------------------------------------------------------------- hand-written pages
const pagesDir = path.join(SRC, 'pages');
for (const file of (await walk(pagesDir)).filter((f) => f.endsWith('.html'))) {
  const rel = path.relative(pagesDir, file).split(path.sep).join('/');
  const { data, body } = frontMatter(await readFile(file, 'utf8'), rel);
  if (data.hub) {
    const hub = HUBS[data.hub];
    if (!hub) throw new Error(`${rel}: unknown hub "${data.hub}"`);
    data.pageType = 'hub';
    data.pageSlug = data.hub;
    data.crumbs = [{ name: 'Home', path: '/' }, { name: hub.name, short: hub.short, path: hub.path }];
    data.ld = [seo.itemList(hub.name, hub.items().map((e) => ({ name: e.title, url: site.url + e.url })))];
  }
  if (data.landing) {
    data.pageType = 'landing';
    data.pageSlug = data.landing;
    data.crumbs = [{ name: 'Home', path: '/' }, { name: data.crumb, path: '/' + rel.replace(/index\.html$/, '') }];
    if (data.schema === 'generator') {
      data.ld = [seo.faqPage(siteFaq.filter((f) => f.generator))];
      delete data.schema;
    }
  }
  if (rel === 'index.html') data.ld = [seo.organization(site), seo.website(site)];
  await emitPage(rel, data, body);
}

// ---------------------------------------------------------------- templates: /invoice-templates/<slug>/
// The generator reads assets/data/templates.json to open a page's own example in the right layout.
const presets = {};
for (const e of content.templates) {
  const root = '../../';
  const layout = templateById(e.layout);
  const T = layout.table;
  const s = e.sample || layout.sample;
  const relatedT = content.related(e, 'template', 3);
  const readNext = [...content.related(e, 'guide', 3), ...content.related(e, 'tool', 1)];
  const faqs = e.faqs.map((f) => ({ q: f.q, a: f.a.map((p) => md(p, root)) }));
  presets[e.slug] = { slug: e.slug, name: e.name, layout: e.layout, sample: s };

  await emitPage(`invoice-templates/${e.slug}/index.html`, {
    titleFull: e.metaTitle,
    description: e.description,
    ogTitle: e.title,
    nav: 'templates',
    bodyClass: 'page-template',
    pageType: 'template',
    pageSlug: e.slug,
    lastmod: e.updated,
    crumbs: crumbsFor(e),
    ld: [seo.faqPage(faqs)],
    cta: { track: 'template_selected', slug: e.slug, title: `Your ${e.name.toLowerCase()} invoice, in three minutes.`, button: 'Customize this invoice', href: `app/?template=${e.slug}&example`, text: 'Open the example in the generator, put in your own details and download the PDF. Your business details are remembered for next time.' },
  }, bodies['template-detail'], {
    tpl: {
      slug: e.slug,
      name: esc(e.name),
      title: esc(e.title),
      intro: md(e.intro, root),
      doc: entryDoc(e),
      caption: `${esc(s.business.name)} invoicing ${esc(s.client?.name || 'a client')}. Your own details replace these as you type.`,
      layoutName: esc(layout.name),
      composition: esc(COMPOSITIONS[layout.composition]),
      typeface: layout.face === 'serif' ? 'EB Garamond (serif)' : 'Hanken Grotesk (sans-serif)',
      columns: esc([T.desc, T.fixedFee ? null : T.qty, T.fixedFee ? null : T.price, T.amount].filter(Boolean).join(' · ') + (T.fixedFee ? ' (fixed-fee lines show Fee only)' : '')),
      sections: esc(layout.groups ? layout.groups.options.join(', ') : 'None, a single list'),
      explanation: e.explanation.map((p, i) => `<p${i === 0 ? ' class="tdetail__audience"' : ''}>${md(p, root)}</p>`).join(''),
      fieldsTitle: esc(e.fieldsTitle),
      fields: e.fields.map((f) => `<div data-reveal><dt>${esc(f.name)}</dt><dd>${md(f.text, root)}</dd></div>`).join(''),
      steps: e.steps.map((st, i) => `<li class="howto__step" data-reveal><p class="howto__num">${String(i + 1).padStart(2, '0')}</p><h3 class="howto__title">${esc(st.title)}</h3><p class="howto__text">${md(st.text, root)}</p></li>`).join(''),
      faqs: faqHtml(faqs),
      related: relatedTemplatesSection(relatedT, root),
      readNext: readNextSection(readNext, root, { heading: 'Guides and tools for this invoice.', ivory: true }),
    },
  });
}

await mkdir(path.join(DIST, 'assets', 'data'), { recursive: true });
await writeFile(path.join(DIST, 'assets', 'data', 'templates.json'), JSON.stringify(presets));

// ---------------------------------------------------------------- guides and tools (Markdown)
/** [[invoice: slug | caption]] and [[generator: label]] inside Markdown. */
const directives = (root) => (name, arg) => {
  if (name === 'invoice') {
    const [slug, caption = ''] = arg.split('|').map((x) => x.trim());
    const e = content.get('template', slug);
    if (!e) throw new Error(`[[invoice: ${slug}]]: no published template "${slug}"`);
    return `<figure class="plate plate--stone article__figure">
            <div class="plate__surface article__surface"><div class="doc-fit" data-doc-fit><div class="doc-fit__inner">${entryDoc(e)}</div></div></div>
            <figcaption class="plate__caption"><span class="label">Example</span><p>${md(caption || e.summary, root)} <a class="link" href="${root}${e.url.slice(1)}">${esc(e.name)} template</a></p></figcaption>
          </figure>`;
  }
  if (name === 'generator') {
    return `<p class="article__cta"><a class="btn" href="${root}app/">${esc(arg || 'Create an invoice')} ${arrow()}</a></p>`;
  }
  throw new Error(`Unknown directive [[${name}]]`);
};

function articleParts(e, root) {
  const r = markdown(e.body, { root, directive: directives(root), stepsUnder: e.howto });
  for (const l of r.links) {
    const p = l.split('#')[0];
    const known = pagesKnown.has(p) || Object.values(KINDS).some((k) => p === `/${k.base}/`);
    if (!known) throw new Error(`${e.file}: link to ${l}, which is not a page`);
  }
  return r;
}
const pagesKnown = new Set([
  ...content.published.map((e) => e.url),
  ...(await walk(pagesDir)).filter((f) => f.endsWith('.html')).map((f) => '/' + path.relative(pagesDir, f).split(path.sep).join('/').replace(/index\.html$/, '')),
]);
const toc = (headings) => headings.map((h) => `<li><a class="link" href="#${h.id}">${esc(h.text.replace(/\*\*|`/g, ''))}</a></li>`).join('');
const dateText = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

for (const e of content.guides) {
  const root = '../../';
  const canonical = `${site.url}${e.url}`;
  const a = articleParts(e, root);
  if (a.words < 700) throw new Error(`${e.file}: only ${a.words} words; a guide should answer its question in full`);
  const faqs = a.faqs;
  await emitPage(`invoice-guides/${e.slug}/index.html`, {
    titleFull: e.metaTitle,
    description: e.description,
    ogTitle: e.title,
    ogType: 'article',
    bodyClass: 'page-guide',
    pageType: 'guide',
    pageSlug: e.slug,
    lastmod: e.updated,
    crumbs: crumbsFor(e),
    ld: [seo.article(e, site, canonical), a.steps && seo.howTo(e, a.steps, canonical), seo.faqPage(faqs)],
  }, bodies.guide, {
    article: {
      title: esc(e.title),
      lead: md(e.summary, root),
      updated: dateText(e.updated),
      updatedISO: e.updated,
      minutes: String(Math.max(2, Math.round(a.words / 230))),
      toc: toc(a.headings),
      body: a.html,
      faqs: faqs.length ? `<section class="section section--ivory" aria-labelledby="faq-title">
      <div class="wrap">
        <div class="grid opening">
          <h2 class="label opening__label" id="faq-title" data-reveal>Questions</h2>
          <div class="opening__body--narrow" data-reveal><div class="faq">${faqHtml(faqs)}</div></div>
        </div>
      </div>
    </section>` : '',
      related: relatedTemplatesSection(content.related(e, 'template', 3), root, { label: 'Templates', heading: 'Start from a template.' }),
      readNext: readNextSection([...content.related(e, 'guide', 3), ...content.related(e, 'tool', 1)], root, { label: 'Read next', heading: 'More on invoicing.', ivory: !faqs.length }),
    },
  });
}

for (const e of content.tools) {
  const root = '../../';
  const canonical = `${site.url}${e.url}`;
  const a = articleParts(e, root);
  if (!partials.has(`tool-${e.widget}`)) throw new Error(`${e.file}: no partial src/partials/tool-${e.widget}.html`);
  if (!(await exists(path.join(SRC, 'scripts', 'tools', `${e.widget}.js`)))) throw new Error(`${e.file}: no script src/scripts/tools/${e.widget}.js`);
  await emitPage(`tools/${e.slug}/index.html`, {
    titleFull: e.metaTitle,
    description: e.description,
    ogTitle: e.title,
    bodyClass: 'page-tool',
    pageType: 'tool',
    pageSlug: e.slug,
    lastmod: e.updated,
    crumbs: crumbsFor(e),
    ld: [seo.webApp(e.title, e.description, canonical), seo.faqPage(a.faqs)],
    scripts: `<script type="module" src="{{root}}assets/js/tools/${e.widget}.js?v={{appVersion}}"></script>`,
    cta: { title: 'Put the numbers on an invoice.', text: 'The generator does the same arithmetic as this tool, line by line, and gives you a PDF to send.' },
  }, bodies.tool.replace('{{tool.widget}}', partials.get(`tool-${e.widget}`)), {
    tool: {
      slug: e.slug,
      title: esc(e.title),
      lead: md(e.lead, root),
      toc: toc(a.headings),
      body: a.html,
      faqs: faqHtml(a.faqs),
      related: relatedTemplatesSection(content.related(e, 'template', 3), root, { label: 'Templates', heading: 'Start from a template.' }),
      readNext: readNextSection([...content.related(e, 'guide', 3), ...content.related(e, 'tool', 2)], root, { label: 'Read next', heading: 'Guides and other tools.' }),
    },
  });
}

// ---------------------------------------------------------------- redirects
for (const [from, to] of Object.entries(redirects)) {
  if (!pages.some((p) => p.url === to)) throw new Error(`redirects.json: ${from} → ${to}, which is not a page`);
  if (pages.some((p) => p.url === from)) throw new Error(`redirects.json: ${from} is still a page`);
  const rel = from.slice(1) + 'index.html';
  const depth = rel.split('/').length - 1;
  await mkdir(path.join(DIST, path.dirname(rel)), { recursive: true });
  await writeFile(path.join(DIST, rel), seo.redirectStub(site, to, '../'.repeat(depth)));
  pages.push({ rel, url: from, type: 'redirect', status: 'redirect', indexable: false, redirect: to, html: '' });
}
await writeFile(path.join(DIST, '_redirects'), seo.redirectsFile(redirects));

// ---------------------------------------------------------------- sitemap, robots, audit
for (const p of pages) if (p.html) Object.assign(p, seo.auditPage(p.html, p.url, site.url));
for (const p of pages) p.inbound = pages.filter((q) => q !== p && q.links?.includes(p.url)).length;
for (const p of pages) p.issues = seo.issues(p);

await writeFile(path.join(DIST, 'sitemap.xml'), seo.sitemapXml(pages.map((p) => ({ ...p, canonical: site.url + p.url }))));
await writeFile(path.join(DIST, 'robots.txt'), seo.robotsTxt(site, { dashboard: !PRODUCTION }));

if (!PRODUCTION) {
  const { dashboard } = await import('./build/dashboard.mjs');
  await mkdir(path.join(DIST, '_seo'), { recursive: true });
  await writeFile(path.join(DIST, '_seo', 'index.html'), dashboard({ site, pages, content, cssVersion: hash(css), appVersion: appJsHash, analytics: analyticsSettings }));
}

const built = pages.filter((p) => p.type !== 'redirect').length;
const flagged = pages.filter((p) => p.issues.length);
console.log(`Built ${built} pages (${content.templates.length} templates, ${content.guides.length} guides, ${content.tools.length} tools, ${content.drafts.length} drafts held back) → dist/  css ${(css.length / 1024).toFixed(1)} KB  site.js ${(js.length / 1024).toFixed(1)} KB`);
if (flagged.length) console.log(`SEO issues:\n${flagged.map((p) => `  ${p.url}: ${p.issues.join('; ')}`).join('\n')}`);

/**
 * Search plumbing, generated from what the build actually emitted:
 * structured data, breadcrumbs, sitemap, robots.txt, redirects and the page
 * audit behind the unlisted SEO dashboard (/_seo/).
 *
 * Structured data describes only what is on the page: no ratings, reviews or
 * figures that do not exist.
 */
import { stripTags, wordCount } from './markdown.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html) => stripTags(String(html)).replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- JSON-LD

export const ldScripts = (objects) => objects.filter(Boolean)
  .map((o) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...o }).replace(/</g, '\\u003c')}</script>`).join('\n  ');

export const organization = (site) => ({
  '@type': 'Organization', '@id': `${site.url}/#organization`, name: site.name, legalName: site.legalName,
  url: `${site.url}/`, logo: `${site.url}/assets/icon-512.png`, email: site.email,
});
export const website = (site) => ({
  '@type': 'WebSite', '@id': `${site.url}/#website`, name: site.name, url: `${site.url}/`,
  description: site.description, inLanguage: 'en-US', publisher: { '@id': `${site.url}/#organization` },
});

export const breadcrumbList = (crumbs) => ({
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
});

export const faqPage = (faqs) => faqs.length ? {
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: f.a.map(plain).join(' ') } })),
} : null;

export const article = (e, site, canonical) => ({
  '@type': 'Article',
  headline: e.title,
  description: e.description,
  url: canonical,
  mainEntityOfPage: canonical,
  datePublished: e.published,
  dateModified: e.updated,
  inLanguage: 'en-US',
  image: `${site.url}/assets/og.jpg`,
  author: { '@type': 'Organization', name: site.name, url: `${site.url}/` },
  publisher: { '@id': `${site.url}/#organization` },
});

/** Only for guides whose subject is a sequence of steps the reader carries out. */
export const howTo = (e, steps, canonical) => ({
  '@type': 'HowTo',
  name: e.title,
  description: e.description,
  url: canonical,
  step: steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.name, text: s.text })),
});

/** A free tool on the page: a small web application. */
export const webApp = (name, description, url) => ({
  '@type': 'WebApplication',
  name,
  url,
  description,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Any (web browser)',
  browserRequirements: 'Requires JavaScript',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
});

export const itemList = (name, items) => ({
  '@type': 'ItemList',
  name,
  numberOfItems: items.length,
  itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: x.url, name: x.name })),
});

// ---------------------------------------------------------------- breadcrumbs

/** Visible breadcrumbs; the last crumb is the current page and is not a link. */
export function crumbsHtml(crumbs, root) {
  return `<nav class="crumbs page-head__label" aria-label="Breadcrumb" data-reveal><ol class="label">${crumbs
    .map((c, i) => (i === crumbs.length - 1
      ? `<li aria-current="page">${esc(c.short || c.name)}</li>`
      : `<li><a class="link" href="${root}${c.path.slice(1)}">${esc(c.short || c.name)}</a></li>`)).join('')}</ol></nav>`;
}

// ---------------------------------------------------------------- crawling files

export function sitemapXml(pages) {
  const urls = pages.filter((p) => p.indexable).sort((a, b) => a.canonical.localeCompare(b.canonical));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((p) => `  <url><loc>${esc(p.canonical)}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
}

/**
 * Everything public is crawlable. Not crawled: the generator's address-bar
 * states (/app/?template=…, ?number=… — each is the same page), payment links
 * (/pay/…, private to each invoice; they also send noindex), the payments API
 * and the SEO dashboard. Pages also carry a canonical URL without parameters.
 */
export const robotsTxt = (site, { dashboard }) => `User-agent: *
Allow: /
Disallow: /app/?
Disallow: /pay/
Disallow: /api/
${dashboard ? 'Disallow: /_seo/\n' : ''}
Sitemap: ${site.url}/sitemap.xml
`;

/** Netlify / Cloudflare Pages format; other hosts can read the same list. */
export const redirectsFile = (redirects) => Object.entries(redirects).map(([from, to]) => `${from} ${to} 301`).join('\n') + '\n';

/** A static fallback for hosts without redirect rules: canonical + refresh, never indexed. */
export const redirectStub = (site, to, root) => `<!doctype html>
<html lang="en-US">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Moved — ${esc(site.name)}</title>
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="${site.url}${to}">
  <meta http-equiv="refresh" content="0; url=${root}${to.slice(1)}">
</head>
<body>
  <p>This page has moved to <a href="${root}${to.slice(1)}">${esc(site.url + to)}</a>.</p>
</body>
</html>
`;

// ---------------------------------------------------------------- page audit

/** Facts about one emitted page, read back from its final HTML. */
export function auditPage(html, url, base) {
  const get = (re) => (re.exec(html) || [])[1] || '';
  const main = get(/<main[^>]*>([\s\S]*?)<\/main>/);
  const links = [...main.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map((m) => m[1])
    .filter((h) => !/^(mailto:|https?:|#)/.test(h))
    .map((h) => new URL(h, base + url).pathname)
    .filter((p) => !p.startsWith('/assets/'));
  return {
    title: get(/<title>([^<]*)<\/title>/).replace(/&amp;/g, '&'),
    description: get(/<meta name="description" content="([^"]*)"/).replace(/&amp;/g, '&'),
    robots: get(/<meta name="robots" content="([^"]*)"/),
    canonical: get(/<link rel="canonical" href="([^"]*)"/),
    h1: plain(get(/<h1[^>]*>([\s\S]*?)<\/h1>/)),
    h1Count: (html.match(/<h1[\s>]/g) || []).length,
    words: wordCount(main.replace(/<div class="doc-fit"[\s\S]*?<\/article>/g, ' ')),
    schema: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])['@type']),
    links: [...new Set(links)],
  };
}

const MIN_WORDS = { template: 600, guide: 700, tool: 400, hub: 150, landing: 400, page: 0 };

/** Problems a reviewer should fix; the build test requires none on indexable pages. */
export function issues(p) {
  const out = [];
  if (!p.indexable) return out;
  if (p.title.length > 65) out.push(`title ${p.title.length} chars`);
  if (p.description.length < 80 || p.description.length > 170) out.push(`description ${p.description.length} chars`);
  if (p.h1Count !== 1) out.push(`${p.h1Count} h1`);
  if (p.words < (MIN_WORDS[p.type] || 0)) out.push(`thin: ${p.words} words`);
  if (p.type !== 'page' && p.inbound === 0) out.push('orphan: no internal links in');
  if (['template', 'guide', 'tool'].includes(p.type) && !p.schema.includes('BreadcrumbList')) out.push('no breadcrumbs');
  return out;
}

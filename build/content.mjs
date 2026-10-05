/**
 * The content database: one model for every SEO page.
 *
 *   src/content/templates/<slug>.json   → /invoice-templates/<slug>/
 *   src/content/guides/<slug>.md        → /invoice-guides/<slug>/
 *   src/content/tools/<slug>.md         → /tools/<slug>/
 *
 * Structured pages (templates) are JSON; long-form pages (guides, tools) are
 * Markdown with front matter. Both load into the same entry shape:
 *
 *   { kind, slug, url, status, name, title, metaTitle, description, summary,
 *     category, published, updated, related: { templates, guides, tools }, faqs, …kind-specific }
 *
 * Adding a file adds the page, its card on the hub, its breadcrumbs, structured
 * data, sitemap entry and related links. Everything is validated here so that a
 * mistake fails the build instead of publishing a broken or thin page.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { list } from './markdown.mjs';

export const KINDS = {
  template: { dir: 'templates', base: 'invoice-templates', hub: 'Invoice templates', ext: '.json' },
  guide: { dir: 'guides', base: 'invoice-guides', hub: 'Invoice guides', ext: '.md' },
  tool: { dir: 'tools', base: 'tools', hub: 'Free tools', ext: '.md' },
};
const PLURAL = { template: 'templates', guide: 'guides', tool: 'tools' };
export const TITLE_SUFFIX = ' · Folio';
export const LIMITS = { title: 65, descMin: 80, descMax: 165, summaryMax: 180 };

/** Front matter: `key: value` lines; `related*` keys are comma-separated lists. */
export function frontMatter(source, file) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!m) throw new Error(`Missing front matter in ${file}`);
  const data = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i < 1) throw new Error(`${file}: bad front matter line "${line}"`);
    data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { data, body: source.slice(m[0].length) };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function base(kind, slug, d, file, more = []) {
  const errors = [];
  const need = (k) => { if (!d[k] || (typeof d[k] === 'string' && !d[k].trim())) errors.push(`missing "${k}"`); };
  ['name', 'title', 'description', 'summary', 'updated'].forEach(need);
  if (d.slug && d.slug !== slug) errors.push(`slug "${d.slug}" does not match the file name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errors.push('slug must be lowercase words joined by hyphens');
  const status = d.status || 'published';
  if (!['published', 'draft'].includes(status)) errors.push(`status must be published or draft`);
  for (const k of ['published', 'updated']) if (d[k] && !DATE.test(d[k])) errors.push(`${k} must be yyyy-mm-dd`);
  const metaTitle = (d.metaTitle || d.title || '') + TITLE_SUFFIX;
  if (metaTitle.length > LIMITS.title) errors.push(`title tag is ${metaTitle.length} characters (max ${LIMITS.title}): ${metaTitle}`);
  const dl = (d.description || '').length;
  if (dl < LIMITS.descMin || dl > LIMITS.descMax) errors.push(`description is ${dl} characters (${LIMITS.descMin}–${LIMITS.descMax})`);
  if ((d.summary || '').length > LIMITS.summaryMax) errors.push(`summary is over ${LIMITS.summaryMax} characters`);
  errors.push(...more);
  if (errors.length) throw new Error(`${file}:\n  - ${errors.join('\n  - ')}`);
  return {
    kind,
    slug,
    url: `/${KINDS[kind].base}/${slug}/`,
    file,
    status,
    name: d.name,
    title: d.title,
    metaTitle,
    description: d.description,
    summary: d.summary,
    category: d.category || '',
    published: d.published || d.updated,
    updated: d.updated,
    related: { templates: list(d.relatedTemplates), guides: list(d.relatedGuides), tools: list(d.relatedTools) },
    faqs: [],
  };
}

async function files(dir, ext) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(ext) && !f.startsWith('_')).sort();
  } catch {
    return [];
  }
}

/**
 * Load and validate the whole database.
 *   registry  the invoice layouts (core/templates.js): { TEMPLATES, hasTemplate, CATEGORIES }
 */
export async function loadContent(contentDir, registry) {
  const entries = [];
  const failures = []; // every broken file is reported at once

  // ---- templates (JSON)
  const tdir = path.join(contentDir, KINDS.template.dir);
  for (const f of await files(tdir, '.json')) try {
    const rel = `src/content/templates/${f}`;
    let d;
    try { d = JSON.parse(await readFile(path.join(tdir, f), 'utf8')); } catch (e) { throw new Error(`${rel}: ${e.message}`); }
    const slug = f.replace(/\.json$/, '');
    const errors = [];
    if (!registry.hasTemplate(d.layout)) errors.push(`layout "${d.layout}" is not a template id in core/templates.js`);
    const layout = registry.TEMPLATES.find((t) => t.id === d.layout);
    const category = d.category || layout?.category;
    if (layout && !registry.CATEGORIES.some((c) => c.id === category)) errors.push(`unknown category "${category}"`);
    if (!d.intro) errors.push('missing "intro"');
    if (!Array.isArray(d.explanation) || d.explanation.length < 1) errors.push('"explanation" needs at least one paragraph');
    if (!Array.isArray(d.fields) || d.fields.length < 4) errors.push('"fields" needs at least four entries');
    if (!Array.isArray(d.steps) || d.steps.length < 3) errors.push('"steps" needs at least three entries');
    if (!Array.isArray(d.faqs) || d.faqs.length < 3) errors.push('"faqs" needs at least three questions');
    for (const x of d.fields || []) if (!x.name || !x.text) errors.push('each field needs "name" and "text"');
    for (const x of d.steps || []) if (!x.title || !x.text) errors.push('each step needs "title" and "text"');
    for (const x of d.faqs || []) if (!x.q || !x.a) errors.push('each FAQ needs "q" and "a"');
    if (d.sample && (!d.sample.business || !Array.isArray(d.sample.items))) errors.push('"sample" needs business and items');
    const e = base('template', slug, d, rel, errors);
    e.category = category;
    Object.assign(e, {
      layout: d.layout,
      intro: d.intro,
      explanation: d.explanation,
      fieldsTitle: d.fieldsTitle || `What to put on a ${d.name.toLowerCase()} invoice`,
      fields: d.fields,
      steps: d.steps,
      sample: d.sample || null,
      faqs: d.faqs.map((x) => ({ q: x.q, a: Array.isArray(x.a) ? x.a : [x.a] })),
    });
    entries.push(e);
  } catch (err) { failures.push(err.message); }

  // ---- guides and tools (Markdown)
  for (const kind of ['guide', 'tool']) {
    const dir = path.join(contentDir, KINDS[kind].dir);
    for (const f of await files(dir, '.md')) try {
      const rel = `src/content/${KINDS[kind].dir}/${f}`;
      const { data, body } = frontMatter(await readFile(path.join(dir, f), 'utf8'), rel);
      const e = base(kind, f.replace(/\.md$/, ''), data, rel);
      e.body = body;
      e.howto = data.howto || '';
      e.group = data.group || '';
      e.order = Number(data.order) || 999; // position on the hub; groups appear in the order of their first guide
      if (kind === 'guide' && !e.group) throw new Error(`${rel}: missing "group"`);
      if (kind === 'tool') {
        e.widget = data.widget || e.slug;
        e.lead = data.lead || e.summary;
      }
      entries.push(e);
    } catch (err) { failures.push(err.message); }
  }
  if (failures.length) throw new Error(`Content database:\n${failures.join('\n')}`);

  // ---- cross-checks
  const published = entries.filter((e) => e.status === 'published');
  const by = { template: new Map(), guide: new Map(), tool: new Map() };
  for (const e of published) by[e.kind].set(e.slug, e);
  const problems = [];
  const seen = { title: new Map(), description: new Map() };
  for (const e of published) {
    for (const k of ['title', 'description']) {
      const v = k === 'title' ? e.metaTitle : e.description;
      if (seen[k].has(v)) problems.push(`${e.file}: same ${k} as ${seen[k].get(v)}`);
      seen[k].set(v, e.file);
    }
    for (const kind of ['template', 'guide', 'tool']) {
      for (const s of e.related[PLURAL[kind]]) {
        if (!by[kind].has(s)) problems.push(`${e.file}: related ${kind} "${s}" does not exist or is a draft`);
        if (kind === e.kind && s === e.slug) problems.push(`${e.file}: relates to itself`);
      }
    }
  }
  if (problems.length) throw new Error(`Content database:\n  - ${problems.join('\n  - ')}`);

  return {
    entries,
    published,
    drafts: entries.filter((e) => e.status === 'draft'),
    // Hub order: by category (as listed in core/templates.js), then name.
    templates: published.filter((e) => e.kind === 'template')
      .sort((a, b) => registry.CATEGORIES.findIndex((c) => c.id === a.category) - registry.CATEGORIES.findIndex((c) => c.id === b.category) || a.name.localeCompare(b.name)),
    guides: published.filter((e) => e.kind === 'guide').sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    tools: published.filter((e) => e.kind === 'tool'),
    get: (kind, slug) => by[kind].get(slug),
    /**
     * The internal linking engine. Up to `n` published entries of `kind` for a
     * page: the ones it names first, then pages that name it (links both ways),
     * then the same category, then the rest in database order.
     */
    related(entry, kind, n = 3) {
      const pool = published.filter((x) => x.kind === kind);
      const picked = [];
      const add = (x) => { if (x && x !== entry && !picked.includes(x) && picked.length < n) picked.push(x); };
      if (entry) {
        entry.related[PLURAL[kind]].forEach((s) => add(by[kind].get(s)));
        pool.filter((x) => x.related[PLURAL[entry.kind]].includes(entry.slug)).forEach(add);
        if (entry.category) pool.filter((x) => x.category === entry.category).forEach(add);
        if (entry.group) pool.filter((x) => x.group === entry.group).forEach(add);
      }
      pool.forEach(add);
      return picked;
    },
  };
}

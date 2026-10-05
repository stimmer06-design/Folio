/**
 * Growth metrics: pure functions from measured data to the dashboard's
 * numbers, tables and observations. No DOM, no network, no invented figures.
 *
 * Inputs (normalized by growth/google.js or growth/csv.js):
 *
 *   ga  = { totals: { current, previous }, events: { current, previous },
 *           landing: [{ path, users, sessions, events }], templates: [...] | null,
 *           channels: [...], sources: [...], missing: [...] }
 *         where events = { [eventName]: { users, count } }
 *   gsc = { pages: [{ path, clicks, impressions, ctr, position }], queries: [...] }
 *   index = the site's pages: [{ path, type, slug, name }]  (embedded by the build)
 *
 * Every function returns null (or a reason) rather than a number when the data
 * needed for it doesn't exist, so the dashboard can say "no data" instead of 0.
 */

/** Minimum sample sizes before an observation is made about a page or template. */
export const MIN = {
  impressions: 100, // before judging a page's search click-through rate
  visitors: 20, // before judging a page's conversion
  templateViews: 30, // before judging a template's view → generator rate
  templateOpens: 15, // before judging a template's open → invoice rate
  peers: 3, // pages needed to form a comparison median
  funnelVisitors: 50, // before naming the biggest funnel drop-off
};

export const FUNNEL = [
  { key: 'visitors', label: 'Visitors' },
  { key: 'seo_page_view', label: 'SEO page views' },
  { key: 'invoice_generator_opened', label: 'Generator opens' },
  { key: 'invoice_created', label: 'Invoices created' },
  { key: 'pdf_downloaded', label: 'PDF downloads' },
];

const users = (events, name) => (events && events[name] ? events[name].users : 0);
const count = (events, name) => (events && events[name] ? events[name].count : 0);
export const ratio = (a, b) => (b > 0 ? a / b : null);
export const median = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const quantile = (xs, q) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : null;
};

/** Change against the previous period; null when there is no previous data to compare with. */
export function change(current, previous) {
  if (previous == null || current == null || previous === 0) return null;
  return (current - previous) / previous;
}

/** True when the previous period has any measurement at all. */
export const hasHistory = (ga) => Boolean(ga && ga.totals && ga.totals.previous && ga.totals.previous.users > 0);

/** Has anything been measured in the current period? */
export const hasData = (ga) => Boolean(ga && ga.totals && ga.totals.current && (ga.totals.current.users > 0 || ga.totals.current.sessions > 0));

// ---------------------------------------------------------------- overview & funnel

export function overview(ga) {
  if (!ga) return null;
  const history = hasHistory(ga);
  const tile = (key, label, unit, cur, prev) => ({ key, label, unit, value: cur, previous: history ? prev : null, change: history ? change(cur, prev) : null });
  const c = ga.events.current || {};
  const p = (ga.events.previous || {});
  return {
    history,
    tiles: [
      tile('visitors', 'Visitors', 'people', ga.totals.current.users, ga.totals.previous?.users),
      tile('seo_visitors', 'SEO visitors', 'people', users(c, 'seo_page_view'), users(p, 'seo_page_view')),
      tile('generator_opens', 'Generator opens', 'people', users(c, 'invoice_generator_opened'), users(p, 'invoice_generator_opened')),
      tile('invoices_created', 'Invoices created', 'invoices', count(c, 'invoice_created'), count(p, 'invoice_created')),
      tile('pdf_downloads', 'PDF downloads', 'downloads', count(c, 'pdf_downloaded'), count(p, 'pdf_downloaded')),
    ],
  };
}

/**
 * The funnel, in people (users who did each thing in the period).
 * Steps aren't strictly nested — someone can open the generator without
 * viewing an SEO page — so a step larger than the one before is marked
 * `notNested` and has no drop-off.
 */
export function funnel(ga) {
  if (!ga) return null;
  const c = ga.events.current || {};
  const values = FUNNEL.map((s) => (s.key === 'visitors' ? ga.totals.current.users : users(c, s.key)));
  const steps = FUNNEL.map((s, i) => {
    const value = values[i];
    const prev = i ? values[i - 1] : null;
    const fromPrevious = i ? ratio(value, prev) : null;
    const notNested = fromPrevious != null && fromPrevious > 1;
    return {
      ...s,
      value,
      ofVisitors: ratio(value, values[0]),
      fromPrevious: notNested ? null : fromPrevious,
      dropOff: fromPrevious == null || notNested ? null : 1 - fromPrevious,
      notNested,
    };
  });
  let biggest = null;
  if (values[0] >= MIN.funnelVisitors) {
    steps.forEach((s, i) => {
      if (i && s.dropOff != null && (biggest == null || s.dropOff > steps[biggest].dropOff)) biggest = i;
    });
  }
  return { steps, biggest, enough: values[0] >= MIN.funnelVisitors };
}

// ---------------------------------------------------------------- pages

/** "/invoice-templates/plumber" or "https://x.com/invoice-templates/plumber/?a=1" → "/invoice-templates/plumber/" */
export function normalizePath(p) {
  let path = String(p || '').trim();
  if (!path || path === '(not set)') return '(not set)';
  try { if (/^https?:\/\//.test(path)) path = new URL(path).pathname; } catch { /* keep */ }
  path = path.split(/[?#]/)[0];
  if (!path.startsWith('/')) path = '/' + path;
  path = path.replace(/\/index\.html$/, '/');
  if (!/\.[a-z0-9]+$/i.test(path) && !path.endsWith('/')) path += '/';
  return path;
}

const describe = (index, path) => index.find((x) => x.path === path) || { path, type: 'other', name: path };

/** Landing pages with what their visits went on to do. Sorted by visitors. */
export function landingPages(ga, index) {
  if (!ga) return null;
  const rows = new Map();
  for (const r of ga.landing || []) {
    const path = normalizePath(r.path);
    const row = rows.get(path) || { path, users: 0, sessions: 0, events: {} };
    row.users += r.users;
    row.sessions += r.sessions;
    for (const [k, v] of Object.entries(r.events || {})) {
      const e = (row.events[k] = row.events[k] || { users: 0, count: 0 });
      e.users += v.users;
      e.count += v.count;
    }
    rows.set(path, row);
  }
  return [...rows.values()].map((r) => {
    const page = describe(index, r.path);
    const opens = users(r.events, 'invoice_generator_opened');
    const created = users(r.events, 'invoice_created');
    return {
      path: r.path,
      type: page.type,
      name: page.name,
      visitors: r.users,
      opens,
      created,
      invoices: count(r.events, 'invoice_created'),
      pdfs: count(r.events, 'pdf_downloaded'),
      openRate: ratio(opens, r.users),
      conversion: ratio(created, r.users),
    };
  }).sort((a, b) => b.visitors - a.visitors || a.path.localeCompare(b.path));
}

export function sortRows(rows, key, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1; // no value: always last
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sign;
  });
}

/** Templates, templates/guides/tools/other: totals by page type, attributed to the landing page. */
export function contentByType(landing) {
  if (!landing) return null;
  const groups = [['template', 'Templates'], ['guide', 'Guides'], ['tool', 'Tools'], ['landing', 'Invoice generator page'], ['hub', 'Hubs'], ['page', 'Other site pages'], ['app', 'Generator (direct)'], ['other', 'Unmatched']];
  return groups.map(([type, label]) => {
    const rows = landing.filter((r) => r.type === type);
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    const visitors = sum('visitors');
    return { type, label, pages: rows.length, visitors, opens: sum('opens'), created: sum('created'), invoices: sum('invoices'), pdfs: sum('pdfs'), conversion: ratio(sum('created'), visitors) };
  }).filter((g) => g.pages > 0);
}

// ---------------------------------------------------------------- templates

/** Per template: views → customizations → generator opens → invoices → PDFs, from the `template` event parameter. */
export function templatePerformance(ga, index) {
  if (!ga || !ga.templates) return null;
  return ga.templates
    .filter((t) => t.template && t.template !== '(not set)')
    .map((t) => {
      const page = index.find((x) => x.type === 'template' && x.slug === t.template);
      const views = count(t.events, 'template_view');
      const customizations = count(t.events, 'template_selected');
      const opens = count(t.events, 'invoice_generator_opened');
      const created = count(t.events, 'invoice_created');
      const pdfs = count(t.events, 'pdf_downloaded');
      return {
        template: t.template,
        name: page ? page.name : t.template,
        path: page ? page.path : null,
        views, customizations, opens, created, pdfs,
        viewToOpen: ratio(opens, views),
        openToCreated: ratio(created, opens),
        createdToPdf: ratio(pdfs, created),
      };
    })
    .sort((a, b) => b.views - a.views || b.created - a.created || a.template.localeCompare(b.template));
}

// ---------------------------------------------------------------- sources

const BUCKETS = [
  ['Organic Search', /^organic search$|^organic shopping$|^organic video$/i],
  ['Direct', /^direct$/i],
  ['Referral', /^referral$/i],
  ['Social', /social/i],
];
export const bucketOf = (channel) => (BUCKETS.find(([, re]) => re.test(channel || '')) || ['Other'])[0];

/** GA4's channel groups folded into five buckets, each with its own GA4 channels and top sources. */
export function trafficSources(ga) {
  if (!ga || !ga.channels) return null;
  const order = ['Organic Search', 'Direct', 'Referral', 'Social', 'Other'];
  const buckets = order.map((name) => ({ name, users: 0, sessions: 0, opens: 0, created: 0, channels: [] }));
  for (const c of ga.channels) {
    const b = buckets.find((x) => x.name === bucketOf(c.channel));
    b.users += c.users;
    b.sessions += c.sessions;
    b.opens += users(c.events, 'invoice_generator_opened');
    b.created += users(c.events, 'invoice_created');
    b.channels.push(c.channel);
  }
  const total = buckets.reduce((s, b) => s + b.users, 0);
  return {
    total,
    buckets: buckets.map((b) => ({ ...b, share: ratio(b.users, total), conversion: ratio(b.created, b.users) })),
    sources: (ga.sources || []).slice().sort((a, b) => b.users - a.users).map((s) => ({ ...s, label: `${s.source} / ${s.medium}` })),
  };
}

// ---------------------------------------------------------------- search

const band = (position) => (position <= 3 ? '1–3' : position <= 10 ? '4–10' : position <= 20 ? '11–20' : '21+');

/** Search Console pages joined with what their visits did. */
export function searchPages(gsc, landing, index) {
  if (!gsc || !gsc.pages) return null;
  const byPath = new Map((landing || []).map((r) => [r.path, r]));
  const merged = new Map();
  for (const p of gsc.pages) {
    const path = normalizePath(p.path);
    const m = merged.get(path) || { path, clicks: 0, impressions: 0, positionWeight: 0 };
    m.clicks += p.clicks;
    m.impressions += p.impressions;
    m.positionWeight += p.position * p.impressions;
    merged.set(path, m);
  }
  return [...merged.values()].map((m) => {
    const page = describe(index, m.path);
    const l = byPath.get(m.path);
    const position = m.impressions ? m.positionWeight / m.impressions : null;
    return {
      path: m.path, name: page.name, type: page.type,
      clicks: m.clicks, impressions: m.impressions, ctr: ratio(m.clicks, m.impressions), position, band: position == null ? null : band(position),
      visitors: l ? l.visitors : null, created: l ? l.created : null, conversion: l ? l.conversion : null,
    };
  }).sort((a, b) => b.impressions - a.impressions);
}

const pctText = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);
const num = (n) => Number(n).toLocaleString('en-US');

/**
 * Pages in four groups, each judged only against this site's own pages:
 *   lowCtr           many impressions, click-through well below pages ranking in similar positions
 *   lowConversion    clicked well, but visits rarely become invoices
 *   underexposed     visits convert well, but the page is rarely seen
 *   winners          high traffic and high conversion
 * A group with too little data says so instead of guessing.
 */
export function opportunities(pages, landing) {
  const out = { lowCtr: [], lowConversion: [], underexposed: [], winners: [], notes: [] };
  const conv = (landing || []).filter((r) => r.visitors >= MIN.visitors && r.type !== 'app' && r.type !== 'other');
  const convMedian = conv.length >= MIN.peers ? median(conv.map((r) => r.conversion)) : null;
  if (convMedian == null) out.notes.push(`Conversion comparisons need at least ${MIN.peers} pages with ${MIN.visitors}+ visitors each.`);

  if (pages) {
    const judged = pages.filter((p) => p.impressions >= MIN.impressions);
    const bandMedian = {};
    for (const b of ['1–3', '4–10', '11–20', '21+']) {
      const peers = judged.filter((p) => p.band === b);
      if (peers.length >= MIN.peers) bandMedian[b] = median(peers.map((p) => p.ctr));
    }
    const overall = judged.length >= MIN.peers ? median(judged.map((p) => p.ctr)) : null;
    if (overall == null) out.notes.push(`Click-through comparisons need at least ${MIN.peers} pages with ${MIN.impressions}+ search impressions.`);
    for (const p of judged) {
      const ref = bandMedian[p.band] ?? overall;
      if (ref == null) continue;
      const refLabel = bandMedian[p.band] != null ? `the site’s median for pages ranking ${p.band}` : 'the site’s median';
      if (p.ctr < ref * 0.5) {
        out.lowCtr.push({ ...p, evidence: `${num(p.impressions)} impressions, ${pctText(p.ctr)} click-through vs ${pctText(ref)} (${refLabel}), average position ${p.position.toFixed(1)}`, action: 'Review the title and meta description, and whether the page matches what these searches are looking for.' });
      } else if (convMedian != null && p.visitors >= MIN.visitors && p.ctr >= ref && p.conversion < convMedian * 0.5) {
        out.lowConversion.push({ ...p, evidence: `${pctText(p.ctr)} click-through (median ${pctText(ref)}), but ${pctText(p.conversion)} of ${num(p.visitors)} visitors created an invoice vs ${pctText(convMedian)} site median`, action: 'Review the call to action, the preview and the step into the generator.' });
      }
    }
    if (convMedian != null) {
      const impMedian = median(pages.map((p) => p.impressions));
      for (const r of conv) {
        const p = pages.find((x) => x.path === r.path);
        const impressions = p ? p.impressions : 0;
        if (r.conversion >= convMedian * 1.5 && impressions < impMedian) {
          out.underexposed.push({ ...r, impressions, evidence: `${pctText(r.conversion)} of ${num(r.visitors)} visitors created an invoice (median ${pctText(convMedian)}), but only ${num(impressions)} search impressions (median ${num(Math.round(impMedian))})`, action: 'Link to it from related pages and consider content around the same need.' });
        }
      }
    }
  }
  if (convMedian != null) {
    const top = quantile(conv.map((r) => r.visitors), 0.75);
    for (const r of conv) {
      if (r.visitors >= top && r.conversion >= convMedian * 1.25) {
        out.winners.push({ ...r, evidence: `${num(r.visitors)} visitors, ${pctText(r.conversion)} created an invoice (median ${pctText(convMedian)})`, action: 'Consider related pages for neighbouring trades or questions, and keep this one current.' });
      }
    }
    if (!pages) {
      // Without search data, the traffic side of "underexposed" comes from visits alone.
      const visMedian = median(conv.map((r) => r.visitors));
      for (const r of conv) {
        if (r.conversion >= convMedian * 1.5 && r.visitors <= visMedian) {
          out.underexposed.push({ ...r, evidence: `${pctText(r.conversion)} of ${num(r.visitors)} visitors created an invoice (median ${pctText(convMedian)}), with fewer visitors than most pages`, action: 'Link to it from related pages and consider content around the same need.' });
        }
      }
    }
  }
  for (const k of ['lowCtr', 'lowConversion', 'underexposed', 'winners']) {
    out[k].sort((a, b) => (b.impressions || b.visitors || 0) - (a.impressions || a.visitors || 0));
  }
  return out;
}

// ---------------------------------------------------------------- what to do next

const STEP_ACTIONS = {
  seo_page_view: 'Most visitors never reach a guide, tool or template page. Link to them more prominently from the pages people land on.',
  invoice_generator_opened: 'Visitors read the pages but don’t open the generator. Make the main call to action more prominent on the highest-traffic pages.',
  invoice_created: 'People open the generator but don’t start filling it in. Look at the generator’s first screen and the examples on the busiest entry routes.',
  pdf_downloaded: 'Invoices are started but rarely downloaded. Check the download and print steps, especially on phones.',
};

/**
 * Observations worth acting on, each with the numbers behind it. The funnel's
 * biggest drop-off comes first, then problems on the site (templates, guides,
 * tools), then search, content and sources; within each, the largest volume
 * first. Nothing here is a forecast.
 */
export function recommendations({ funnel: f, templates, landing, opportunities: o, sources }) {
  const out = [];
  if (f && f.biggest != null) {
    const s = f.steps[f.biggest];
    const before = f.steps[f.biggest - 1];
    out.push({
      kind: 'funnel', weight: before.value, title: `Funnel: ${before.label} → ${s.label}`,
      observation: `The biggest drop-off: ${pctText(s.dropOff)} of ${num(before.value)} ${before.key === 'visitors' ? 'visitors' : 'people'} don’t go on to the next step.`,
      action: STEP_ACTIONS[s.key],
    });
  }
  if (templates) {
    const seen = templates.filter((t) => t.views >= MIN.templateViews);
    const m = seen.length >= MIN.peers ? median(seen.map((t) => t.viewToOpen)) : null;
    for (const t of seen) {
      if (m != null && t.viewToOpen < m * 0.5) {
        out.push({ kind: 'template', weight: t.views, title: `${t.name} template`, path: t.path, observation: `${num(t.views)} views, but ${pctText(t.viewToOpen)} opened it in the generator (median across templates ${pctText(m)}).`, action: 'Improve the “Customize this invoice” call to action and the preview on this page.' });
      }
    }
    const opened = templates.filter((t) => t.opens >= MIN.templateOpens);
    const m2 = opened.length >= MIN.peers ? median(opened.map((t) => t.openToCreated)) : null;
    for (const t of opened) {
      if (m2 != null && t.openToCreated < m2 * 0.5) {
        out.push({ kind: 'template', weight: t.opens, title: `${t.name} template`, path: t.path, observation: `${num(t.opens)} generator opens, but ${pctText(t.openToCreated)} became invoices (median ${pctText(m2)}).`, action: 'Check that the example and column labels fit this trade, so starting an invoice feels obvious.' });
      }
    }
  }
  if (landing) {
    const content = landing.filter((r) => (r.type === 'guide' || r.type === 'tool') && r.visitors >= MIN.visitors);
    const all = landing.filter((r) => r.visitors >= MIN.visitors && r.type !== 'app' && r.type !== 'other');
    const m = all.length >= MIN.peers ? median(all.map((r) => r.openRate)) : null;
    for (const r of content) {
      if (m != null && r.openRate < m * 0.5) {
        out.push({ kind: r.type, weight: r.visitors, title: r.name, path: r.path, observation: `${num(r.visitors)} visitors, but ${pctText(r.openRate)} opened the generator (median ${pctText(m)}).`, action: r.type === 'guide' ? 'Add a clearer call to action where the guide answers the question, not only at the end.' : 'Make the step from the result into the generator more prominent.' });
      }
    }
  }
  if (o) {
    for (const p of o.lowCtr.slice(0, 3)) out.push({ kind: 'search', weight: p.impressions, title: p.name, path: p.path, observation: p.evidence, action: p.action });
    for (const p of o.lowConversion.slice(0, 3)) out.push({ kind: 'search', weight: p.visitors, title: p.name, path: p.path, observation: p.evidence, action: p.action });
    for (const p of o.underexposed.slice(0, 3)) out.push({ kind: 'content', weight: p.visitors, title: p.name, path: p.path, observation: p.evidence, action: p.action });
  }
  if (sources) {
    const overall = ratio(sources.buckets.reduce((s, b) => s + b.created, 0), sources.total);
    for (const b of sources.buckets) {
      if (overall && b.users >= MIN.visitors && b.conversion >= overall * 1.5 && b.share < 0.2) {
        out.push({ kind: 'source', weight: b.users, title: `${b.name} traffic`, observation: `${pctText(b.conversion)} of ${num(b.users)} visitors from ${b.name.toLowerCase()} created an invoice, against ${pctText(overall)} overall, but it is ${pctText(b.share)} of traffic.`, action: 'Look at which sources these are (below) and whether there is more to do there.' });
      }
    }
  }
  const rank = { funnel: 0, template: 1, guide: 1, tool: 1, search: 2, content: 3, source: 4 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.weight - a.weight).slice(0, 10);
}

// ---------------------------------------------------------------- dates

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const daysIn = (r) => Math.round((new Date(r.end + 'T00:00:00Z') - new Date(r.start + 'T00:00:00Z')) / 864e5) + 1;

/**
 * A date range and the equivalent period immediately before it.
 * Preset ranges end yesterday: today's data is still incomplete.
 */
export function dateRange(preset, today = new Date(), custom = null) {
  let start;
  let end;
  if (preset === 'custom' && custom && /^\d{4}-\d{2}-\d{2}$/.test(custom.start) && /^\d{4}-\d{2}-\d{2}$/.test(custom.end)) {
    [start, end] = custom.start <= custom.end ? [custom.start, custom.end] : [custom.end, custom.start];
  } else {
    const days = { 7: 7, 28: 28, 90: 90 }[preset] || 28;
    const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    end = addDays(local, -1);
    start = addDays(end, -(days - 1));
  }
  const n = daysIn({ start, end });
  return { start, end, days: n, previous: { start: addDays(start, -n), end: addDays(start, -1) } };
}

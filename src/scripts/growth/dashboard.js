/**
 * The growth dashboard (/_seo/). Reads its configuration and the site's page
 * index from JSON embedded by the build, loads GA4 and Search Console data
 * through growth/google.js when the owner signs in (or Search Console CSV
 * files they import), and renders every section with growth/metrics.js.
 *
 * Three states are kept apart everywhere: integration unavailable (not set
 * up), no data (connected, nothing measured), and zero activity (measured: 0).
 */
import * as M from './metrics.js';
import { GoogleData, CUSTOM_DIMENSIONS } from './google.js';
import { parseSearchConsoleCsv, searchConsoleFromFiles, toCsv } from './csv.js';

const $ = (s, r = document) => r.querySelector(s);
const json = (id) => JSON.parse(document.getElementById(id).textContent);
const config = json('growth-config');
const index = json('growth-index');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } } };

const fmt = {
  n: (v) => (v == null ? '—' : Number(v).toLocaleString('en-US')),
  pct: (v) => (v == null ? '—' : `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0)}%`),
  pos: (v) => (v == null ? '—' : v.toFixed(1)),
  delta: (v) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`),
  date: (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
};
const typeLabel = { template: 'Template', guide: 'Guide', tool: 'Tool', hub: 'Hub', landing: 'Landing', page: 'Page', app: 'Generator', other: 'Other' };
const pageLink = (path, name) => (path && path.startsWith('/') && path !== '(not set)' ? `<a class="link" href="..${esc(path)}">${esc(name || path)}</a>` : esc(name || path));

const google = config.ga4PropertyId && config.oauthClientId ? new GoogleData({ clientId: config.oauthClientId, propertyId: config.ga4PropertyId, searchConsoleSite: config.searchConsoleSite }) : null;

const state = {
  preset: store.get('folio:growth:range') || '28',
  custom: { start: '', end: '' },
  range: null,
  ga: { status: google ? 'disconnected' : 'unavailable', data: null, error: '' },
  gsc: { status: google && config.searchConsoleSite ? 'disconnected' : 'unavailable', data: store.get('folio:growth:gsc'), error: '' },
  sort: { landing: ['visitors', 'desc'], templates: ['views', 'desc'], search: ['impressions', 'desc'] },
  derived: {},
};
if (state.gsc.data) state.gsc.status = 'imported';
state.range = M.dateRange(state.preset);

// ---------------------------------------------------------------- loading

async function connect() {
  try {
    await google.signIn();
    await load();
  } catch (e) {
    state.ga.status = 'error';
    state.ga.error = e.message;
    render();
  }
}

async function load() {
  if (!google || !google.signedIn) return render();
  state.ga.status = 'loading';
  if (config.searchConsoleSite && state.gsc.status !== 'imported') state.gsc.status = 'loading';
  render();
  const jobs = [
    google.analytics(state.range).then((d) => { state.ga = { status: 'ready', data: d, error: '' }; }, (e) => { state.ga = { status: 'error', data: null, error: e.message }; }),
  ];
  if (config.searchConsoleSite && state.gsc.status !== 'imported') {
    jobs.push(google.searchConsole(state.range).then((d) => { state.gsc = { status: 'ready', data: d, error: '' }; }, (e) => { state.gsc = { status: 'error', data: null, error: e.message }; }));
  }
  await Promise.all(jobs);
  render();
}

async function importFiles(files) {
  try {
    const parsed = await Promise.all([...files].map(async (f) => parseSearchConsoleCsv(await f.text())));
    const data = searchConsoleFromFiles(parsed);
    store.set('folio:growth:gsc', data);
    state.gsc = { status: 'imported', data, error: '' };
  } catch (e) {
    state.gsc.error = e.message;
  }
  render();
}

// ---------------------------------------------------------------- rendering helpers

const empty = (title, body, kind = 'none') => `<div class="g-empty g-empty--${kind}" data-empty="${kind}"><p class="g-empty__title">${esc(title)}</p>${body ? `<p>${body}</p>` : ''}</div>`;

/** The message a GA-backed section shows when it has nothing real to show. */
function gaEmpty(full = false) {
  const s = state.ga.status;
  if (!full && (s === 'unavailable' || s === 'disconnected')) {
    return `<p class="g-empty g-empty--compact" data-empty="${s}">No data: Google Analytics ${s === 'unavailable' ? 'isn’t set up (see Overview)' : 'isn’t connected'}.</p>`;
  }
  if (s === 'unavailable') return empty('No analytics data yet.', `Connect Google Analytics to begin measuring visitors, generator usage and PDF downloads. ${config.measurementConfigured ? 'The site is already sending events; the dashboard needs a GA4 property ID and an OAuth client ID to read them.' : 'The site isn’t sending analytics yet, so nothing has been measured.'} See <a class="link" href="#g-setup">Setup</a>.`, 'unavailable');
  if (s === 'disconnected') return empty('Not connected.', 'Sign in with Google above to load this section.', 'disconnected');
  if (s === 'loading') return empty('Loading…', '', 'loading');
  if (s === 'error') return empty('Google Analytics could not be read.', esc(state.ga.error), 'error');
  return empty('No analytics data recorded in this period.', 'Nothing was measured between these dates. If the site is live, check that the measurement ID is set and that visits are arriving in GA4’s Realtime report.', 'nodata');
}

function table(id, rows, columns, { sortable = false } = {}) {
  const [key, dir] = state.sort[id] || [];
  const sorted = sortable && key ? M.sortRows(rows, key, dir) : rows;
  const head = columns.map((c) => {
    if (!sortable || !c.sort) return `<th scope="col"${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`;
    const on = key === c.key;
    return `<th scope="col"${c.num ? ' class="num"' : ''} aria-sort="${on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="g-sort" data-sort="${id}:${c.key}">${esc(c.label)}${on ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`;
  }).join('');
  const body = sorted.map((r) => `<tr>${columns.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.html ? c.html(r) : esc(c.fmt ? c.fmt(r[c.key]) : r[c.key])}</td>`).join('')}</tr>`).join('');
  return `<div class="dash__scroll g-table"><table data-table="${id}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const exportButton = (id, label) => `<button type="button" class="link-btn g-export" data-export="${id}">Export ${esc(label)} (CSV)</button>`;

// ---------------------------------------------------------------- sections

function renderOverview(ov) {
  if (!ov) return gaEmpty(true);
  const days = state.range.days;
  return `<div class="g-tiles">${ov.tiles.map((t) => `
    <div class="g-tile" data-tile="${t.key}">
      <p class="label g-tile__label">${esc(t.label)}</p>
      <p class="g-tile__value">${fmt.n(t.value)}</p>
      <p class="g-tile__delta">${t.change != null ? `${fmt.delta(t.change)} <span>vs previous ${days} days (${fmt.n(t.previous)})</span>` : t.previous === 0 && ov.history ? '<span>None in the previous period</span>' : '<span>Not enough historical data.</span>'}</p>
    </div>`).join('')}</div>
    <p class="g-note">Visitors, SEO visitors and generator opens count people; invoices and PDFs count invoices. An invoice counts as created the first time it is edited or exported.</p>`;
}

function renderFunnel(f) {
  if (!f) return gaEmpty();
  const max = f.steps[0].value || 1;
  return `<ol class="g-funnel">${f.steps.map((s, i) => `
    <li class="g-funnel__row${i === f.biggest ? ' g-funnel__row--worst' : ''}" data-step="${s.key}">
      <span class="g-funnel__label">${esc(s.label)}</span>
      <span class="g-funnel__track" title="${esc(s.label)}: ${fmt.n(s.value)} (${fmt.pct(s.ofVisitors)} of visitors)"><span class="g-funnel__bar" style="width:${Math.max(0, Math.min(100, (s.value / max) * 100)).toFixed(1)}%"></span></span>
      <span class="g-funnel__value">${fmt.n(s.value)}</span>
      <span class="g-funnel__rate">${i ? `${fmt.pct(s.ofVisitors)} of visitors` : ''}</span>
      <span class="g-funnel__step">${!i ? '' : s.notNested ? 'More than the step before: includes people who skipped it' : `${fmt.pct(s.fromPrevious)} continue · <strong>${fmt.pct(s.dropOff)} drop off</strong>`}</span>
      ${i === f.biggest ? '<span class="g-funnel__flag">▲ Biggest drop-off</span>' : ''}
    </li>`).join('')}</ol>
    ${f.enough ? '' : `<p class="g-note">The biggest drop-off is named once at least ${M.MIN.funnelVisitors} visitors are measured in the period.</p>`}
    <p class="g-note">People who did each step in the period. ${exportButton('funnel', 'funnel')}</p>`;
}

function renderActions(recs, measured) {
  if (!measured) return gaEmpty();
  if (!recs.length) return empty('Not enough data for recommendations yet.', `Observations appear once pages have enough activity to compare: ${M.MIN.visitors}+ visitors per page, ${M.MIN.impressions}+ search impressions, ${M.MIN.templateViews}+ template views, across at least ${M.MIN.peers} comparable pages. Nothing is guessed before then.`, 'insufficient');
  return `<ol class="g-actions">${recs.map((r) => `
    <li class="g-action" data-kind="${r.kind}">
      <p class="label g-action__kind">${esc(r.kind)}</p>
      <h3 class="g-action__title">${r.path ? pageLink(r.path, r.title) : esc(r.title)}</h3>
      <p>${esc(r.observation)}</p>
      <p class="g-action__do"><span class="label">Potential action</span> ${esc(r.action)}</p>
    </li>`).join('')}</ol>`;
}

function renderOpportunities(o) {
  if (!o) return gaEmpty();
  const group = (key, title, explain) => {
    const items = o[key];
    return `<div class="g-opp" data-opp="${key}"><h3 class="label">${esc(title)}</h3><p class="g-note">${esc(explain)}</p>${items.length
      ? `<ul>${items.slice(0, 8).map((p) => `<li>${pageLink(p.path, p.name)}<br><span class="muted">${esc(p.evidence)}</span><br>→ ${esc(p.action)}</li>`).join('')}</ul>`
      : '<p class="muted">None found in this period.</p>'}</div>`;
  };
  return `<div class="g-opps">
    ${group('lowCtr', 'High impressions, low click-through', 'Seen in search, rarely clicked. Needs Search Console data.')}
    ${group('lowConversion', 'Clicked, but low conversion', 'Visitors arrive but don’t create invoices.')}
    ${group('underexposed', 'High conversion, low traffic', 'Works well for the few who find it.')}
    ${group('winners', 'High traffic, high conversion', 'Worth building around.')}
  </div>${o.notes.length ? `<p class="g-note">${o.notes.map(esc).join(' ')}</p>` : ''}`;
}

const LANDING_COLS = [
  { key: 'name', label: 'Page', sort: true, html: (r) => `${pageLink(r.path, r.name)}<br><span class="muted g-path">${esc(r.path)}</span>` },
  { key: 'type', label: 'Type', sort: true, fmt: (v) => typeLabel[v] || v },
  { key: 'visitors', label: 'Visitors', sort: true, num: true, fmt: fmt.n },
  { key: 'opens', label: 'Generator opens', sort: true, num: true, fmt: fmt.n },
  { key: 'created', label: 'Created an invoice', sort: true, num: true, fmt: fmt.n },
  { key: 'pdfs', label: 'PDFs', sort: true, num: true, fmt: fmt.n },
  { key: 'conversion', label: 'Conversion', sort: true, num: true, fmt: fmt.pct },
];

function renderLanding(rows) {
  if (!rows) return gaEmpty();
  if (!rows.length) return empty('No landing pages recorded in this period.', '', 'nodata');
  return `${table('landing', rows, LANDING_COLS, { sortable: true })}
    <p class="g-note">Attributed to the page each visit started on. Conversion: share of visitors who created an invoice. ${exportButton('landing', 'page performance')}</p>`;
}

const TEMPLATE_COLS = [
  { key: 'name', label: 'Template', sort: true, html: (r) => pageLink(r.path, r.name) },
  { key: 'views', label: 'Views', sort: true, num: true, fmt: fmt.n },
  { key: 'customizations', label: 'Customize clicks', sort: true, num: true, fmt: fmt.n },
  { key: 'opens', label: 'Generator opens', sort: true, num: true, fmt: fmt.n },
  { key: 'created', label: 'Invoices created', sort: true, num: true, fmt: fmt.n },
  { key: 'pdfs', label: 'PDFs', sort: true, num: true, fmt: fmt.n },
  { key: 'viewToOpen', label: 'View → open', sort: true, num: true, fmt: fmt.pct },
  { key: 'openToCreated', label: 'Open → invoice', sort: true, num: true, fmt: fmt.pct },
  { key: 'createdToPdf', label: 'Invoice → PDF', sort: true, num: true, fmt: fmt.pct },
];

function renderTemplates(rows) {
  const ga = state.ga.data;
  if (!ga) return gaEmpty();
  if (!rows) return empty('Template data needs one setting in GA4.', 'Register <code>template</code> as an event-scoped custom dimension (GA4 → Admin → Custom definitions). Data is collected already; it becomes reportable from the day the dimension is registered.', 'unavailable');
  if (!rows.length) return empty('No template activity recorded in this period.', '', 'nodata');
  const quiet = index.filter((p) => p.type === 'template').length - rows.filter((r) => r.path).length;
  return `${table('templates', rows, TEMPLATE_COLS, { sortable: true })}
    <p class="g-note">Counts of events carrying each template. Generator opens, invoices and PDFs include people who chose the template in the generator itself. ${quiet > 0 ? `${quiet} template pages had no recorded activity.` : ''} ${exportButton('templates', 'template performance')}</p>`;
}

function renderContent(groups) {
  if (!groups) return gaEmpty();
  if (!groups.length) return empty('No landing pages recorded in this period.', '', 'nodata');
  return table('content', groups, [
    { key: 'label', label: 'Content' }, { key: 'pages', label: 'Pages with visits', num: true, fmt: fmt.n },
    { key: 'visitors', label: 'Visitors', num: true, fmt: fmt.n }, { key: 'opens', label: 'Generator opens', num: true, fmt: fmt.n },
    { key: 'created', label: 'Created an invoice', num: true, fmt: fmt.n }, { key: 'pdfs', label: 'PDFs', num: true, fmt: fmt.n },
    { key: 'conversion', label: 'Conversion', num: true, fmt: fmt.pct },
  ]) + '<p class="g-note">By the kind of page each visit started on.</p>';
}

function renderSources(src) {
  if (!src) return gaEmpty();
  if (!src.total) return empty('No visits recorded in this period.', '', 'nodata');
  return `<ol class="g-sources">${src.buckets.map((b) => `
    <li data-bucket="${esc(b.name)}"><span class="g-sources__name">${esc(b.name)}</span>
      <span class="g-funnel__track" title="${esc(b.name)}: ${fmt.n(b.users)} visitors"><span class="g-funnel__bar" style="width:${((b.share || 0) * 100).toFixed(1)}%"></span></span>
      <span class="g-funnel__value">${fmt.n(b.users)}</span><span class="g-funnel__rate">${fmt.pct(b.share)} of visitors</span>
      <span class="g-funnel__step">${b.users ? `${fmt.pct(b.conversion)} created an invoice` : ''}${b.channels.length ? ` · GA4: ${esc(b.channels.join(', '))}` : ''}</span></li>`).join('')}</ol>
    <h3 class="label g-sub">Sources</h3>
    ${src.sources.length ? table('sources', src.sources.slice(0, 25), [
      { key: 'label', label: 'Source / medium' }, { key: 'users', label: 'Visitors', num: true, fmt: fmt.n }, { key: 'sessions', label: 'Visits', num: true, fmt: fmt.n },
    ]) : '<p class="muted">No sources recorded.</p>'}
    <p class="g-note">As GA4 attributes each visit. Visits with no referrer or campaign tag appear as direct.</p>`;
}

const SEARCH_COLS = [
  { key: 'name', label: 'Page', sort: true, html: (r) => `${pageLink(r.path, r.name)}<br><span class="muted g-path">${esc(r.path)}</span>` },
  { key: 'impressions', label: 'Impressions', sort: true, num: true, fmt: fmt.n },
  { key: 'clicks', label: 'Clicks', sort: true, num: true, fmt: fmt.n },
  { key: 'ctr', label: 'CTR', sort: true, num: true, fmt: fmt.pct },
  { key: 'position', label: 'Avg. position', sort: true, num: true, fmt: fmt.pos },
  { key: 'visitors', label: 'Visitors (GA4)', sort: true, num: true, fmt: fmt.n },
  { key: 'conversion', label: 'Conversion', sort: true, num: true, fmt: fmt.pct },
];

function renderSearch(pages) {
  const g = state.gsc;
  const intro = g.status === 'imported'
    ? `<p class="g-note">Imported from a Search Console export on ${esc(new Date(g.data.importedAt).toLocaleDateString('en-US'))}. It covers the dates chosen in Search Console when it was exported, not the range above. <button type="button" class="link-btn" data-action="clear-gsc">Remove imported data</button></p>`
    : g.status === 'ready' ? `<p class="g-note">From the Search Console API, ${fmt.date(g.data.range.start)} – ${fmt.date(g.data.range.end)}. The latest two or three days are usually incomplete.</p>` : '';
  if (!g.data) {
    const why = g.status === 'unavailable'
      ? 'Search Console isn’t connected. Import a Performance export below, or set <code>SEARCH_CONSOLE_SITE</code> to read it directly (see Setup).'
      : g.status === 'error' ? esc(g.error) : g.status === 'loading' ? 'Loading…' : 'Sign in with Google above, or import a Performance export below.';
    return empty('No Search Console data.', why, g.status === 'error' ? 'error' : g.status === 'unavailable' ? 'unavailable' : 'disconnected');
  }
  const queries = g.data.queries || [];
  return `${intro}${pages && pages.length ? table('search', pages, SEARCH_COLS, { sortable: true }) : '<p class="muted">No page rows in this data.</p>'}
    ${pages && pages.length ? `<p class="g-note">${exportButton('search', 'search pages')}</p>` : ''}
    <h3 class="label g-sub">Top queries</h3>
    ${queries.length ? table('queries', queries.slice(0, 50), [
      { key: 'query', label: 'Query' }, { key: 'impressions', label: 'Impressions', num: true, fmt: fmt.n }, { key: 'clicks', label: 'Clicks', num: true, fmt: fmt.n },
      { key: 'ctr', label: 'CTR', num: true, fmt: fmt.pct }, { key: 'position', label: 'Avg. position', num: true, fmt: fmt.pos },
    ]) : '<p class="muted">No query rows in this data.</p>'}`;
}

function renderSetup() {
  const ga = state.ga.data;
  const row = (ok, label, detail) => `<li class="g-check g-check--${ok ? 'ok' : 'todo'}"><span class="g-check__mark">${ok ? '✓ Done' : '○ To do'}</span> <strong>${label}</strong> ${detail}</li>`;
  const missing = ga ? ga.missing : null;
  return `<ol class="g-checks">
    ${row(config.measurementConfigured, 'The site sends analytics', config.measurementConfigured ? 'GA4 measurement ID is set; events are sent to GA4.' : 'Set <code>PUBLIC_GA_MEASUREMENT_ID</code> (or <code>analytics.ga4MeasurementId</code> in <code>src/site.json</code>) and rebuild. Until then nothing is sent and the site behaves exactly as before.')}
    ${row(Boolean(config.ga4PropertyId && config.oauthClientId), 'The dashboard can read GA4', config.ga4PropertyId && config.oauthClientId ? `Property ${esc(config.ga4PropertyId)}.` : 'Set <code>GA4_PROPERTY_ID</code> (the numeric property ID) and <code>GOOGLE_OAUTH_CLIENT_ID</code> (a Web OAuth client with this page’s origin as an authorised JavaScript origin), then rebuild.')}
    ${row(missing ? !missing.length : false, 'Custom dimensions are registered', missing ? (missing.length ? `Register these event-scoped custom dimensions in GA4 → Admin → Custom definitions: ${missing.map((m) => `<code>${esc(m)}</code>`).join(', ')}.` : 'All registered.') : `Register event-scoped custom dimensions: ${CUSTOM_DIMENSIONS.map((c) => `<code>${c.name}</code> (${esc(c.needed)})`).join(', ')}. Checked automatically once connected.`)}
    ${row(Boolean(config.searchConsoleSite), 'Search Console', config.searchConsoleSite ? `Reads <code>${esc(config.searchConsoleSite)}</code>.` : 'Optional: set <code>SEARCH_CONSOLE_SITE</code> (e.g. <code>sc-domain:example.com</code>) to read it directly, or import CSV exports.')}
  </ol>`;
}

// ---------------------------------------------------------------- page

function controls() {
  const ga = state.ga.status;
  const conn = !google
    ? '<span class="g-status" data-status="unavailable">Google Analytics: not set up</span>'
    : ga === 'loading' ? '<span class="g-status" data-status="loading">Loading…</span>'
      : google.signedIn ? '<span class="g-status" data-status="connected">Connected to Google</span> <button type="button" class="link-btn" data-action="signout">Sign out</button>'
        : '<button type="button" class="btn btn--sm" data-action="connect">Sign in with Google</button> <span class="g-status" data-status="disconnected">Read-only; the token stays in this tab.</span>';
  return conn;
}

function render() {
  const ga = state.ga.status === 'ready' ? state.ga.data : null;
  const gsc = state.gsc.data;
  const live = ga && M.hasData(ga) ? ga : null;
  const d = (state.derived = {});
  d.overview = live && M.overview(live);
  d.funnel = live && M.funnel(live);
  d.landing = live && M.landingPages(live, index);
  d.templates = live && M.templatePerformance(live, index);
  d.content = live && M.contentByType(d.landing);
  d.sources = live && M.trafficSources(live);
  d.search = gsc && M.searchPages(gsc, d.landing, index);
  d.opps = (live || gsc) ? M.opportunities(d.search, d.landing) : null;
  d.recs = M.recommendations({ funnel: d.funnel, templates: d.templates, landing: d.landing, opportunities: d.opps, sources: d.sources });

  $('[data-g="connect"]').innerHTML = controls();
  $('[data-g="period"]').textContent = `${fmt.date(state.range.start)} – ${fmt.date(state.range.end)} (${state.range.days} days), compared with ${fmt.date(state.range.previous.start)} – ${fmt.date(state.range.previous.end)}.`;
  document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === state.preset)));
  $('[data-g="custom"]').hidden = state.preset !== 'custom';
  $('[data-g="gsc-error"]').textContent = state.gsc.status !== 'error' ? state.gsc.error : '';
  const sections = {
    overview: renderOverview(d.overview), funnel: renderFunnel(d.funnel), actions: renderActions(d.recs, Boolean(live || gsc)), opportunities: renderOpportunities(d.opps),
    landing: renderLanding(d.landing), templates: renderTemplates(d.templates), content: renderContent(d.content), sources: renderSources(d.sources),
    search: renderSearch(d.search), setup: renderSetup(),
  };
  for (const [k, html] of Object.entries(sections)) $(`[data-g="${k}"]`).innerHTML = html;
  document.documentElement.dataset.growth = state.ga.status;
}

// ---------------------------------------------------------------- export

const EXPORTS = {
  funnel: () => [state.derived.funnel.steps, [
    { key: 'label', label: 'Step' }, { key: 'value', label: 'People' }, { key: 'ofVisitors', label: 'Share of visitors' },
    { key: 'fromPrevious', label: 'Continue from previous step' }, { key: 'dropOff', label: 'Drop-off' },
  ]],
  landing: () => [M.sortRows(state.derived.landing, ...state.sort.landing), [
    { key: 'path', label: 'URL' }, { key: 'type', label: 'Page type' }, { key: 'name', label: 'Page' }, { key: 'visitors', label: 'Visitors' },
    { key: 'opens', label: 'Generator opens' }, { key: 'created', label: 'Visitors who created an invoice' }, { key: 'invoices', label: 'Invoices created' },
    { key: 'pdfs', label: 'PDF downloads' }, { key: 'conversion', label: 'Conversion rate' },
  ]],
  templates: () => [M.sortRows(state.derived.templates, ...state.sort.templates), [
    { key: 'template', label: 'Template' }, { key: 'views', label: 'Views' }, { key: 'customizations', label: 'Customize clicks' },
    { key: 'opens', label: 'Generator opens' }, { key: 'created', label: 'Invoices created' }, { key: 'pdfs', label: 'PDF downloads' },
    { key: 'viewToOpen', label: 'View to open' }, { key: 'openToCreated', label: 'Open to invoice' }, { key: 'createdToPdf', label: 'Invoice to PDF' },
  ]],
  search: () => [M.sortRows(state.derived.search, ...state.sort.search), [
    { key: 'path', label: 'URL' }, { key: 'impressions', label: 'Impressions' }, { key: 'clicks', label: 'Clicks' }, { key: 'ctr', label: 'CTR' },
    { key: 'position', label: 'Average position' }, { key: 'visitors', label: 'Visitors (GA4)' }, { key: 'conversion', label: 'Conversion rate' },
  ]],
};

function download(id) {
  const [rows, cols] = EXPORTS[id]();
  const blob = new Blob([toCsv(rows, cols)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `folio-${id}-${state.range.start}_${state.range.end}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- events

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.range) {
    state.preset = t.dataset.range;
    store.set('folio:growth:range', state.preset === 'custom' ? '28' : state.preset);
    if (state.preset !== 'custom') { state.range = M.dateRange(state.preset); load(); }
    else render();
  } else if (t.dataset.action === 'apply-custom') {
    state.custom = { start: $('[name="g-start"]').value, end: $('[name="g-end"]').value };
    state.range = M.dateRange('custom', new Date(), state.custom);
    load();
  } else if (t.dataset.action === 'connect') connect();
  else if (t.dataset.action === 'signout') { google.signOut(); state.ga = { status: 'disconnected', data: null, error: '' }; if (state.gsc.status !== 'imported') state.gsc = { status: config.searchConsoleSite ? 'disconnected' : 'unavailable', data: null, error: '' }; render(); }
  else if (t.dataset.action === 'clear-gsc') { store.set('folio:growth:gsc', null); state.gsc = { status: google && config.searchConsoleSite ? 'disconnected' : 'unavailable', data: null, error: '' }; load(); }
  else if (t.dataset.sort) {
    const [id, key] = t.dataset.sort.split(':');
    const [k, dir] = state.sort[id] || [];
    state.sort[id] = [key, k === key && dir === 'desc' ? 'asc' : k === key ? 'desc' : key === 'name' || key === 'type' ? 'asc' : 'desc'];
    render();
  } else if (t.dataset.export) download(t.dataset.export);
});
$('[data-g="import"]').addEventListener('change', (e) => { if (e.target.files.length) importFiles(e.target.files); e.target.value = ''; });

render();
window.folioGrowth = { state, render, metrics: M };

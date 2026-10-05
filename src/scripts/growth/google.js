/**
 * Google Analytics 4 and Search Console, read from the dashboard in the
 * owner's browser. No backend and no stored credentials:
 *
 * - The owner signs in with Google's own popup (Google Identity Services).
 *   The page receives a short-lived, read-only access token, kept in memory
 *   only and gone when the tab closes.
 * - Reports come straight from the GA4 Data API and the Search Console API,
 *   which accept browser requests made with that token.
 *
 * Request builders and response normalizers are pure and exported for tests;
 * only `GoogleData` touches the network.
 */

export const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/webmasters.readonly'];
const GA_API = 'https://analyticsdata.googleapis.com/v1beta';
const GSC_API = 'https://www.googleapis.com/webmasters/v3';
const GIS = 'https://accounts.google.com/gsi/client';

/** Every event the dashboard reads (see core/track.js). */
export const EVENT_NAMES = [
  'seo_page_view', 'template_view', 'guide_view', 'tool_view', 'template_selected', 'generator_cta_clicked', 'tool_used',
  'invoice_generator_opened', 'invoice_started', 'invoice_created', 'pdf_downloaded', 'print_clicked',
];
const OUTCOMES = ['invoice_generator_opened', 'invoice_created', 'pdf_downloaded'];

/** Event parameters that must be registered as event-scoped custom dimensions in GA4. */
export const CUSTOM_DIMENSIONS = [
  { name: 'template', needed: 'Top templates and template performance' },
  { name: 'page_type', needed: 'Breaking events down by kind of page in GA4 reports' },
  { name: 'cta', needed: 'Which calls to action are clicked' },
  { name: 'via', needed: 'How people reach the generator' },
];

const inList = (values) => ({ filter: { fieldName: 'eventName', inListFilter: { values } } });

/** The GA4 Data API requests behind the dashboard (two batchRunReports calls of ≤ 5). */
export function ga4Requests(range, { withTemplates = true } = {}) {
  const both = [
    { startDate: range.start, endDate: range.end, name: 'current' },
    { startDate: range.previous.start, endDate: range.previous.end, name: 'previous' },
  ];
  const cur = [both[0]];
  const m = (...names) => names.map((name) => ({ name }));
  const d = (...names) => names.map((name) => ({ name }));
  const first = [
    { dateRanges: both, metrics: m('totalUsers', 'sessions') },
    { dateRanges: both, dimensions: d('eventName'), metrics: m('totalUsers', 'eventCount'), dimensionFilter: inList(EVENT_NAMES) },
    { dateRanges: cur, dimensions: d('landingPage'), metrics: m('totalUsers', 'sessions'), limit: 1000, orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }] },
    { dateRanges: cur, dimensions: d('landingPage', 'eventName'), metrics: m('totalUsers', 'eventCount'), dimensionFilter: inList(OUTCOMES), limit: 10000 },
    { dateRanges: cur, dimensions: d('sessionDefaultChannelGroup'), metrics: m('totalUsers', 'sessions') },
  ];
  const second = [
    { dateRanges: cur, dimensions: d('sessionDefaultChannelGroup', 'eventName'), metrics: m('totalUsers', 'eventCount'), dimensionFilter: inList(OUTCOMES) },
    { dateRanges: cur, dimensions: d('sessionSource', 'sessionMedium'), metrics: m('totalUsers', 'sessions'), limit: 50, orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }] },
  ];
  if (withTemplates) {
    second.push({ dateRanges: cur, dimensions: d('customEvent:template', 'eventName'), metrics: m('totalUsers', 'eventCount'), dimensionFilter: inList(EVENT_NAMES), limit: 10000 });
  }
  return [first, second];
}

/** A GA4 report → plain rows: { [dimension]: string, [metric]: number }. */
export function rowsOf(report) {
  const dims = (report.dimensionHeaders || []).map((h) => h.name);
  const mets = (report.metricHeaders || []).map((h) => h.name);
  return (report.rows || []).map((r) => {
    const o = {};
    dims.forEach((n, i) => (o[n] = r.dimensionValues[i].value));
    mets.forEach((n, i) => (o[n] = Number(r.metricValues[i].value) || 0));
    return o;
  });
}

const addEvent = (events, name, row) => {
  const e = (events[name] = events[name] || { users: 0, count: 0 });
  e.users += row.totalUsers || 0;
  e.count += row.eventCount || 0;
};
const rangeOf = (row) => row.dateRange || 'current';

/** Both batch responses → the `ga` structure growth/metrics.js reads. */
export function normalizeGa4(batches, { missing = [] } = {}) {
  const reports = batches.flatMap((b) => b.reports || []);
  const [totals, events, landing, landingEvents, channels, channelEvents, sources, templates] = reports.map(rowsOf);
  const out = {
    totals: { current: { users: 0, sessions: 0 }, previous: { users: 0, sessions: 0 } },
    events: { current: {}, previous: {} },
    landing: [], channels: [], sources: [], templates: templates ? [] : null, missing,
  };
  for (const r of totals || []) out.totals[rangeOf(r)] = { users: r.totalUsers, sessions: r.sessions };
  for (const r of events || []) addEvent(out.events[rangeOf(r)], r.eventName, r);

  const pages = new Map();
  for (const r of landing || []) pages.set(r.landingPage, { path: r.landingPage, users: r.totalUsers, sessions: r.sessions, events: {} });
  for (const r of landingEvents || []) {
    if (!pages.has(r.landingPage)) pages.set(r.landingPage, { path: r.landingPage, users: 0, sessions: 0, events: {} });
    addEvent(pages.get(r.landingPage).events, r.eventName, r);
  }
  out.landing = [...pages.values()];

  const ch = new Map();
  for (const r of channels || []) ch.set(r.sessionDefaultChannelGroup, { channel: r.sessionDefaultChannelGroup, users: r.totalUsers, sessions: r.sessions, events: {} });
  for (const r of channelEvents || []) {
    if (!ch.has(r.sessionDefaultChannelGroup)) ch.set(r.sessionDefaultChannelGroup, { channel: r.sessionDefaultChannelGroup, users: 0, sessions: 0, events: {} });
    addEvent(ch.get(r.sessionDefaultChannelGroup).events, r.eventName, r);
  }
  out.channels = [...ch.values()];
  out.sources = (sources || []).map((r) => ({ source: r.sessionSource, medium: r.sessionMedium, users: r.totalUsers, sessions: r.sessions }));

  if (templates) {
    const t = new Map();
    for (const r of templates) {
      const key = r['customEvent:template'];
      if (!t.has(key)) t.set(key, { template: key, events: {} });
      addEvent(t.get(key).events, r.eventName, r);
    }
    out.templates = [...t.values()];
  }
  return out;
}

/** Which of the custom dimensions exist on the property (from the metadata endpoint). */
export function missingDimensions(metadata) {
  const have = new Set((metadata.dimensions || []).map((d) => d.apiName));
  return CUSTOM_DIMENSIONS.filter((c) => !have.has(`customEvent:${c.name}`)).map((c) => c.name);
}

// ---------------------------------------------------------------- Search Console

export const gscRequests = (range) => [
  { startDate: range.start, endDate: range.end, dimensions: ['page'], rowLimit: 1000 },
  { startDate: range.start, endDate: range.end, dimensions: ['query'], rowLimit: 250 },
];

export function normalizeGsc([pages, queries], range) {
  const row = (k) => (r) => ({ [k]: r.keys[0], clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: r.ctr || 0, position: r.position || 0 });
  return {
    origin: 'api',
    range: { start: range.start, end: range.end },
    pages: (pages.rows || []).map(row('path')),
    queries: (queries.rows || []).map(row('query')),
  };
}

// ---------------------------------------------------------------- network

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class GoogleData {
  constructor({ clientId, propertyId, searchConsoleSite, fetchImpl }) {
    this.clientId = clientId;
    this.propertyId = propertyId;
    this.site = searchConsoleSite;
    this.fetch = fetchImpl || window.fetch.bind(window);
    this.token = null;
  }

  get signedIn() { return Boolean(this.token && this.token.expires > Date.now()); }

  /** Load Google Identity Services and ask for a read-only token in Google's own popup. */
  async signIn() {
    if (!window.google?.accounts?.oauth2) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = GIS;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Google sign-in could not be loaded. Check your connection or content blockers.'));
        document.head.appendChild(s);
      });
    }
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPES.join(' '),
        callback: (r) => {
          if (r.error) return reject(new Error(r.error_description || r.error));
          this.token = { value: r.access_token, expires: Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60000 };
          resolve();
        },
        error_callback: (e) => reject(new Error(e && e.message ? e.message : 'Sign-in was cancelled.')),
      });
      client.requestAccessToken();
    });
  }

  signOut() {
    if (this.token && window.google?.accounts?.oauth2?.revoke) window.google.accounts.oauth2.revoke(this.token.value, () => {});
    this.token = null;
  }

  async call(url, body) {
    const res = await this.fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${this.token.value}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error?.message || `HTTP ${res.status}`);
    return data;
  }

  async analytics(range) {
    const p = `${GA_API}/properties/${encodeURIComponent(this.propertyId)}`;
    const missing = missingDimensions(await this.call(`${p}/metadata`));
    const [a, b] = ga4Requests(range, { withTemplates: !missing.includes('template') });
    const batches = await Promise.all([a, b].map((requests) => this.call(`${p}:batchRunReports`, { requests })));
    return normalizeGa4(batches, { missing });
  }

  async searchConsole(range) {
    const url = `${GSC_API}/sites/${encodeURIComponent(this.site)}/searchAnalytics/query`;
    const [pages, queries] = await Promise.all(gscRequests(range).map((body) => this.call(url, body)));
    return normalizeGsc([pages, queries], range);
  }
}

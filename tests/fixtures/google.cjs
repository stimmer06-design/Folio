/**
 * A stand-in for Google's APIs, for the dashboard tests: Google Identity
 * Services, the GA4 Data API and the Search Console API, answering from a
 * small, fixed dataset. Invented numbers for tests only — never shown on the
 * real dashboard, which reads only real accounts.
 */
const DATA = {
  totals: { current: { totalUsers: 1284, sessions: 1610 }, previous: { totalUsers: 1088, sessions: 1350 } },
  events: {
    current: {
      seo_page_view: [820, 2100], template_view: [520, 1300], template_selected: [260, 410], guide_view: [300, 700], tool_view: [90, 150],
      tool_used: [60, 80], generator_cta_clicked: [340, 520], invoice_generator_opened: [380, 610], invoice_started: [300, 450],
      invoice_created: [190, 240], pdf_downloaded: [150, 198], print_clicked: [20, 25],
    },
    previous: {
      seo_page_view: [690, 1800], invoice_generator_opened: [320, 500], invoice_created: [150, 189], pdf_downloaded: [121, 162],
    },
  },
  // landing page: [users, sessions, opens, created, pdfs]
  landing: {
    '/': [300, 380, 110, 60, 50],
    '/invoice-templates/contractor/': [240, 290, 70, 30, 24],
    '/invoice-guides/how-to-create-an-invoice-pdf/': [210, 240, 12, 6, 5],
    '/app/': [130, 170, 130, 60, 52],
    '/invoice-guides/how-to-make-an-invoice/': [120, 140, 30, 15, 12],
    '/invoice-templates/plumber/': [90, 110, 30, 14, 10],
    '/invoice-templates/freelancer/': [84, 100, 30, 16, 13],
    '/invoice-templates/photographer/': [60, 70, 40, 26, 22],
    '/tools/invoice-number-generator/': [50, 60, 20, 8, 6],
  },
  // template: [views, customize, opens, created, pdfs]
  templates: {
    contractor: [421, 173, 120, 96, 82], freelancer: [150, 70, 55, 30, 25], plumber: [160, 30, 22, 14, 10],
    photographer: [90, 60, 50, 38, 35], 'cleaning-service': [40, 10, 8, 2, 2], '(not set)': [0, 0, 40, 30, 20],
  },
  channels: { 'Organic Search': [760, 950, 230, 120], Direct: [300, 380, 110, 50], 'Organic Social': [110, 140, 25, 10], Referral: [90, 110, 12, 8], Unassigned: [24, 30, 3, 2] },
  sources: [['google', 'organic', 700, 880], ['(direct)', '(none)', 300, 380], ['reddit.com', 'referral', 82, 100], ['bing', 'organic', 60, 70], ['tiktok.com', 'referral', 41, 50], ['youtube.com', 'referral', 18, 22]],
  gscPages: [
    ['https://folioinvoice.com/invoice-templates/contractor/', 240, 12000, 6.2], ['https://folioinvoice.com/invoice-guides/how-to-create-an-invoice-pdf/', 200, 9000, 5.0],
    ['https://folioinvoice.com/invoice-guides/how-to-make-an-invoice/', 140, 6000, 4.2], ['https://folioinvoice.com/invoice-templates/plumber/', 30, 5000, 7.5],
    ['https://folioinvoice.com/invoice-templates/freelancer/', 90, 4000, 9.0], ['https://folioinvoice.com/', 260, 3000, 2.1],
    ['https://folioinvoice.com/tools/invoice-number-generator/', 45, 1500, 12.0], ['https://folioinvoice.com/invoice-templates/photographer/', 50, 800, 8.0],
  ],
  gscQueries: [['contractor invoice template', 120, 5200, 5.8], ['invoice pdf', 90, 4100, 6.4], ['free invoice generator', 160, 2500, 3.2], ['plumber invoice', 12, 2600, 7.9]],
};

const dv = (v) => ({ value: String(v) });
const mv = (v) => ({ value: String(v) });

function report(req) {
  const dims = (req.dimensions || []).map((d) => d.name);
  const mets = req.metrics.map((m) => m.name);
  const ranges = req.dateRanges.map((r) => r.name || 'date_range_0');
  const multi = ranges.length > 1;
  const headers = { dimensionHeaders: [...dims, ...(multi ? ['dateRange'] : [])].map((name) => ({ name })), metricHeaders: mets.map((name) => ({ name })) };
  const allowed = req.dimensionFilter ? req.dimensionFilter.filter.inListFilter.values : null;
  const rows = [];
  const push = (dvals, mvals, range) => rows.push({ dimensionValues: [...dvals.map(dv), ...(multi ? [dv(range)] : [])], metricValues: mets.map((m) => mv(mvals[m] || 0)) });
  const key = dims.join('|');
  for (const range of ranges) {
    if (!dims.length) push([], DATA.totals[range], range);
    else if (key === 'eventName') {
      for (const [n, [u, c]] of Object.entries(DATA.events[range] || {})) if (!allowed || allowed.includes(n)) push([n], { totalUsers: u, eventCount: c }, range);
    } else if (key === 'landingPage') {
      for (const [p, [u, s]] of Object.entries(DATA.landing)) push([p], { totalUsers: u, sessions: s }, range);
    } else if (key === 'landingPage|eventName') {
      for (const [p, [, , o, c, pdf]] of Object.entries(DATA.landing)) {
        for (const [n, v] of [['invoice_generator_opened', o], ['invoice_created', c], ['pdf_downloaded', pdf]]) if (allowed.includes(n)) push([p, n], { totalUsers: v, eventCount: Math.round(v * 1.3) }, range);
      }
    } else if (key === 'sessionDefaultChannelGroup') {
      for (const [ch, [u, s]] of Object.entries(DATA.channels)) push([ch], { totalUsers: u, sessions: s }, range);
    } else if (key === 'sessionDefaultChannelGroup|eventName') {
      for (const [ch, [, , o, c]] of Object.entries(DATA.channels)) { push([ch, 'invoice_generator_opened'], { totalUsers: o, eventCount: o }, range); push([ch, 'invoice_created'], { totalUsers: c, eventCount: c }, range); }
    } else if (key === 'sessionSource|sessionMedium') {
      for (const [src, med, u, s] of DATA.sources) push([src, med], { totalUsers: u, sessions: s }, range);
    } else if (key === 'customEvent:template|eventName') {
      for (const [t, vals] of Object.entries(DATA.templates)) {
        ['template_view', 'template_selected', 'invoice_generator_opened', 'invoice_created', 'pdf_downloaded'].forEach((n, i) => vals[i] && push([t, n], { totalUsers: vals[i], eventCount: vals[i] }, range));
      }
    } else throw new Error('Unexpected report: ' + key);
  }
  return { ...headers, rows, rowCount: rows.length };
}

const GIS_STUB = `window.google = { accounts: { oauth2: {
  initTokenClient: (o) => ({ requestAccessToken: () => setTimeout(() => o.callback({ access_token: 'test-token', expires_in: 3600 }), 10) }),
  revoke: (t, cb) => cb && cb(),
} } };`;

/**
 * Route Google through the stand-in. `seen` collects request bodies.
 *   options.empty    GA4 answers with no rows at all (a property with no data yet)
 *   options.missing  custom dimensions to leave unregistered
 */
async function mockGoogle(page, seen = [], { empty = false, missing = ['via'] } = {}) {
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS_STUB }));
  await page.route('https://analyticsdata.googleapis.com/**', async (r) => {
    const req = r.request();
    if (req.headers().authorization !== 'Bearer test-token') return r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'unauthenticated' } }) });
    if (req.url().endsWith('/metadata')) {
      const custom = ['template', 'page_type', 'cta', 'via'].filter((d) => !missing.includes(d)).map((d) => ({ apiName: `customEvent:${d}` }));
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ dimensions: [{ apiName: 'eventName' }, ...custom] }) });
    }
    const body = JSON.parse(req.postData());
    seen.push(body);
    const reports = body.requests.map((q) => (empty ? { dimensionHeaders: (q.dimensions || []).map((d) => ({ name: d.name })), metricHeaders: q.metrics.map((m) => ({ name: m.name })), rowCount: 0 } : report(q)));
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ reports }) });
  });
  await page.route('https://www.googleapis.com/webmasters/**', async (r) => {
    const body = JSON.parse(r.request().postData());
    seen.push({ gsc: body });
    const rows = empty ? [] : (body.dimensions[0] === 'page' ? DATA.gscPages : DATA.gscQueries).map(([k, clicks, impressions, position]) => ({ keys: [k], clicks, impressions, ctr: clicks / impressions, position }));
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows }) });
  });
}

/** Serve the dashboard with a configuration, as a build with these settings would. */
async function configureDashboard(page, config) {
  await page.route('**/_seo/', async (r) => {
    const res = await r.fetch();
    const html = (await res.text()).replace(/<script type="application\/json" id="growth-config">[^<]*<\/script>/, `<script type="application/json" id="growth-config">${JSON.stringify(config)}</script>`);
    return r.fulfill({ response: res, body: html });
  });
}

module.exports = { mockGoogle, configureDashboard, report, DATA };

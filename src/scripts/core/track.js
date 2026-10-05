/**
 * Analytics — the one place product events are recorded.
 *
 *   track('invoice_created', { template: 'plumber', start: 'example' })
 *
 * Every call is checked against an allow-list, given privacy-safe context (the
 * page, the kind of page, the device class and where the visit came from), kept
 * in memory (window.folioEvents) and announced as a `folio:track` DOM event.
 *
 * Providers listen for that event and nothing else, so no analytics vendor is
 * called from product code. core/analytics.js connects Google Analytics 4 this
 * way when a measurement ID is configured; Plausible, PostHog or a server
 * endpoint would be one more listener.
 *
 * What is never recorded: anything typed into an invoice (names, addresses,
 * emails, items, amounts, notes, payment details), payment links or amounts,
 * fonts, query strings, full referrer URLs, or an identifier for the visitor. Only allow-listed property
 * names survive, and only short slug-like values.
 *
 * Shipped twice from this one file: imported by the app and tools, and bundled
 * into site.js for the marketing pages (build.mjs strips the `export`s), so it
 * must not import anything.
 */

/** The event dictionary. Adding an event means adding its name here. */
export const EVENTS = [
  // marketing pages
  'seo_page_view', 'template_view', 'guide_view', 'tool_view',
  'template_selected', 'generator_cta_clicked', 'tool_used',
  // the generator
  'invoice_generator_opened', 'invoice_started', 'invoice_created', 'pdf_downloaded', 'print_clicked',
  // payment links (reported from the user's own generator; the client who pays is never tracked)
  'payment_link_created', 'payment_link_clicked', 'invoice_payment_completed',
];

/** Property names that may be sent, and nothing else. */
export const PROPS = [
  'page_path', 'page_type', 'content_slug', // where it happened
  'template', 'layout', 'tool', 'cta', 'via', 'start', 'from_page', 'provider', // what happened
  'source', 'medium', 'campaign', 'landing_page', 'referrer_host', // where the visit came from
  'device_type',
];

const SAFE = /^[a-z0-9/][a-z0-9\-/_.]{0,99}$/i;
const VISIT_KEY = 'folio:visit';

const SEARCH_ENGINES = [
  [/(^|\.)google\.[a-z.]+$/, 'google'], [/(^|\.)bing\.com$/, 'bing'], [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)search\.yahoo\.[a-z.]+$/, 'yahoo'], [/(^|\.)ecosia\.org$/, 'ecosia'], [/(^|\.)search\.brave\.com$/, 'brave'],
  [/(^|\.)startpage\.com$/, 'startpage'], [/(^|\.)qwant\.com$/, 'qwant'], [/(^|\.)baidu\.com$/, 'baidu'],
  [/(^|\.)yandex\.[a-z.]+$/, 'yandex'], [/(^|\.)naver\.com$/, 'naver'], [/(^|\.)perplexity\.ai$/, 'perplexity'],
];
const SOCIAL = [
  [/(^|\.)reddit\.com$/, 'reddit'], [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'twitter'], [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin'], [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'], [/(^|\.)pinterest\.[a-z.]+$/, 'pinterest'], [/(^|\.)threads\.net$/, 'threads'],
  [/(^|\.)bsky\.app$/, 'bluesky'], [/(^|\.)news\.ycombinator\.com$/, 'hackernews'], [/(^|\.)quora\.com$/, 'quora'],
];

/** Lower-case, slug-like, at most 100 characters: safe to send, readable in a report. */
export const slugValue = (v) => String(v).toLowerCase().trim().replace(/[^a-z0-9\-/_.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);

/**
 * Where a visit came from, from what the browser actually provides.
 * Returns null for a click from another page of this site (the visit goes on).
 *   ?utm_source=reddit&utm_medium=social   → reddit / social (campaign tags win)
 *   ?gclid=…                                → google / cpc
 *   referrer www.google.com                 → google / organic
 *   referrer old.reddit.com                 → reddit / social
 *   referrer example.com                    → example.com / referral
 *   no referrer                             → direct / none
 */
export function classifyVisit({ search = '', referrer = '', host = '' } = {}) {
  const q = new URLSearchParams(search);
  let refHost = '';
  try { refHost = referrer ? new URL(referrer).hostname.replace(/^www\./, '') : ''; } catch { refHost = ''; }
  const internal = refHost && refHost === String(host).replace(/^www\./, '');
  if (q.get('utm_source')) {
    return {
      source: slugValue(q.get('utm_source')) || 'not-set',
      medium: slugValue(q.get('utm_medium') || '') || 'not-set',
      campaign: slugValue(q.get('utm_campaign') || '') || undefined,
      referrer_host: internal ? undefined : refHost || undefined,
    };
  }
  if (q.get('gclid')) return { source: 'google', medium: 'cpc', referrer_host: refHost || undefined };
  if (internal) return null;
  if (!refHost) return { source: 'direct', medium: 'none' };
  const engine = SEARCH_ENGINES.find(([re]) => re.test(refHost));
  if (engine) return { source: engine[1], medium: 'organic', referrer_host: refHost };
  const social = SOCIAL.find(([re]) => re.test(refHost));
  if (social) return { source: social[1], medium: 'social', referrer_host: refHost };
  return { source: slugValue(refHost), medium: 'referral', referrer_host: refHost };
}

const storage = (win) => { try { return win.sessionStorage; } catch { return null; } };

/**
 * The visit's attribution, kept for the browser tab's session (sessionStorage:
 * no cookie, nothing that outlives the tab). A new campaign link or an outside
 * referrer starts a new visit; clicks between pages keep the first one.
 */
export function visit(win = window) {
  const store = storage(win);
  let saved = null;
  try { saved = JSON.parse(store?.getItem(VISIT_KEY) || 'null'); } catch { saved = null; }
  const seen = classifyVisit({ search: win.location.search, referrer: win.document.referrer, host: win.location.hostname });
  const fresh = seen && (seen.medium !== 'none' || !saved);
  if (fresh) {
    saved = { ...seen, landing_page: win.location.pathname };
    try { store?.setItem(VISIT_KEY, JSON.stringify(saved)); } catch { /* private mode: attribution for this page only */ }
  }
  return saved || { source: 'direct', medium: 'none', landing_page: win.location.pathname };
}

export function deviceType(win = window) {
  const w = win.innerWidth || 0;
  const coarse = Boolean(win.matchMedia && win.matchMedia('(pointer: coarse)').matches);
  return w < 768 ? 'mobile' : coarse && w < 1280 ? 'tablet' : 'desktop';
}

/** Context added to every event. */
export function context(win = window) {
  const body = win.document.body;
  const app = win.document.documentElement.classList.contains('app-html');
  return {
    page_path: win.location.pathname,
    page_type: app ? 'app' : (body && body.getAttribute('data-page-type')) || 'page',
    content_slug: (body && body.getAttribute('data-page-slug')) || undefined,
    device_type: deviceType(win),
    ...visit(win),
  };
}

/** Keep only allow-listed, slug-like values. */
export function clean(props) {
  const out = {};
  for (const k of PROPS) {
    const v = props[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'string' && SAFE.test(v)) out[k] = v;
  }
  return out;
}

export function track(name, props = {}) {
  if (typeof window === 'undefined' || !EVENTS.includes(name)) return null;
  const event = { name, props: clean({ ...context(window), ...props }), at: Date.now() };
  const log = (window.folioEvents = window.folioEvents || []);
  log.push(event);
  if (log.length > 200) log.shift();
  window.dispatchEvent(new CustomEvent('folio:track', { detail: event }));
  return event;
}

if (typeof window !== 'undefined') window.folioTrack = track;

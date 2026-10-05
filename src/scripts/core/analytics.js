/**
 * Google Analytics 4: a provider for the events recorded by core/track.js.
 *
 * Off unless a measurement ID is configured (site.json → analytics.ga4MeasurementId,
 * or PUBLIC_GA_MEASUREMENT_ID at build time). Without one, nothing is loaded
 * or sent and every page works exactly the same.
 *
 * When on:
 * - gtag.js is loaded after the page has finished loading, when the browser is
 *   idle, so it never competes with the page or the generator;
 * - the page address is sent without its query string (except utm_* campaign
 *   tags), so values the tools pass to the generator never reach analytics;
 * - Google signals and ad personalisation are switched off;
 * - browsers sending Global Privacy Control or Do Not Track are not measured;
 * - visitors in the EEA, the UK and Switzerland are not measured, because
 *   analytics cookies need consent there and the site asks for none: GA4
 *   doesn't run in browsers set to a European time zone, and for any other
 *   visit Google locates in those countries, consent mode denies analytics
 *   storage, so no cookies are set.
 *
 * Shipped like track.js: imported by the app, bundled into site.js (exports stripped).
 * Another provider (Plausible, PostHog, a server endpoint) would follow the same
 * pattern: replay window.folioEvents, then listen for `folio:track`.
 */

export const GA4_ID = /^G-[A-Z0-9]{4,20}$/;

/** The address without a query string or hash, keeping only utm_* campaign tags. */
export function cleanUrl(href) {
  try {
    const u = new URL(href);
    const keep = new URLSearchParams();
    for (const [k, v] of u.searchParams) if (/^utm_(source|medium|campaign|term|content)$/.test(k)) keep.set(k, v);
    const q = keep.toString();
    return u.origin + u.pathname + (q ? `?${q}` : '');
  } catch {
    return '';
  }
}

/** Referrers are reduced to their origin: which site, never which page or search. */
export function cleanReferrer(ref) {
  try { return ref ? new URL(ref).origin + '/' : ''; } catch { return ''; }
}

/**
 * Event properties → GA4 event parameters. Acquisition fields are renamed so
 * they can't be mistaken for GA4's own campaign parameters; GA4 measures the
 * page and device itself.
 */
export function ga4Params(props) {
  const map = { source: 'visit_source', medium: 'visit_medium', campaign: 'visit_campaign' };
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'page_path') continue;
    out[map[k] || k] = v;
  }
  return out;
}

/** Where analytics storage is denied by default (Consent Mode region codes). */
export const CONSENT_REGIONS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'];
const EUROPEAN_ZONES = ['Atlantic/Reykjavik', 'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores', 'Atlantic/Faroe', 'Asia/Nicosia', 'Asia/Famagusta', 'Arctic/Longyearbyen'];
export const europeanTimeZone = (tz) => /^Europe\//.test(tz || '') || EUROPEAN_ZONES.includes(tz);
const timeZone = (win) => { try { return (win.Intl || Intl).DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } };

export function privacySignal(nav) {
  return Boolean(nav && (nav.globalPrivacyControl === true || nav.doNotTrack === '1' || nav.doNotTrack === 'yes'));
}

/**
 * Start GA4 if configured. Returns why it is or isn't running (the SEO
 * dashboard's tracking check and the tests read this from window.folioAnalyticsState).
 */
export function startAnalytics(config, win = window) {
  const state = (reason, on = false) => (win.folioAnalyticsState = { enabled: on, reason });
  const id = config && config.ga4;
  if (!id) return state('not-configured');
  if (!GA4_ID.test(id)) return state('invalid-id');
  if (config.respectPrivacySignals !== false && privacySignal(win.navigator)) return state('privacy-signal');
  if (europeanTimeZone(timeZone(win))) return state('consent-region');
  if (win.folioAnalyticsState && win.folioAnalyticsState.enabled) return win.folioAnalyticsState;

  const dl = (win.dataLayer = win.dataLayer || []);
  const gtag = (win.gtag = win.gtag || function gtag() { dl.push(arguments); });
  const ads = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
  gtag('consent', 'default', { ...ads, analytics_storage: 'denied', region: CONSENT_REGIONS });
  gtag('consent', 'default', { ...ads, analytics_storage: 'granted' });
  const page = { page_location: cleanUrl(win.location.href), page_referrer: cleanReferrer(win.document.referrer) };
  gtag('set', page); // applies to every hit: no query strings, no referrer paths
  gtag('js', new Date());
  gtag('config', id, { ...page, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  gtag('event', 'page_view', { page_location: cleanUrl(win.location.href), page_title: win.document.title });

  const send = (e) => gtag('event', e.name, ga4Params(e.props));
  (win.folioEvents || []).forEach(send);
  win.addEventListener('folio:track', (ev) => send(ev.detail));

  const load = () => {
    const s = win.document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    win.document.head.appendChild(s);
  };
  const idle = () => (win.requestIdleCallback ? win.requestIdleCallback(load, { timeout: 3000 }) : win.setTimeout(load, 1));
  if (win.document.readyState === 'complete') idle();
  else win.addEventListener('load', idle, { once: true });
  return state('ga4', true);
}

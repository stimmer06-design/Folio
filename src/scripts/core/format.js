/**
 * Formatting and parsing helpers. Pure functions — safe in the browser and in Node (build).
 */

export const CURRENCIES = [
  ['USD', 'US Dollar'],
  ['EUR', 'Euro'],
  ['GBP', 'British Pound'],
  ['CAD', 'Canadian Dollar'],
  ['AUD', 'Australian Dollar'],
  ['NZD', 'New Zealand Dollar'],
  ['CHF', 'Swiss Franc'],
  ['JPY', 'Japanese Yen'],
  ['INR', 'Indian Rupee'],
  ['MXN', 'Mexican Peso'],
  ['BRL', 'Brazilian Real'],
  ['SGD', 'Singapore Dollar'],
  ['ZAR', 'South African Rand'],
  ['SEK', 'Swedish Krona'],
  ['NOK', 'Norwegian Krone'],
  ['DKK', 'Danish Krone'],
];

// One display locale keeps the preview, the PDF and the editor identical.
const LOCALE = 'en-US';
const cache = new Map();

function moneyFormatter(currency, display = 'symbol') {
  const key = `${currency}|${display}`;
  if (!cache.has(key)) {
    let fmt;
    try {
      fmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency, currencyDisplay: display });
    } catch {
      fmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', currencyDisplay: display });
    }
    cache.set(key, fmt);
  }
  return cache.get(key);
}

/** Minor-unit digits for a currency: 2 for USD, 0 for JPY. */
export function currencyDigits(currency) {
  return moneyFormatter(currency).resolvedOptions().maximumFractionDigits;
}

/** Short symbol for UI affixes ("$", "€", "¥"). */
export function currencySymbol(currency) {
  const part = moneyFormatter(currency, 'narrowSymbol').formatToParts(0).find((p) => p.type === 'currency');
  return part ? part.value : currency;
}

const normalizeSpaces = (s) => String(s).replace(/[   ]/g, ' ');

export function formatMoney(value, currency) {
  const n = Number.isFinite(value) && !Object.is(value, -0) ? value : 0;
  return normalizeSpaces(moneyFormatter(currency).format(n));
}

/** Money with the ISO code instead of the symbol ("INR 1,000.00"). */
export function formatMoneyCode(value, currency) {
  const n = Number.isFinite(value) ? value : 0;
  return normalizeSpaces(moneyFormatter(currency, 'code').format(n));
}

export function formatNumber(value, maxDigits = 4) {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxDigits }).format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value) {
  return `${formatNumber(value, 3)}%`;
}

/** Parse user input as a non-negative number; empty or invalid → 0. */
export function parseAmount(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : 0;
  if (raw == null) return 0;
  const n = parseFloat(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Round half away from zero. */
export function round(value, digits = 2) {
  const f = 10 ** digits;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * f + 1e-9)) / f;
}

// ---- Dates (ISO yyyy-mm-dd strings, treated as calendar dates in UTC) ------

export function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function formatDate(iso) {
  const d = parseISODate(iso);
  return d ? dateFmt.format(d) : '';
}

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(iso, days) {
  const d = parseISODate(iso);
  if (!d) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromISO, toISO) {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  return a && b ? Math.round((b - a) / 86400000) : null;
}

// ---- HTML escaping (renderer output is assigned with innerHTML) -------------

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

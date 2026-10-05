/**
 * Arithmetic for the free tools (/tools/…) and the links they hand to the
 * generator. Pure — no DOM. The invoice tax calculator uses computeTotals()
 * from calc.js directly, so its figures are exactly the generator's.
 */
import { parseAmount, round, CURRENCIES } from './format.js';

// ---------------------------------------------------------------- invoice numbers

/**
 * One invoice number from its parts.
 *   prefix 'INV', separator '-', date part 'yyyy', start 42, digits 4  →  INV-2026-0042
 */
export function formatInvoiceNumber({ prefix = '', separator = '-', datePart = 'none', number = 1, digits = 4, date = new Date() } = {}) {
  const n = Math.max(0, Math.floor(Number(number) || 0));
  const width = Math.min(Math.max(Math.floor(Number(digits) || 0), 1), 8);
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dateText = { yyyy, yy: yyyy.slice(2), yyyymm: yyyy + mm, 'yyyy-mm': `${yyyy}${separator}${mm}` }[datePart] || '';
  return [String(prefix).trim(), dateText, String(n).padStart(width, '0')].filter(Boolean).join(separator);
}

/** The next `count` numbers in the sequence, starting at `number`. */
export function invoiceNumberSequence(options = {}, count = 5) {
  const start = Math.max(0, Math.floor(Number(options.number) || 0));
  return Array.from({ length: count }, (_, i) => formatInvoiceNumber({ ...options, number: start + i }));
}

// ---------------------------------------------------------------- sales tax

/**
 * Sales tax (or VAT, GST) on an amount at a rate the user supplies.
 *   inclusive: false → the amount is before tax; tax is added on top
 *   inclusive: true  → the amount already includes tax; tax is extracted
 * Rounded to the currency's minor unit, like the generator.
 */
export function salesTax({ amount, rate, inclusive = false, digits = 2 } = {}) {
  const a = parseAmount(amount);
  const r = Math.min(parseAmount(rate), 100);
  if (inclusive) {
    const net = round(a / (1 + r / 100), digits);
    return { net, tax: round(a - net, digits), gross: round(a, digits), rate: r };
  }
  const tax = round((a * r) / 100, digits);
  return { net: round(a, digits), tax, gross: round(a + tax, digits), rate: r };
}

// ---------------------------------------------------------------- links into the generator

/** Parameters the generator accepts to start an invoice (see prefillFromParams). */
export const PREFILL_KEYS = ['number', 'item', 'qty', 'price', 'tax', 'taxLabel', 'discount', 'discountType', 'shipping', 'paid', 'currency'];

/** A /app/ link that starts a new invoice with these values. Empty values are left out. */
export function generatorLink(base, values) {
  const q = new URLSearchParams();
  for (const k of PREFILL_KEYS) {
    const v = values[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') q.set(k, String(v).trim());
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

const num = (v, { max = 1e12 } = {}) => {
  const s = v == null ? '' : String(v).replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return n <= max ? String(n) : undefined;
};
const text = (v, max) => (v == null ? undefined : String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) || undefined);

/**
 * Validates untrusted URL parameters into partial invoice fields. Anything
 * malformed is dropped rather than guessed at. Returns null when there is
 * nothing to prefill.
 */
export function prefillFromParams(params) {
  const get = (k) => (params.has(k) ? params.get(k) : undefined);
  const meta = {};
  const adjustments = {};
  const number = text(get('number'), 40);
  if (number) meta.number = number;
  const currency = text(get('currency'), 3);
  if (currency && CURRENCIES.some(([code]) => code === currency.toUpperCase())) meta.currency = currency.toUpperCase();

  const price = num(get('price'));
  const qty = num(get('qty'), { max: 1e9 });
  const item = text(get('item'), 200);
  const items = price !== undefined || item ? [{ description: item || '', quantity: qty || '1', price: price || '' }] : null;

  const tax = num(get('tax'), { max: 100 });
  if (tax !== undefined) adjustments.taxRate = tax;
  const taxLabel = text(get('taxLabel'), 30);
  if (taxLabel) adjustments.taxLabel = taxLabel;
  const discount = num(get('discount'));
  if (discount !== undefined) {
    adjustments.discountValue = discount;
    adjustments.discountType = get('discountType') === 'amount' ? 'amount' : 'percent';
  }
  const shipping = num(get('shipping'));
  if (shipping !== undefined) adjustments.shipping = shipping;
  const paid = num(get('paid'));
  if (paid !== undefined) adjustments.paid = paid;

  if (!Object.keys(meta).length && !Object.keys(adjustments).length && !items) return null;
  return { meta, adjustments, items };
}

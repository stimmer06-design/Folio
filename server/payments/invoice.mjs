/**
 * The amount a payment link charges, worked out on the server.
 *
 * Folio has no invoice database: the invoice lives in its author's browser.
 * To create a link, the browser sends the invoice's figures (quantities, unit
 * prices, discount, tax, shipping, deposit, currency), never an amount. The
 * server recomputes the amount due with the same code the app uses
 * (src/scripts/core/calc.js) and stores the result; from then on the stored
 * amount is the only one any checkout uses.
 */
import { normalizeInvoice } from '../../src/scripts/core/model.js';
import { computeTotals } from '../../src/scripts/core/calc.js';
import { CURRENCIES, currencyDigits, formatMoney } from '../../src/scripts/core/format.js';
import { HttpError, clip } from './util.mjs';

const CODES = CURRENCIES.map((c) => c[0]);
const MAX_ITEMS = 500;
const FIGURE = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 32);
/** Keys that would carry an amount; their presence means a client is trying to set one. */
const AMOUNT_KEYS = ['amount', 'total', 'due', 'amountDue', 'unit_amount', 'value'];

/** Minor units (cents; yen for JPY) → a display string, for pages and logs. */
export const money = (minor, currency) => formatMoney(minor / 10 ** currencyDigits(currency), currency);

/**
 * Validate the figures sent by the browser and compute the amount due.
 * @returns {{ invoiceId, number, currency, digits, amount, description, business }}
 */
export function amountForInvoice(body) {
  const src = body && body.invoice;
  if (!src || typeof src !== 'object' || Array.isArray(src)) throw new HttpError(400, 'Missing invoice.');
  for (const k of AMOUNT_KEYS) {
    if (k in body || k in src) throw new HttpError(400, 'Amounts are calculated by the server from the invoice; do not send one.', 'amount_not_accepted');
  }
  const id = typeof src.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(src.id) ? src.id : null;
  if (!id) throw new HttpError(400, 'Missing invoice id.');
  const currency = typeof src.currency === 'string' ? src.currency.toUpperCase() : '';
  if (!CODES.includes(currency)) throw new HttpError(400, 'Unsupported currency.', 'currency');
  if (!Array.isArray(src.items) || src.items.length === 0 || src.items.length > MAX_ITEMS) throw new HttpError(400, 'The invoice needs between 1 and 500 items.');
  const items = src.items.map((it) => {
    if (!it || typeof it !== 'object' || !FIGURE(it.quantity ?? '') || !FIGURE(it.price ?? '')) throw new HttpError(400, 'Invalid item.');
    return { quantity: String(it.quantity ?? ''), price: String(it.price ?? '') };
  });
  const a = src.adjustments && typeof src.adjustments === 'object' ? src.adjustments : {};
  for (const k of ['taxRate', 'discountValue', 'shipping', 'paid']) {
    if (a[k] != null && !FIGURE(a[k])) throw new HttpError(400, 'Invalid adjustment.');
  }

  // The same normalisation and arithmetic as the app, so both get the same figure.
  const inv = normalizeInvoice({
    id,
    meta: { number: typeof src.number === 'string' ? src.number : '', currency },
    items,
    adjustments: { taxRate: a.taxRate, discountType: a.discountType, discountValue: a.discountValue, shipping: a.shipping, paid: a.paid },
  });
  const totals = computeTotals(inv);
  const digits = currencyDigits(currency);
  const amount = Math.round(totals.due * 10 ** digits);
  if (!(amount > 0)) throw new HttpError(422, 'Nothing is due on this invoice, so there is nothing to pay.', 'nothing_due');
  if (amount > 99_999_999) throw new HttpError(422, 'That amount is too large for an online payment.', 'too_large');

  return {
    invoiceId: id,
    number: clip(src.number, 60),
    currency,
    digits,
    amount,
    description: clip(src.project, 120),
    business: clip(src.business, 80),
  };
}

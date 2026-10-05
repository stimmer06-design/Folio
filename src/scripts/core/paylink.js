/**
 * The payment link attached to an invoice (invoice.paylink), and whether it
 * still matches the invoice. Pure — shared by the editor, the renderer and the
 * tests.
 *
 *   paylink: {
 *     id, url, provider: 'stripe' | 'paypal',
 *     amount,            the amount due when the link was made, in minor units (cents; yen)
 *     currency, number,  the invoice's currency and number at that time
 *     status,            unpaid | pending | paid | failed | expired | cancelled (from the server)
 *     createdAt, paidAt,
 *     onInvoice,         shown on the invoice ("Add to invoice")
 *     qr,                with a QR code
 *   }
 */
import { CURRENCIES, currencyDigits } from './format.js';

export const PAYLINK_STATUSES = ['unpaid', 'pending', 'paid', 'failed', 'expired', 'cancelled'];
export const PAY_PROVIDERS = {
  stripe: { name: 'Stripe', via: 'Secure payment via Stripe' },
  paypal: { name: 'PayPal', via: 'Pay with PayPal' },
};

// Links are always https on the site's own domain (http only for local testing).
const URL_RE = /^(https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d+)?|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\/pay\/[A-Za-z0-9_-]{16,40}$/i;

/** The amount due in minor units — what the payment server computes from the same figures. */
export const amountDue = (totals, currency) => Math.round(totals.due * 10 ** currencyDigits(currency));

/** "folioinvoice.com/pay/k3x9…" for print. */
export const displayUrl = (url) => String(url || '').replace(/^https?:\/\//, '');

/** Validate a stored payment link; anything malformed is dropped (null). */
export function normalizePaylink(p) {
  if (!p || typeof p !== 'object') return null;
  const str = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');
  if (typeof p.url !== 'string' || !URL_RE.test(p.url) || typeof p.id !== 'string' || !p.url.endsWith(`/pay/${p.id}`)) return null;
  if (!PAY_PROVIDERS[p.provider]) return null;
  const amount = Number.isSafeInteger(p.amount) && p.amount > 0 ? p.amount : null;
  const currency = CURRENCIES.some((c) => c[0] === p.currency) ? p.currency : null;
  if (amount == null || !currency) return null;
  return {
    id: p.id,
    url: p.url,
    provider: p.provider,
    amount,
    currency,
    number: str(p.number),
    status: PAYLINK_STATUSES.includes(p.status) ? p.status : 'unpaid',
    createdAt: str(p.createdAt, 40),
    paidAt: str(p.paidAt, 40),
    onInvoice: p.onInvoice === true,
    qr: p.qr === true,
  };
}

/**
 * What the link means for the invoice as it is now:
 *   'none'            no link
 *   'paid'            paid (whatever happened to the invoice since)
 *   'expired', 'cancelled'
 *   'changed'         the amount due or the currency is no longer the link's
 *   'renumbered'      the invoice number changed
 *   'unpaid', 'pending', 'failed'
 */
export function paylinkState(inv, totals) {
  const l = inv.paylink;
  if (!l) return 'none';
  if (l.status === 'paid' || l.status === 'expired' || l.status === 'cancelled') return l.status;
  if (l.currency !== inv.meta.currency || l.amount !== amountDue(totals, inv.meta.currency)) return 'changed';
  if (l.number !== (inv.meta.number || '').trim()) return 'renumbered';
  return l.status;
}

/** Whether the invoice still matches a paid link (the paid mark is only shown then). */
export const paidMatches = (inv, totals) =>
  Boolean(inv.paylink && inv.paylink.status === 'paid' && inv.paylink.currency === inv.meta.currency && inv.paylink.amount === amountDue(totals, inv.meta.currency));

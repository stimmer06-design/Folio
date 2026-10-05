/**
 * PayPal, through the REST API (Orders v2), with Folio's own REST app.
 *
 * PayPal's partner onboarding (Commerce Platform) needs approval from PayPal,
 * so Folio uses PayPal's documented "pay another account" checkout instead:
 * each order names the Folio user's PayPal account as the payee (email address
 * or merchant ID), the client approves it on paypal.com, and Folio captures it
 * from the server. The money goes straight to the payee.
 *
 * Environment: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID,
 * PAYPAL_ENV=live (anything else uses the sandbox). FOLIO_TEST_PAYPAL_API
 * points the client at a local mock in the test suite.
 */

/** Currencies of Folio's sixteen that PayPal doesn't accept. */
export const PAYPAL_UNSUPPORTED = ['INR', 'ZAR'];

export class PayPalError extends Error {
  constructor(status, body) {
    const detail = body && Array.isArray(body.details) && body.details[0];
    super((detail && (detail.description || detail.issue)) || (body && (body.message || body.error_description)) || `PayPal error ${status}`);
    this.status = status;
    this.issue = (detail && detail.issue) || (body && (body.name || body.error)) || '';
  }
}

export function paypalProvider(env = process.env, fetchImpl = globalThis.fetch) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return null;
  const live = env.PAYPAL_ENV === 'live';
  const base = (env.FOLIO_TEST_PAYPAL_API || (live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')).replace(/\/$/, '');
  let token = null;

  async function accessToken() {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    const res = await fetchImpl(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || !body.access_token) throw new PayPalError(res.status, body);
    token = { value: body.access_token, expires: Date.now() + (Number(body.expires_in) || 300) * 1000 };
    return token.value;
  }

  async function call(method, path, { body, headers = {}, raw } = {}) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new PayPalError(res.status, data);
    return data;
  }

  const approveUrl = (order) => {
    const l = (order.links || []).find((x) => x.rel === 'payer-action' || x.rel === 'approve');
    return l ? l.href : '';
  };

  return {
    name: 'paypal',
    label: 'PayPal',
    live,
    webhooks: Boolean(env.PAYPAL_WEBHOOK_ID),

    /** An order for the stored amount, paid to the Folio user's PayPal account. */
    async createOrder(link, { origin, attempt }) {
      const value = (link.amount / 10 ** link.digits).toFixed(link.digits);
      const description = [link.number && `Invoice ${link.number}`, link.description].filter(Boolean).join(' · ').slice(0, 127) || 'Invoice';
      const order = await call('POST', '/v2/checkout/orders', {
        headers: { 'PayPal-Request-Id': `folio-order-${link.id}-${attempt}`, Prefer: 'return=representation' },
        body: {
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: link.id,
            custom_id: link.id,
            description,
            amount: { currency_code: link.currency, value },
            payee: link.payee,
          }],
          payment_source: {
            paypal: {
              experience_context: {
                ...(link.business ? { brand_name: link.business.slice(0, 127) } : {}),
                shipping_preference: 'NO_SHIPPING',
                user_action: 'PAY_NOW',
                return_url: `${origin}/pay/${link.id}/paypal`,
                cancel_url: `${origin}/pay/${link.id}/cancel`,
              },
            },
          },
        },
      });
      return { id: order.id, status: order.status, url: approveUrl(order) };
    },

    getOrder(orderId) {
      return call('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    },

    /** Capture an approved order. Idempotent: a repeated capture returns the first result. */
    captureOrder(orderId) {
      return call('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        headers: { 'PayPal-Request-Id': `folio-capture-${orderId}`, Prefer: 'return=representation' },
        raw: '{}',
      });
    },

    /**
     * Ask PayPal whether a webhook delivery is genuine. The event is passed
     * through byte for byte, as PayPal signed it.
     */
    async verifyWebhook(headers, rawBody) {
      if (!env.PAYPAL_WEBHOOK_ID) return false;
      const h = (k) => headers.get(k) || '';
      const fields = {
        auth_algo: h('paypal-auth-algo'),
        cert_url: h('paypal-cert-url'),
        transmission_id: h('paypal-transmission-id'),
        transmission_sig: h('paypal-transmission-sig'),
        transmission_time: h('paypal-transmission-time'),
        webhook_id: env.PAYPAL_WEBHOOK_ID,
      };
      if (!fields.transmission_id || !fields.transmission_sig || !fields.cert_url) return false;
      const raw = `${JSON.stringify(fields).slice(0, -1)},"webhook_event":${rawBody}}`;
      const result = await call('POST', '/v1/notifications/verify-webhook-signature', { raw });
      return Boolean(result && result.verification_status === 'SUCCESS');
    },
  };
}

/** The first purchase unit's capture, if any. */
export const captureOf = (order) => {
  const pu = order && order.purchase_units && order.purchase_units[0];
  return (pu && pu.payments && pu.payments.captures && pu.payments.captures[0]) || null;
};

/**
 * What an order means for its link. The order's purchase unit must be this
 * link's (custom_id) and carry exactly the stored amount and currency.
 */
export function orderOutcome(order, link) {
  const pu = order && order.purchase_units && order.purchase_units[0];
  if (!pu || pu.custom_id !== link.id) return { outcome: null, reason: 'not this link' };
  const value = (link.amount / 10 ** link.digits).toFixed(link.digits);
  const capture = captureOf(order);
  const amount = (capture && capture.amount) || pu.amount;
  if (!amount || amount.currency_code !== link.currency || Number(amount.value).toFixed(link.digits) !== value) {
    return { outcome: null, reason: 'amount mismatch' };
  }
  if (order.status === 'APPROVED') return { outcome: 'approved' };
  if (capture) {
    // A refund after payment is the user's business in PayPal; the invoice stays paid in Folio.
    if (capture.status === 'COMPLETED' || capture.status === 'PARTIALLY_REFUNDED') return { outcome: 'paid', capture: capture.id };
    if (capture.status === 'PENDING') return { outcome: 'pending', capture: capture.id };
    if (capture.status === 'DECLINED' || capture.status === 'FAILED') return { outcome: 'failed', capture: capture.id };
  }
  if (order.status === 'COMPLETED') return { outcome: 'paid' };
  return { outcome: null, reason: `order ${order.status}` };
}

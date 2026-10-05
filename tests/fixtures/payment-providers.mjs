/**
 * Local stand-ins for the Stripe and PayPal APIs, for the payment tests.
 *
 * They implement only the calls Folio makes, with the same request formats
 * (Stripe: form-encoded with bracketed keys and a Stripe-Account header;
 * PayPal: JSON with OAuth bearer tokens), plus browser pages that play the
 * part of Stripe's onboarding and Checkout and PayPal's approval page. When a
 * payment completes they deliver webhooks to Folio, signed the way the real
 * providers sign them (Stripe: with the official SDK's test header helper).
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';

const id = (prefix) => `${prefix}_${randomBytes(9).toString('hex')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Stripe's form encoding (`a[b][0][c]=1`) → nested objects and arrays. */
export function parseForm(body) {
  const out = {};
  for (const [key, value] of new URLSearchParams(body)) {
    const parts = key.replace(/\]/g, '').split('[');
    let o = out;
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      const nextIsIndex = !last && /^\d+$/.test(parts[i + 1]);
      if (last) o[p] = value;
      else o = o[p] ?? (o[p] = nextIsIndex ? [] : {});
    });
  }
  return out;
}

const readBody = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', (c) => (data += c));
  req.on('end', () => resolve(data));
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="font-family:sans-serif;padding:2rem">${body}</body></html>`;

// ---------------------------------------------------------------- Stripe
export async function mockStripe({ webhookSecret = 'whsec_test_folio', secretKey = 'sk_test_folio' } = {}) {
  const state = { accounts: new Map(), sessions: new Map(), requests: [], webhookUrl: '', events: [], failNext: null };
  const signer = new Stripe(secretKey);
  let origin = '';

  async function deliver(type, object, account) {
    const event = { id: id('evt'), object: 'event', type, account, created: Math.floor(Date.now() / 1000), data: { object }, livemode: false, api_version: '2026-09-30.endive' };
    state.events.push(event);
    if (!state.webhookUrl) return null;
    const payload = JSON.stringify(event);
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const res = await fetch(state.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header }, body: payload });
    return { status: res.status, body: await res.text() };
  }

  const fail = (res, status, message, type = 'invalid_request_error') => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { type, message } }));
  };
  const send = (res, obj) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Request-Id': id('req') });
    res.end(JSON.stringify(obj));
  };

  async function complete(session, { paid = true, webhook = true } = {}) {
    session.status = 'complete';
    session.payment_status = paid ? 'paid' : 'unpaid';
    if (webhook) await deliver('checkout.session.completed', session, session.account);
    return session;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    const body = await readBody(req);
    const p = url.pathname;

    // ---- browser pages
    if (p.startsWith('/onboarding/')) {
      const acct = state.accounts.get(p.split('/')[2]);
      if (!acct) return fail(res, 404, 'No such account');
      if (req.method === 'POST') {
        Object.assign(acct, { details_submitted: true, charges_enabled: true, payouts_enabled: true, email: 'owner@example.com', settings: { dashboard: { display_name: 'Marlow Studio' } } });
        await deliver('account.updated', acct, acct.id);
        res.writeHead(303, { Location: url.searchParams.get('return') });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(page('Stripe onboarding (test)', `<h1>Stripe onboarding (test)</h1><form method="post"><button>Complete onboarding</button></form>`));
    }
    if (p.startsWith('/checkout/')) {
      const [, , sid, action] = p.split('/');
      const s = state.sessions.get(sid);
      if (!s) return fail(res, 404, 'No such session');
      if (req.method === 'POST' && action === 'pay') {
        if (s.status !== 'open') { res.writeHead(409); return res.end('Session is not open'); }
        await complete(s, { paid: true, webhook: !state.holdWebhooks });
        res.writeHead(303, { Location: s.success_url.replace('{CHECKOUT_SESSION_ID}', s.id) });
        return res.end();
      }
      if (req.method === 'POST' && action === 'cancel') {
        res.writeHead(303, { Location: s.cancel_url });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      const li = s.line_items[0];
      return res.end(page('Stripe Checkout (test)', `<h1>Stripe Checkout (test)</h1>
        <p data-name>${esc(li.price_data.product_data.name)}</p>
        <p data-amount>${esc(s.amount_total)} ${esc(s.currency)}</p>
        <p data-status>${esc(s.status)}</p>
        <form method="post" action="/checkout/${s.id}/pay"><button data-pay>Pay</button></form>
        <form method="post" action="/checkout/${s.id}/cancel"><button data-cancel>Back</button></form>`));
    }

    // ---- API
    state.requests.push({ method: req.method, path: p, account: req.headers['stripe-account'] || null, idempotency: req.headers['idempotency-key'] || null, auth: req.headers.authorization, body: parseForm(body) });
    if (req.headers.authorization !== `Bearer ${secretKey}`) return fail(res, 401, 'Invalid API Key provided', 'invalid_request_error');
    if (state.failNext && p.startsWith(state.failNext.path)) {
      const f = state.failNext;
      state.failNext = null;
      return fail(res, f.status || 400, f.message || 'Mock failure');
    }
    const params = parseForm(body);

    if (req.method === 'POST' && p === '/v1/accounts') {
      const a = { id: id('acct'), object: 'account', charges_enabled: false, details_submitted: false, payouts_enabled: false, controller: params.controller, metadata: params.metadata || {}, requirements: { disabled_reason: 'requirements.past_due' } };
      state.accounts.set(a.id, a);
      return send(res, a);
    }
    let m = /^\/v1\/accounts\/([^/]+)$/.exec(p);
    if (req.method === 'GET' && m) {
      const a = state.accounts.get(m[1]);
      return a ? send(res, a) : fail(res, 404, 'No such account');
    }
    if (req.method === 'POST' && p === '/v1/account_links') {
      if (!state.accounts.has(params.account)) return fail(res, 400, 'No such account');
      return send(res, { object: 'account_link', url: `${origin}/onboarding/${params.account}?return=${encodeURIComponent(params.return_url)}&refresh=${encodeURIComponent(params.refresh_url)}`, expires_at: Math.floor(Date.now() / 1000) + 300 });
    }
    if (req.method === 'POST' && p === '/v1/checkout/sessions') {
      const account = req.headers['stripe-account'];
      const acct = state.accounts.get(account);
      if (!acct) return fail(res, 400, 'No such account');
      if (!acct.charges_enabled) return fail(res, 400, 'Your account cannot currently make live charges.');
      const li = params.line_items[0];
      const amount = Number(li.price_data.unit_amount) * Number(li.quantity);
      if (amount < 50 && li.price_data.currency !== 'jpy') return fail(res, 400, 'The Checkout Session\'s total amount due must add up to at least $0.50 usd');
      const s = {
        id: id('cs_test'), object: 'checkout.session', account, mode: params.mode, status: 'open', payment_status: 'unpaid',
        amount_total: amount, currency: li.price_data.currency, client_reference_id: params.client_reference_id,
        metadata: params.metadata || {}, payment_intent_data: params.payment_intent_data, line_items: params.line_items,
        success_url: params.success_url, cancel_url: params.cancel_url, submit_type: params.submit_type,
        expires_at: Math.floor(Date.now() / 1000) + 24 * 3600,
      };
      s.url = `${origin}/checkout/${s.id}`;
      state.sessions.set(s.id, s);
      return send(res, s);
    }
    m = /^\/v1\/checkout\/sessions\/([^/]+)(\/expire)?$/.exec(p);
    if (m) {
      const s = state.sessions.get(m[1]);
      if (!s || s.account !== req.headers['stripe-account']) return fail(res, 404, `No such checkout.session: '${m[1]}'`);
      if (m[2] && req.method === 'POST') {
        if (s.status !== 'open') return fail(res, 400, 'Only Checkout Sessions with a status in ["open"] can be expired.');
        s.status = 'expired';
        return send(res, s);
      }
      return send(res, s);
    }
    return fail(res, 404, `Unrecognized request URL (${req.method}: ${p})`);
  });
  origin = await listen(server);

  return {
    origin,
    state,
    secretKey,
    webhookSecret,
    deliver,
    complete,
    session: (sid) => state.sessions.get(sid),
    lastSession: () => [...state.sessions.values()].pop(),
    /** Make an account ready to take payments (as finishing onboarding does). */
    activate(acctId) {
      Object.assign(state.accounts.get(acctId), { details_submitted: true, charges_enabled: true });
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

// ---------------------------------------------------------------- PayPal
export async function mockPayPal({ clientId = 'pp_client', clientSecret = 'pp_secret', webhookId = 'WH-TEST' } = {}) {
  const state = { orders: new Map(), requests: [], tokens: new Set(), webhookUrl: '', captures: new Map(), events: [] };
  let origin = '';

  const send = (res, status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  const issue = (res, status, name, issueCode, description) => send(res, status, { name, message: description, details: [{ issue: issueCode, description }] });

  async function deliver(eventType, resource, { signature = 'valid-signature' } = {}) {
    const event = { id: id('WH'), event_type: eventType, resource_type: eventType.startsWith('CHECKOUT') ? 'checkout-order' : 'capture', resource, create_time: new Date().toISOString() };
    state.events.push(event);
    if (!state.webhookUrl) return null;
    const res = await fetch(state.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PayPal-Auth-Algo': 'SHA256withRSA',
        'PayPal-Cert-Url': `${origin}/certs/test.pem`,
        'PayPal-Transmission-Id': id('tx'),
        'PayPal-Transmission-Sig': signature,
        'PayPal-Transmission-Time': new Date().toISOString(),
      },
      body: JSON.stringify(event),
    });
    return { status: res.status, body: await res.text() };
  }

  function capture(order) {
    const pu = order.purchase_units[0];
    const cap = { id: id('CAP'), status: state.captureStatus || 'COMPLETED', amount: pu.amount, custom_id: pu.custom_id, supplementary_data: { related_ids: { order_id: order.id } } };
    pu.payments = { captures: [cap] };
    order.status = 'COMPLETED';
    return cap;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    const raw = await readBody(req);
    const p = url.pathname;

    // ---- browser page: the client approves the order
    let m = /^\/checkoutnow\/([^/]+)(\/(approve|cancel))?$/.exec(p);
    if (m) {
      const o = state.orders.get(m[1]);
      if (!o) { res.writeHead(404); return res.end('No such order'); }
      const ctx = o.payment_source.paypal.experience_context;
      if (req.method === 'POST' && m[3] === 'approve') {
        o.status = 'APPROVED';
        o.payer = { payer_id: 'PAYER123' };
        if (!state.holdWebhooks) await deliver('CHECKOUT.ORDER.APPROVED', o);
        res.writeHead(303, { Location: `${ctx.return_url}?token=${o.id}&PayerID=PAYER123` });
        return res.end();
      }
      if (req.method === 'POST' && m[3] === 'cancel') {
        res.writeHead(303, { Location: `${ctx.cancel_url}?token=${o.id}` });
        return res.end();
      }
      const pu = o.purchase_units[0];
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(page('PayPal (test)', `<h1>PayPal (test)</h1>
        <p data-payee>${esc(pu.payee.email_address || pu.payee.merchant_id)}</p>
        <p data-amount>${esc(pu.amount.value)} ${esc(pu.amount.currency_code)}</p>
        <p data-description>${esc(pu.description)}</p>
        <form method="post" action="/checkoutnow/${o.id}/approve"><button data-approve>Pay now</button></form>
        <form method="post" action="/checkoutnow/${o.id}/cancel"><button data-cancel>Cancel</button></form>`));
    }

    state.requests.push({ method: req.method, path: p, headers: { requestId: req.headers['paypal-request-id'] || null, auth: req.headers.authorization }, body: raw });
    if (p === '/v1/oauth2/token' && req.method === 'POST') {
      const expected = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
      if (req.headers.authorization !== expected || raw !== 'grant_type=client_credentials') return send(res, 401, { error: 'invalid_client', error_description: 'Client Authentication failed' });
      const token = id('A21');
      state.tokens.add(token);
      return send(res, 200, { access_token: token, token_type: 'Bearer', expires_in: 32400 });
    }
    const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!state.tokens.has(bearer)) return send(res, 401, { name: 'AUTHENTICATION_FAILURE', message: 'Authentication failed due to invalid authentication credentials or a missing Authorization header.' });

    if (p === '/v2/checkout/orders' && req.method === 'POST') {
      const body = JSON.parse(raw);
      const prior = [...state.orders.values()].find((o) => o.requestId === req.headers['paypal-request-id']);
      if (prior) return send(res, 200, prior);
      const pu = body.purchase_units[0];
      if (!pu.payee || (!pu.payee.email_address && !pu.payee.merchant_id)) return issue(res, 422, 'UNPROCESSABLE_ENTITY', 'PAYEE_ACCOUNT_INVALID', 'Payee account specified is invalid.');
      if (/invalid/.test(pu.payee.email_address || '')) return issue(res, 422, 'UNPROCESSABLE_ENTITY', 'PAYEE_ACCOUNT_INVALID', 'Payee account specified is invalid. Please check the payee.email_address or payee.merchant_id specified and try again.');
      const o = { id: id('ORDER').toUpperCase().slice(0, 17), intent: body.intent, status: 'PAYER_ACTION_REQUIRED', purchase_units: body.purchase_units, payment_source: body.payment_source, requestId: req.headers['paypal-request-id'] };
      o.links = [{ rel: 'self', href: `${origin}/v2/checkout/orders/${o.id}`, method: 'GET' }, { rel: 'payer-action', href: `${origin}/checkoutnow/${o.id}`, method: 'GET' }];
      state.orders.set(o.id, o);
      return send(res, 200, o);
    }
    m = /^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/.exec(p);
    if (m) {
      const o = state.orders.get(m[1]);
      if (!o) return issue(res, 404, 'RESOURCE_NOT_FOUND', 'INVALID_RESOURCE_ID', 'Specified resource ID does not exist.');
      if (!m[2]) return send(res, 200, o);
      const reqId = req.headers['paypal-request-id'];
      if (state.captures.has(reqId)) return send(res, 201, state.captures.get(reqId));
      if (o.status === 'COMPLETED') return issue(res, 422, 'UNPROCESSABLE_ENTITY', 'ORDER_ALREADY_CAPTURED', 'Order already captured.');
      if (o.status !== 'APPROVED') return issue(res, 422, 'UNPROCESSABLE_ENTITY', 'ORDER_NOT_APPROVED', 'Payer has not yet approved the Order for payment.');
      const cap = capture(o);
      state.captures.set(reqId, o);
      if (!state.holdWebhooks) setTimeout(() => deliver('PAYMENT.CAPTURE.COMPLETED', cap), 10);
      return send(res, 201, o);
    }
    if (p === '/v1/notifications/verify-webhook-signature' && req.method === 'POST') {
      const body = JSON.parse(raw);
      const ok = body.webhook_id === webhookId && body.transmission_sig === 'valid-signature' && body.webhook_event && body.webhook_event.id;
      return send(res, 200, { verification_status: ok ? 'SUCCESS' : 'FAILURE' });
    }
    return send(res, 404, { name: 'NOT_FOUND', message: `No route ${req.method} ${p}` });
  });
  origin = await listen(server);

  return {
    origin,
    state,
    clientId,
    clientSecret,
    webhookId,
    deliver,
    lastOrder: () => [...state.orders.values()].pop(),
    approve(orderId) {
      const o = state.orders.get(orderId);
      o.status = 'APPROVED';
      return o;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

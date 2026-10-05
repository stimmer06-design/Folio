/**
 * Folio payment links — the server.
 *
 *   createPayments({ store, env }) → { handle(Request) → Response }
 *
 * Runs as one Netlify Function (netlify/functions/payments.mjs) and, in the
 * test suite, inside a plain Node server. Routes:
 *
 *   GET    /api/payments/config                  which providers are configured
 *   POST   /api/payments/connections             connect Stripe (hosted onboarding) or PayPal (payee)
 *   GET    /api/payments/connections/current     *  status of this browser's connection
 *   POST   /api/payments/connections/current/onboarding  *  continue Stripe onboarding
 *   DELETE /api/payments/connections/current     *  disconnect (cancels its links)
 *   POST   /api/payments/links                   *  create a link for an invoice (replaces its previous one)
 *   GET    /api/payments/links/<id>              *  a link's status
 *   DELETE /api/payments/links/<id>              *  cancel a link
 *   GET    /api/payments/stripe/refresh          Stripe onboarding link expired → a fresh one
 *   POST   /api/payments/webhooks/stripe         Connect webhook (Stripe-Signature verified)
 *   POST   /api/payments/webhooks/paypal         PayPal webhook (verified with PayPal)
 *   GET    /pay/<id>                             the link on the invoice
 *   POST   /pay/<id>                             → Stripe Checkout / PayPal approval
 *   GET    /pay/<id>/done | /cancel | /paypal    return pages
 *
 *   * needs "Authorization: Bearer <connection key>"
 *
 * There are no user accounts. Connecting a payment account issues a random
 * connection key that only the user's browser holds (the store keeps a hash),
 * and every link belongs to one connection. Amounts are always computed here
 * (invoice.mjs); payment status only ever comes from Stripe or PayPal, read
 * server to server or from a verified webhook — never from the browser.
 */
import { HttpError, json, redirect, readJson, randomId, readableId, newConnectionKey, parseConnectionKey, sameHash, DAY } from './util.mjs';
import { update } from './store.mjs';
import { amountForInvoice, money } from './invoice.mjs';
import { stripeProvider, sessionOutcome, statusOf } from './stripe.mjs';
import { paypalProvider, PAYPAL_UNSUPPORTED, orderOutcome } from './paypal.mjs';
import { page, pageHeaders } from './pages.mjs';

export const LINK_DAYS = 180;
export const STATUSES = ['unpaid', 'pending', 'paid', 'failed', 'expired', 'cancelled'];
const PAYABLE = ['unpaid', 'failed'];
// Which status can follow which. A checkout that was already open when its link
// expired or was replaced can still complete, and then the link is paid.
const NEXT = {
  unpaid: ['pending', 'paid', 'failed', 'expired', 'cancelled'],
  failed: ['pending', 'paid', 'expired', 'cancelled'],
  pending: ['paid', 'failed'],
  paid: [],
  expired: ['pending', 'paid'],
  cancelled: ['pending', 'paid'],
};
const NAMES = { stripe: 'Stripe', paypal: 'PayPal' };
const LINK_ID = /^[A-Za-z0-9_-]{16,40}$/;
const EMAIL = /^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}\.[^\s@,;<>]{2,24}$/;
const MERCHANT_ID = /^[A-Z0-9]{13}$/;
const RECHECK_MS = 30 * 1000;
const STRIPE_REUSE_MS = 30 * 60 * 1000;
const PAYPAL_REUSE_MS = 3 * 60 * 60 * 1000;

const K = {
  connection: (id) => `connection/${id}`,
  link: (id) => `link/${id}`,
  invoice: (conn, inv) => `invoice/${conn}/${inv}`,
  account: (acct) => `stripe-account/${acct}`,
  event: (provider, id) => `event/${provider}/${id}`,
};

export function createPayments({ store, env = process.env, now = () => Date.now(), providers = {}, log = console } = {}) {
  const P = {
    stripe: 'stripe' in providers ? providers.stripe : stripeProvider(env),
    paypal: 'paypal' in providers ? providers.paypal : paypalProvider(env),
  };
  const stamp = () => new Date(now()).toISOString();

  /** The site's public address: links printed on invoices must point at production. */
  const siteOrigin = (req) => {
    const configured = env.PUBLIC_SITE_URL || (env.CONTEXT === 'production' ? env.URL : '');
    return (configured || new URL(req.url).origin).replace(/\/+$/, '');
  };

  // ------------------------------------------------------------ records
  const connectionView = (c, label = '') => ({
    id: c.id,
    provider: c.provider,
    status: c.status,
    ready: c.status === 'active',
    label: c.provider === 'paypal' ? c.payee.email_address || c.payee.merchant_id : label,
    createdAt: c.createdAt,
  });

  const linkView = (l) => ({
    id: l.id,
    url: l.url,
    provider: l.provider,
    invoiceId: l.invoiceId,
    number: l.number,
    amount: l.amount,
    currency: l.currency,
    status: l.status,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    paidAt: l.paidAt || null,
    opens: l.opens || 0,
    openedAt: l.openedAt || null,
    replacedBy: l.supersededBy || null,
  });

  /** Apply a status change if it is allowed; for update(): returns undefined when nothing changes. */
  function setStatus(l, status, via) {
    if (l.status === status || !(NEXT[l.status] || []).includes(status)) return undefined;
    l.status = status;
    l.updatedAt = stamp();
    if (status === 'paid') l.paidAt = stamp();
    l.history = [...(l.history || []), { at: stamp(), status, via }].slice(-20);
    return l;
  }

  const isExpired = (l) => PAYABLE.includes(l.status) && Date.parse(l.expiresAt) <= now();
  async function fresh(link) {
    if (!isExpired(link)) return link;
    return (await update(store, K.link(link.id), (l) => (isExpired(l) ? setStatus(l, 'expired', 'expiry') : undefined))) || link;
  }

  async function applyOutcome(linkId, outcome, via, refs = {}) {
    return update(store, K.link(linkId), (l) => {
      // A Stripe session that has finished (or expired) is never offered again.
      const closed = Boolean(refs.sessionId && l.stripe && l.stripe.sessionId === refs.sessionId && l.stripe.url);
      if (closed) l.stripe = { ...l.stripe, url: '', expiresAt: 0 };
      if (!['paid', 'pending', 'failed'].includes(outcome)) return closed ? l : undefined;
      const next = setStatus(l, outcome, via);
      if (next && (refs.sessionId || refs.captureId)) next.reference = refs.sessionId || refs.captureId;
      return next || (closed ? l : undefined);
    });
  }

  async function cancelLink(linkId, reason, replacedBy) {
    const l = await update(store, K.link(linkId), (cur) => {
      const next = setStatus(cur, 'cancelled', reason);
      if (!next) return undefined;
      next.cancelReason = reason;
      if (replacedBy) next.supersededBy = replacedBy;
      return next;
    });
    // Close an open Stripe checkout so nobody can pay the old amount. (PayPal orders
    // are only ever captured by this server, which refuses for a cancelled link.)
    if (l && l.status === 'cancelled' && l.provider === 'stripe' && l.stripe && l.stripe.sessionId && P.stripe) {
      await P.stripe.expireCheckout(l, l.stripe.sessionId).catch((err) => log.error('expire checkout', err.message));
    }
    return l;
  }

  // ------------------------------------------------------------ provider calls
  function providerError(err, provider) {
    if (err instanceof HttpError) return err;
    log.error(`${provider} error`, err && (err.message || err));
    const msg = err && err.message ? String(err.message).slice(0, 300) : 'Unknown error';
    const status = err && (err.statusCode || err.status);
    return new HttpError(status && status < 500 ? 422 : 502, `${NAMES[provider]} couldn't create this payment: ${msg}`, 'provider');
  }

  const sessionMatches = (s, l) => s && s.client_reference_id === l.id && s.amount_total === l.amount && String(s.currency || '').toUpperCase() === l.currency;

  /** A checkout URL for a payable link: the open one if it is still good, else a new one. */
  async function checkoutUrl(link, origin) {
    if (link.provider === 'stripe') {
      const s = link.stripe || {};
      if (s.url && s.expiresAt - now() > STRIPE_REUSE_MS) return s.url;
      const attempt = (link.attempts || 0) + 1;
      const session = await P.stripe.createCheckout(link, { origin, attempt });
      await update(store, K.link(link.id), (l) => {
        l.attempts = Math.max(l.attempts || 0, attempt);
        l.stripe = { sessionId: session.id, url: session.url, expiresAt: session.expiresAt, sessions: [...((l.stripe && l.stripe.sessions) || []), session.id].slice(-50) };
        return l;
      });
      return session.url;
    }
    const o = link.paypal || {};
    if (o.url && now() - o.createdAt < PAYPAL_REUSE_MS) {
      const order = await P.paypal.getOrder(o.orderId);
      if (order.status === 'CREATED' || order.status === 'PAYER_ACTION_REQUIRED') return o.url;
      if (order.status === 'APPROVED' || order.status === 'COMPLETED') {
        await reconcilePayPal(link, o.orderId, 'pay');
        return null; // paid (or processing) now: show the status
      }
    }
    const attempt = (link.attempts || 0) + 1;
    const order = await P.paypal.createOrder(link, { origin, attempt });
    await update(store, K.link(link.id), (l) => {
      l.attempts = Math.max(l.attempts || 0, attempt);
      l.paypal = { orderId: order.id, url: order.url, createdAt: now(), orders: [...((l.paypal && l.paypal.orders) || []), order.id].slice(-50) };
      return l;
    });
    return order.url;
  }

  /** Read a PayPal order and act on it: capture when approved, record the outcome. */
  async function reconcilePayPal(link, orderId, via) {
    let order = await P.paypal.getOrder(orderId);
    let r = orderOutcome(order, link);
    if (r.outcome === 'approved') {
      // Never take money for a link that was replaced, expired or already paid.
      if (!PAYABLE.includes(link.status)) return link;
      try {
        await P.paypal.captureOrder(orderId);
      } catch (err) {
        if (err.issue !== 'ORDER_ALREADY_CAPTURED') throw err;
      }
      order = await P.paypal.getOrder(orderId);
      r = orderOutcome(order, link);
    }
    if (r.outcome && r.outcome !== 'approved') return (await applyOutcome(link.id, r.outcome, via, { captureId: r.capture })) || link;
    if (!r.outcome && r.reason) log.warn(`paypal order ${orderId} for ${link.id}: ${r.reason}`);
    return link;
  }

  /** Ask the provider directly (backs up webhooks). Throttled per link. */
  async function reconcile(link) {
    if (!['unpaid', 'failed', 'pending'].includes(link.status) || now() - (link.checkedAt || 0) < RECHECK_MS) return link;
    await update(store, K.link(link.id), (l) => ({ ...l, checkedAt: now() }));
    try {
      if (link.provider === 'stripe' && P.stripe && link.stripe && link.stripe.sessionId) {
        const s = await P.stripe.retrieveCheckout(link, link.stripe.sessionId);
        let outcome = sessionMatches(s, link) ? sessionOutcome(s) : null;
        // A session can't tell "still settling" from "failed": only an unpaid link becomes pending here.
        if (outcome === 'pending' && link.status !== 'unpaid') outcome = null;
        if (outcome) return (await applyOutcome(link.id, outcome, 'check', { sessionId: s.id })) || link;
      }
      if (link.provider === 'paypal' && P.paypal && link.paypal && link.paypal.orderId) {
        return await reconcilePayPal(link, link.paypal.orderId, 'check');
      }
    } catch (err) {
      log.error('reconcile', link.id, err.message);
    }
    return (await store.get(K.link(link.id))) || link;
  }

  // ------------------------------------------------------------ auth
  async function authenticate(req) {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '');
    const key = m && parseConnectionKey(m[1]);
    if (!key) throw new HttpError(401, 'Connect a payment account first.', 'unauthorized');
    const conn = await store.get(K.connection(key.connectionId));
    if (!conn || !sameHash(key.secret, conn.tokenHash)) throw new HttpError(401, 'This browser is no longer connected to a payment account. Connect it again.', 'unauthorized');
    if (!P[conn.provider]) throw new HttpError(503, `${NAMES[conn.provider]} payments are not available on this site right now.`, 'provider_off');
    return conn;
  }

  async function ownLink(conn, id) {
    const link = LINK_ID.test(id) ? await store.get(K.link(id)) : null;
    if (!link || link.connectionId !== conn.id) throw new HttpError(404, 'Payment link not found.', 'not_found');
    return link;
  }

  // ------------------------------------------------------------ connections
  const stripeUrls = (origin, conn) => ({
    refreshUrl: `${origin}/api/payments/stripe/refresh?c=${conn.id}&s=${conn.onboardingState}`,
    returnUrl: `${origin}/app/?payments=stripe`,
  });

  async function stripeStatus(conn) {
    const s = await P.stripe.accountStatus(conn.account);
    const status = s.chargesEnabled ? 'active' : s.detailsSubmitted ? 'restricted' : 'onboarding';
    const saved = await update(store, K.connection(conn.id), (c) => {
      if (c.status === 'revoked') return undefined;
      Object.assign(c, { chargesEnabled: s.chargesEnabled, detailsSubmitted: s.detailsSubmitted, status, updatedAt: stamp() });
      return c;
    });
    return { conn: saved || conn, label: s.label };
  }

  async function createConnection(req) {
    const body = await readJson(req);
    const provider = body.provider;
    if (!NAMES[provider]) throw new HttpError(400, 'Choose Stripe or PayPal.');
    if (!P[provider]) throw new HttpError(503, `${NAMES[provider]} payments are not set up on this site.`, 'provider_off');
    const id = randomId(16);
    const { key, hash } = newConnectionKey(id);
    const base = { id, provider, tokenHash: hash, createdAt: stamp(), updatedAt: stamp() };

    if (provider === 'paypal') {
      const raw = typeof body.payee === 'string' ? body.payee.trim() : '';
      const payee = EMAIL.test(raw) ? { email_address: raw.toLowerCase() } : MERCHANT_ID.test(raw) ? { merchant_id: raw } : null;
      if (!payee) throw new HttpError(400, 'Enter the email address (or merchant ID) of the PayPal account that should receive payments.', 'payee');
      const conn = { ...base, status: 'active', payee };
      await store.set(K.connection(id), conn, { onlyIfNew: true });
      return json({ key, connection: connectionView(conn) }, 201);
    }

    const origin = siteOrigin(req);
    let account;
    try { account = await P.stripe.createAccount(id); } catch (err) { throw providerError(err, 'stripe'); }
    const conn = { ...base, status: 'onboarding', account, onboardingState: randomId(16), chargesEnabled: false, detailsSubmitted: false };
    await store.set(K.connection(id), conn, { onlyIfNew: true });
    await store.set(K.account(account), { connectionId: id });
    let onboardingUrl;
    try { onboardingUrl = await P.stripe.onboardingUrl(account, stripeUrls(origin, conn)); } catch (err) { throw providerError(err, 'stripe'); }
    return json({ key, connection: connectionView(conn), onboardingUrl }, 201);
  }

  async function disconnect(conn) {
    for (const key of await store.list(`invoice/${conn.id}/`)) {
      const idx = await store.get(key);
      if (idx && idx.linkId) await cancelLink(idx.linkId, 'disconnected');
      await store.delete(key);
    }
    if (conn.account) await store.delete(K.account(conn.account));
    await store.delete(K.connection(conn.id));
    return json({ ok: true });
  }

  // ------------------------------------------------------------ links
  async function createLink(req, conn) {
    if (conn.provider === 'stripe' && conn.status !== 'active') {
      ({ conn } = await stripeStatus(conn));
      if (conn.status !== 'active') {
        throw new HttpError(409, conn.status === 'restricted'
          ? 'Stripe is still reviewing your account, so it cannot take payments yet. Check your Stripe Dashboard, then try again.'
          : 'Finish setting up your Stripe account first.', 'onboarding');
      }
    }
    if (conn.status === 'revoked') throw new HttpError(409, 'Your Stripe account was disconnected from Folio. Connect it again.', 'revoked');
    const fig = amountForInvoice(await readJson(req));
    if (conn.provider === 'paypal' && PAYPAL_UNSUPPORTED.includes(fig.currency)) {
      throw new HttpError(422, `PayPal doesn't accept payments in ${fig.currency}. Use Stripe, or change the invoice currency.`, 'currency');
    }
    const origin = siteOrigin(req);
    const id = readableId(20); // printed on invoices: short, unambiguous, unguessable
    const link = {
      id,
      url: `${origin}/pay/${id}`,
      connectionId: conn.id,
      provider: conn.provider,
      ...fig,
      ...(conn.provider === 'stripe' ? { account: conn.account } : { payee: conn.payee }),
      status: 'unpaid',
      createdAt: stamp(),
      updatedAt: stamp(),
      expiresAt: new Date(now() + LINK_DAYS * DAY).toISOString(),
      opens: 0,
      attempts: 1,
      history: [{ at: stamp(), status: 'unpaid', via: 'created' }],
    };
    // Open the first checkout now: it proves the account can take this payment,
    // in this currency, before the link goes on an invoice.
    try {
      if (link.provider === 'stripe') {
        const s = await P.stripe.createCheckout(link, { origin, attempt: 1 });
        link.stripe = { sessionId: s.id, url: s.url, expiresAt: s.expiresAt, sessions: [s.id] };
      } else {
        const o = await P.paypal.createOrder(link, { origin, attempt: 1 });
        link.paypal = { orderId: o.id, url: o.url, createdAt: now(), orders: [o.id] };
      }
    } catch (err) {
      throw providerError(err, link.provider);
    }
    await store.set(K.link(id), link, { onlyIfNew: true });

    // One live link per invoice: the previous one is cancelled.
    const idxKey = K.invoice(conn.id, fig.invoiceId);
    const prev = await store.get(idxKey);
    await store.set(idxKey, { linkId: id, at: stamp() });
    if (prev && prev.linkId && prev.linkId !== id) await cancelLink(prev.linkId, 'replaced', id);
    return json({ link: linkView(link) }, 201);
  }

  // ------------------------------------------------------------ API router
  async function api(req, url, route) {
    const m = req.method;
    if (route === '/config' && m === 'GET') {
      const k = env.STRIPE_SECRET_KEY || '';
      return json({
        providers: { stripe: Boolean(P.stripe), paypal: Boolean(P.paypal) },
        test: { stripe: Boolean(P.stripe) && !/^(sk|rk)_live_/.test(k), paypal: Boolean(P.paypal) && !P.paypal.live },
        unsupported: { stripe: [], paypal: PAYPAL_UNSUPPORTED },
      }, 200, { 'Cache-Control': 'public, max-age=300' });
    }
    if (route === '/connections' && m === 'POST') return createConnection(req);
    if (route === '/connections/current') {
      const conn = await authenticate(req);
      if (m === 'GET') {
        if (conn.provider === 'stripe' && conn.status !== 'revoked') {
          try {
            const r = await stripeStatus(conn);
            return json({ connection: connectionView(r.conn, r.label) });
          } catch (err) {
            throw providerError(err, 'stripe');
          }
        }
        return json({ connection: connectionView(conn) });
      }
      if (m === 'DELETE') return disconnect(conn);
    }
    if (route === '/connections/current/onboarding' && m === 'POST') {
      const conn = await authenticate(req);
      if (conn.provider !== 'stripe') throw new HttpError(400, 'Only Stripe accounts need onboarding.');
      try {
        return json({ onboardingUrl: await P.stripe.onboardingUrl(conn.account, { ...stripeUrls(siteOrigin(req), conn), update: conn.detailsSubmitted }) });
      } catch (err) {
        throw providerError(err, 'stripe');
      }
    }
    if (route === '/links' && m === 'POST') return createLink(req, await authenticate(req));
    const lm = /^\/links\/([^/]+)$/.exec(route);
    if (lm) {
      const conn = await authenticate(req);
      let link = await ownLink(conn, lm[1]);
      if (m === 'GET') {
        link = await reconcile(await fresh(link));
        return json({ link: linkView(link) });
      }
      if (m === 'DELETE') return json({ link: linkView((await cancelLink(link.id, 'removed')) || link) });
    }
    if (route === '/stripe/refresh' && m === 'GET' && P.stripe) {
      const conn = await store.get(K.connection(String(url.searchParams.get('c') || '').slice(0, 64)));
      if (!conn || conn.provider !== 'stripe' || !conn.onboardingState || conn.onboardingState !== url.searchParams.get('s')) {
        return htmlPage({ title: 'Setup link expired', heading: 'This setup link has expired.', text: 'Go back to Folio and choose Connect Stripe again.', link: { href: '/app/', text: 'Back to Folio' } }, 400);
      }
      try {
        return redirect(await P.stripe.onboardingUrl(conn.account, { ...stripeUrls(siteOrigin(req), conn), update: conn.detailsSubmitted }));
      } catch (err) {
        throw providerError(err, 'stripe');
      }
    }
    if (route === '/webhooks/stripe' && m === 'POST' && P.stripe) return stripeWebhook(req);
    if (route === '/webhooks/paypal' && m === 'POST' && P.paypal) return paypalWebhook(req);
    throw new HttpError(404, 'Not found.');
  }

  // ------------------------------------------------------------ webhooks
  /** Process each event once; if processing fails, forget it so the provider's retry is processed. */
  async function once(provider, id, fn) {
    const marker = K.event(provider, String(id).slice(0, 100));
    if (!(await store.set(marker, { at: now() }, { onlyIfNew: true }))) return json({ received: true, duplicate: true });
    try {
      await fn();
    } catch (err) {
      await store.delete(marker);
      throw err;
    }
    return json({ received: true });
  }

  async function stripeWebhook(req) {
    const raw = await req.text();
    let event;
    try {
      event = P.stripe.verifyWebhook(raw, req.headers.get('stripe-signature'));
    } catch (err) {
      log.warn('stripe webhook rejected:', err.message);
      return json({ error: 'Invalid signature.' }, 400);
    }
    return once('stripe', event.id, async () => {
      const t = event.type;
      const obj = (event.data && event.data.object) || {};
      if (t.startsWith('checkout.session.')) {
        const linkId = (obj.metadata && obj.metadata.folio_link) || obj.client_reference_id;
        const link = typeof linkId === 'string' && LINK_ID.test(linkId) ? await store.get(K.link(linkId)) : null;
        if (!link || link.provider !== 'stripe') return;
        if (event.account !== link.account) return log.warn(`stripe event ${event.id}: not from the link's account`);
        if (!sessionMatches(obj, link)) return log.warn(`stripe event ${event.id}: amount or currency mismatch`);
        await applyOutcome(link.id, sessionOutcome(obj, t), `webhook:${t}`, { sessionId: obj.id });
      } else if (t === 'account.updated' || t === 'account.application.deauthorized') {
        const acct = t === 'account.updated' ? obj.id : event.account;
        const map = acct ? await store.get(K.account(acct)) : null;
        if (!map) return;
        await update(store, K.connection(map.connectionId), (c) => {
          if (t === 'account.application.deauthorized') return { ...c, status: 'revoked', updatedAt: stamp() };
          if (c.status === 'revoked') return undefined;
          const s = statusOf(obj);
          return { ...c, chargesEnabled: s.chargesEnabled, detailsSubmitted: s.detailsSubmitted, status: s.chargesEnabled ? 'active' : s.detailsSubmitted ? 'restricted' : 'onboarding', updatedAt: stamp() };
        });
      }
    });
  }

  async function paypalWebhook(req) {
    const raw = await req.text();
    let event;
    try { event = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    let verified = false;
    try { verified = await P.paypal.verifyWebhook(req.headers, raw); } catch (err) { log.error('paypal verify', err.message); }
    if (!verified) return json({ error: 'Webhook could not be verified.' }, 400);
    return once('paypal', event.id, async () => {
      const type = String(event.event_type || '');
      const r = event.resource || {};
      const pu = r.purchase_units && r.purchase_units[0];
      const linkId = r.custom_id || (pu && pu.custom_id);
      const orderId = type.startsWith('CHECKOUT.ORDER.') ? r.id : r.supplementary_data && r.supplementary_data.related_ids && r.supplementary_data.related_ids.order_id;
      if (typeof linkId !== 'string' || !LINK_ID.test(linkId) || !orderId) return;
      const link = await store.get(K.link(linkId));
      if (!link || link.provider !== 'paypal' || !((link.paypal && link.paypal.orders) || []).includes(orderId)) return;
      await reconcilePayPal(link, orderId, `webhook:${type}`);
    });
  }

  // ------------------------------------------------------------ the client's pages
  function htmlPage(o, status = 200) {
    const nonce = randomId(12);
    return new Response(page({ ...o, nonce }), { status, headers: pageHeaders(nonce) });
  }

  function statusPage(link, { preview = false } = {}) {
    const who = link.business || 'Invoice payment';
    const inv = link.number ? `Invoice ${link.number}` : 'Invoice';
    const amount = money(link.amount, link.currency);
    const via = link.provider === 'stripe' ? 'Secure payment via Stripe' : 'Pay with PayPal';
    const base = { title: `${inv} · ${who}`, label: who, amount };
    switch (link.status) {
      case 'paid':
        return htmlPage({ ...base, mark: 'Paid', heading: `${inv} is paid.`, amountLabel: 'Amount paid', text: 'Thank you. Nothing more is due on this invoice.' });
      case 'pending':
        return htmlPage({ ...base, heading: 'Payment processing.', amountLabel: 'Amount', text: `Your payment is being confirmed by ${NAMES[link.provider]}. You don't need to pay again; you can close this page.` });
      case 'expired':
        return htmlPage({ ...base, heading: 'This payment link has expired.', text: `Contact ${link.business || 'the sender'} for an up-to-date invoice.` }, 410);
      case 'cancelled':
        return htmlPage({ ...base, heading: link.cancelReason === 'replaced' ? 'This payment link has been replaced.' : 'This payment link is no longer active.', text: `The invoice was changed or withdrawn. Contact ${link.business || 'the sender'} for the latest invoice.` }, 410);
      default: {
        const failed = link.status === 'failed';
        return htmlPage({
          ...base,
          heading: inv,
          text: failed ? "The last payment attempt didn't go through. Nothing was charged; you can try again." : preview ? `Preview: your client is taken straight on to ${NAMES[link.provider]}'s payment page.` : `Opening ${NAMES[link.provider]}'s secure payment page…`,
          form: { action: `/pay/${link.id}`, text: 'Pay invoice', via, auto: !failed && !preview, preview },
        });
      }
    }
  }

  async function payer(req, url, rest) {
    const [id, action = '', extra] = rest.split('/');
    const notFound = () => htmlPage({ title: 'Payment link not found', heading: 'Payment link not found.', text: 'Check the link on your invoice, or contact the business that sent it.' }, 404);
    if (!LINK_ID.test(id || '') || extra !== undefined) return notFound();
    let link = await store.get(K.link(id));
    if (!link) return notFound();
    link = await fresh(link);
    const unavailable = () => htmlPage({ title: 'Payment unavailable', label: link.business, heading: 'Payment is unavailable right now.', text: 'Nothing was charged. Please try again in a few minutes.', link: { href: `/pay/${link.id}`, text: 'Try again' } }, 502);
    if (!P[link.provider]) return unavailable();

    if (req.method === 'POST' && action === '') {
      if (!PAYABLE.includes(link.status)) return redirect(`/pay/${link.id}`);
      const form = new URLSearchParams(await req.text().catch(() => ''));
      if (!form.has('preview')) {
        link = (await update(store, K.link(link.id), (l) => ({ ...l, opens: (l.opens || 0) + 1, openedAt: l.openedAt || stamp() }))) || link;
      }
      try {
        const to = await checkoutUrl(link, siteOrigin(req));
        return redirect(to || `/pay/${link.id}`);
      } catch (err) {
        log.error('checkout', link.id, err.message);
        return unavailable();
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST' } });

    if (action === '') return statusPage(link, { preview: url.searchParams.has('preview') });
    if (action === 'cancel') {
      if (!PAYABLE.includes(link.status)) return statusPage(link);
      return htmlPage({ title: 'Payment cancelled', label: link.business, heading: 'Payment cancelled.', text: 'Nothing was charged.', link: { href: `/pay/${link.id}`, text: 'Return to payment' } });
    }
    if (action === 'done' && link.provider === 'stripe') {
      // Stripe sends the payer here; the status is read from Stripe, not from the address.
      const sid = url.searchParams.get('session_id') || '';
      if (link.stripe && (link.stripe.sessions || []).includes(sid)) {
        try {
          const s = await P.stripe.retrieveCheckout(link, sid);
          if (sessionMatches(s, link)) link = (await applyOutcome(link.id, sessionOutcome(s), 'return', { sessionId: s.id })) || link;
        } catch (err) {
          log.error('stripe return', link.id, err.message);
        }
      }
      return statusPage(link);
    }
    if (action === 'paypal' && link.provider === 'paypal') {
      const orderId = url.searchParams.get('token') || '';
      if (link.paypal && (link.paypal.orders || []).includes(orderId)) {
        try {
          link = await reconcilePayPal(link, orderId, 'return');
        } catch (err) {
          log.error('paypal return', link.id, err.message);
          return htmlPage({ title: 'Payment not completed', label: link.business, heading: "PayPal couldn't complete the payment.", text: 'Nothing was charged. You can try again.', link: { href: `/pay/${link.id}`, text: 'Try again' } }, 502);
        }
      }
      return statusPage(link);
    }
    return notFound();
  }

  // ------------------------------------------------------------ entry point
  async function handle(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const isPay = path.startsWith('/pay/');
    try {
      if (path.startsWith('/api/payments/')) return await api(req, url, path.slice('/api/payments'.length));
      if (isPay) return await payer(req, url, path.slice('/pay/'.length));
      throw new HttpError(404, 'Not found.');
    } catch (err) {
      if (!(err instanceof HttpError)) log.error(err);
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : 'Something went wrong. Try again in a moment.';
      if (isPay) return htmlPage({ title: 'Payment unavailable', heading: 'Payment is unavailable right now.', text: 'Nothing was charged. Please try again in a few minutes.' }, status >= 500 ? 502 : status);
      return json({ error: message, code: err.code }, status);
    }
  }

  return { handle, providers: P };
}

/** Delete records past their retention (scheduled daily). */
export async function cleanup({ store, now = () => Date.now(), retentionDays = 400 } = {}) {
  const cutoff = now() - retentionDays * DAY;
  let removed = 0;
  for (const key of await store.list('link/')) {
    const l = await store.get(key);
    if (l && Date.parse(l.createdAt) < cutoff) {
      const idx = await store.get(K.invoice(l.connectionId, l.invoiceId));
      if (idx && idx.linkId === l.id) await store.delete(K.invoice(l.connectionId, l.invoiceId));
      await store.delete(key);
      removed += 1;
    }
  }
  for (const key of await store.list('event/')) {
    const ev = await store.get(key);
    if (!ev || ev.at < now() - 30 * DAY) await store.delete(key);
  }
  // Stripe onboarding that was started and never finished.
  for (const key of await store.list('connection/')) {
    const c = await store.get(key);
    if (c && c.status === 'onboarding' && Date.parse(c.createdAt) < now() - 30 * DAY && !(await store.list(`invoice/${c.id}/`)).length) {
      if (c.account) await store.delete(K.account(c.account));
      await store.delete(key);
      removed += 1;
    }
  }
  return { removed };
}

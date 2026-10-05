// Payment links: node --test tests/unit.payments.test.mjs
// The payments server runs against local stand-ins for the Stripe and PayPal
// APIs (tests/fixtures/payment-providers.mjs), with real Stripe signatures.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jsQR from 'jsqr';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { startSite } from './fixtures/site-server.mjs';
import { amountForInvoice } from '../server/payments/invoice.mjs';
import { memoryStore, blobStore, update } from '../server/payments/store.mjs';
import { createPayments, cleanup, LINK_DAYS } from '../server/payments/index.mjs';
import { parseConnectionKey, readableId } from '../server/payments/util.mjs';
import { computeTotals } from '../src/scripts/core/calc.js';
import { createInvoice, createItem, normalizeInvoice } from '../src/scripts/core/model.js';
import { currencyDigits, CURRENCIES } from '../src/scripts/core/format.js';
import { encodeQr, qrSvg, qrRuns } from '../src/scripts/core/qr.js';
import { normalizePaylink, paylinkState, amountDue } from '../src/scripts/core/paylink.js';
import { renderInvoice } from '../src/scripts/core/render.js';

// ---------------------------------------------------------------- helpers
const FIG = (over = {}) => ({
  id: 'inv_test0001',
  number: 'INV-0042',
  currency: 'USD',
  project: 'Website redesign',
  business: 'Marlow Studio',
  items: [{ quantity: '2', price: '1200' }, { quantity: '3', price: '79.99' }],
  adjustments: { taxRate: '8.25', discountType: 'percent', discountValue: '10', shipping: '25', paid: '' },
  ...over,
});

let site;
let now = Date.parse('2026-10-05T12:00:00Z');
const clock = () => now;
before(async () => { site = await startSite({ now: clock }); });
after(async () => { await site.close(); });

async function call(method, route, { body, key, raw, headers = {} } = {}) {
  const res = await fetch(site.origin + route, {
    method,
    redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers },
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

/** A Stripe connection that has finished onboarding. */
async function stripeConnection() {
  const c = await call('POST', '/api/payments/connections', { body: { provider: 'stripe' } });
  assert.equal(c.status, 201);
  site.stripe.activate([...site.stripe.state.accounts.keys()].pop());
  return c.data.key;
}
async function paypalConnection(payee = 'owner@example.com') {
  const c = await call('POST', '/api/payments/connections', { body: { provider: 'paypal', payee } });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  return c.data.key;
}
const createLink = (key, invoice = FIG()) => call('POST', '/api/payments/links', { key, body: { invoice } });

// ---------------------------------------------------------------- the amount
test('amount: computed on the server from the figures, never accepted from the browser', () => {
  const f = amountForInvoice({ invoice: FIG() });
  // subtotal 2,639.97 − 10% (264.00) = 2,375.97; tax 8.25% = 196.02; + 25 shipping = 2,596.99
  assert.equal(f.amount, 259699);
  assert.equal(f.currency, 'USD');
  assert.equal(f.invoiceId, 'inv_test0001');
  // a deposit is subtracted: the link charges the amount due
  assert.equal(amountForInvoice({ invoice: FIG({ adjustments: { paid: '596.99' } }) }).amount, 204298); // 2,639.97 − 596.99
  const deposit = amountForInvoice({ invoice: FIG({ items: [{ quantity: '1', price: '1000' }], adjustments: { paid: '250' } }) });
  assert.equal(deposit.amount, 75000);
  // zero-decimal currency: yen are whole units
  assert.equal(amountForInvoice({ invoice: FIG({ currency: 'JPY', items: [{ quantity: '3', price: '333.4' }], adjustments: {} }) }).amount, 1000);
  for (const bad of [{ amount: 1 }, { total: 1 }, { due: 5 }]) {
    assert.throws(() => amountForInvoice({ invoice: { ...FIG(), ...bad } }), /calculated by the server/);
    assert.throws(() => amountForInvoice({ invoice: FIG(), ...bad }), /calculated by the server/);
  }
  assert.throws(() => amountForInvoice({ invoice: FIG({ currency: 'XXX' }) }), /currency/i);
  assert.throws(() => amountForInvoice({ invoice: FIG({ items: [] }) }), /items/);
  assert.throws(() => amountForInvoice({ invoice: FIG({ items: [{ quantity: '1', price: '0' }], adjustments: {} }) }), /Nothing is due/);
  assert.throws(() => amountForInvoice({ invoice: FIG({ items: [{ quantity: '1', price: 'x'.repeat(40) }] }) }), /Invalid item/);
  assert.throws(() => amountForInvoice({ invoice: FIG({ id: '../../etc' }) }), /invoice id/);
});

test('amount: the server and the app agree for every currency and 300 random invoices', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 300; i++) {
    const currency = CURRENCIES[i % CURRENCIES.length][0];
    const inv = createInvoice({ currency });
    inv.items = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => createItem({ quantity: (rnd() * 20).toFixed(rnd() < 0.5 ? 0 : 2), price: (rnd() * 3000).toFixed(2) }));
    inv.adjustments = { ...inv.adjustments, taxRate: (rnd() * 25).toFixed(3), discountType: rnd() < 0.5 ? 'percent' : 'amount', discountValue: (rnd() * 30).toFixed(2), shipping: (rnd() * 90).toFixed(2), paid: rnd() < 0.3 ? (rnd() * 500).toFixed(2) : '' };
    const app = amountDue(computeTotals(inv), currency);
    if (!(app > 0)) continue;
    const server = amountForInvoice({ invoice: { id: inv.id, number: inv.meta.number, currency, items: inv.items.map(({ quantity, price }) => ({ quantity, price })), adjustments: inv.adjustments } });
    assert.equal(server.amount, app, `invoice ${i} (${currency})`);
    assert.equal(server.digits, currencyDigits(currency));
  }
});

// ---------------------------------------------------------------- authorization
test('authorization: links need the connection key that made them', async () => {
  const key = await stripeConnection();
  const other = await stripeConnection();
  assert.equal((await createLink(undefined)).status, 401);
  assert.equal((await createLink('fpc_nonsense')).status, 401);
  const { connectionId } = parseConnectionKey(key);
  assert.equal((await createLink(`fpc_${connectionId}.${'A'.repeat(43)}`)).status, 401, 'right connection, wrong secret');
  const made = await createLink(key);
  assert.equal(made.status, 201);
  const id = made.data.link.id;
  assert.equal((await call('GET', `/api/payments/links/${id}`, { key })).status, 200);
  assert.equal((await call('GET', `/api/payments/links/${id}`, { key: other })).status, 404, "another user's link is invisible");
  assert.equal((await call('DELETE', `/api/payments/links/${id}`, { key: other })).status, 404);
  assert.equal((await call('GET', `/api/payments/links/${id}`)).status, 401);
  assert.equal((await call('POST', '/api/payments/links', { key, raw: 'invoice=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415);
  // the store never holds a working key
  const stored = JSON.stringify([...site.store.data.values()]);
  assert.ok(!stored.includes(key.split('.')[1]), 'only a hash of the secret is stored');
});

// ---------------------------------------------------------------- Stripe
test('stripe: onboarding first; then a Checkout Session on the user’s own account for the stored amount', async () => {
  const c = await call('POST', '/api/payments/connections', { body: { provider: 'stripe' } });
  assert.equal(c.status, 201);
  assert.equal(c.data.connection.ready, false);
  assert.match(c.data.onboardingUrl, /\/onboarding\/acct_/);
  const account = [...site.stripe.state.accounts.values()].pop();
  assert.deepEqual(account.controller, { fees: { payer: 'account' }, losses: { payments: 'stripe' }, stripe_dashboard: { type: 'full' } });
  const early = await createLink(c.data.key);
  assert.equal(early.status, 409);
  assert.equal(early.data.code, 'onboarding');
  site.stripe.activate(account.id);
  assert.equal((await call('GET', '/api/payments/connections/current', { key: c.data.key })).data.connection.ready, true);

  const made = await createLink(c.data.key);
  assert.equal(made.status, 201);
  const link = made.data.link;
  assert.equal(link.amount, 259699);
  assert.equal(link.currency, 'USD');
  assert.equal(link.status, 'unpaid');
  assert.match(link.id, /^[0-9a-hjkmnp-tv-z]{20}$/, 'a readable, unguessable id');
  assert.equal(link.url, `${site.origin}/pay/${link.id}`);
  const req = site.stripe.state.requests.filter((r) => r.path === '/v1/checkout/sessions').pop();
  assert.equal(req.account, account.id, 'created on the connected account (Stripe-Account header)');
  assert.ok(req.idempotency, 'with an idempotency key');
  const li = req.body.line_items[0];
  assert.equal(li.price_data.unit_amount, '259699');
  assert.equal(li.price_data.currency, 'usd');
  assert.equal(li.price_data.product_data.name, 'Invoice INV-0042');
  assert.equal(req.body.client_reference_id, link.id);
  assert.deepEqual(Object.keys(req.body.metadata).sort(), ['folio_invoice', 'folio_link', 'folio_user', 'invoice_number']);
  assert.equal(req.body.metadata.folio_invoice, 'inv_test0001');
  assert.ok(!('customer_email' in req.body), 'no client email is sent');
  assert.ok(!JSON.stringify(req.body).includes('Harbor'), 'no client name is sent');
});

test('stripe: verified webhooks set the status; forged, mismatched and repeated events change nothing', async () => {
  const key = await stripeConnection();
  const { link } = (await createLink(key, FIG({ id: 'inv_webhook1' }))).data;
  const session = site.stripe.lastSession();
  // forged: wrong secret
  const Stripe = (await import('stripe')).default;
  const forger = new Stripe('sk_test_x');
  const body = JSON.stringify({ id: 'evt_forged', type: 'checkout.session.completed', account: session.account, data: { object: { ...session, status: 'complete', payment_status: 'paid' } } });
  const forged = await call('POST', '/api/payments/webhooks/stripe', { raw: body, headers: { 'Content-Type': 'application/json', 'Stripe-Signature': forger.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_wrong' }) } });
  assert.equal(forged.status, 400);
  assert.equal((await call('POST', '/api/payments/webhooks/stripe', { raw: body, headers: { 'Content-Type': 'application/json' } })).status, 400, 'unsigned');
  assert.equal((await call('GET', `/api/payments/links/${link.id}`, { key })).data.link.status, 'unpaid');
  // genuine but for a different amount: ignored
  await site.stripe.deliver('checkout.session.completed', { ...session, status: 'complete', payment_status: 'paid', amount_total: 1 }, session.account);
  // genuine but from another Stripe account: ignored
  await site.stripe.deliver('checkout.session.completed', { ...session, status: 'complete', payment_status: 'paid' }, 'acct_someoneelse');
  now += 60_000;
  site.stripe.state.holdWebhooks = true;
  assert.equal((await call('GET', `/api/payments/links/${link.id}`, { key })).data.link.status, 'unpaid');
  site.stripe.state.holdWebhooks = false;
  // genuine: paid; delivered twice: processed once
  session.status = 'complete';
  session.payment_status = 'paid';
  const r1 = await site.stripe.deliver('checkout.session.completed', session, session.account);
  assert.equal(r1.status, 200);
  const evt = site.stripe.state.events[site.stripe.state.events.length - 1];
  const again = await call('POST', '/api/payments/webhooks/stripe', { raw: JSON.stringify(evt), headers: { 'Content-Type': 'application/json', 'Stripe-Signature': forger.webhooks.generateTestHeaderString({ payload: JSON.stringify(evt), secret: site.stripe.webhookSecret }) } });
  assert.equal(again.data.duplicate, true);
  const paid = (await call('GET', `/api/payments/links/${link.id}`, { key })).data.link;
  assert.equal(paid.status, 'paid');
  assert.ok(paid.paidAt);
});

test('stripe: bank payments go pending, then paid or failed; the return page reads Stripe, not the address', async () => {
  const key = await stripeConnection();
  const { link } = (await createLink(key, FIG({ id: 'inv_async01' }))).data;
  const s = site.stripe.lastSession();
  await site.stripe.complete(s, { paid: false });
  assert.equal((await call('GET', `/api/payments/links/${link.id}`, { key })).data.link.status, 'pending');
  await site.stripe.deliver('checkout.session.async_payment_failed', s, s.account);
  now += 60_000; // past the re-check interval: asking Stripe again must not undo "failed"
  assert.equal((await call('GET', `/api/payments/links/${link.id}`, { key })).data.link.status, 'failed');
  // the client can try again, in a new checkout (the finished one is never reused)
  const retry = await fetch(link.url, { method: 'POST', redirect: 'manual' });
  assert.notEqual(retry.headers.get('location'), s.url);
  assert.match(retry.headers.get('location'), /\/checkout\/cs_test_/);

  // A failed link can be paid again; this time the webhook is late, so the return page asks Stripe.
  const { link: l2 } = (await createLink(key, FIG({ id: 'inv_return1' }))).data;
  site.stripe.state.holdWebhooks = true;
  const post = await fetch(l2.url, { method: 'POST', redirect: 'manual' });
  assert.equal(post.status, 303);
  const checkout = await fetch(post.headers.get('location').replace(/\/checkout\/([^/]+)$/, '/checkout/$1/pay'), { method: 'POST', redirect: 'manual' });
  site.stripe.state.holdWebhooks = false;
  const back = checkout.headers.get('location');
  assert.match(back, /\/done\?session_id=cs_test_/);
  const forgedReturn = await fetch(`${l2.url}/done?session_id=cs_test_not_this_links`);
  assert.doesNotMatch(await forgedReturn.text(), /is paid/, 'an unknown session id proves nothing');
  const page = await (await fetch(back)).text();
  assert.match(page, /Invoice INV-0042 is paid\./);
  assert.equal((await call('GET', `/api/payments/links/${l2.id}`, { key })).data.link.status, 'paid');
});

test('lifecycle: regenerating replaces the link and closes its checkout; the old address says so', async () => {
  const key = await stripeConnection();
  const first = (await createLink(key, FIG({ id: 'inv_regen01' }))).data.link;
  const oldSession = site.stripe.lastSession();
  const second = (await createLink(key, FIG({ id: 'inv_regen01', items: [{ quantity: '1', price: '500' }], adjustments: {} }))).data.link;
  assert.equal(second.amount, 50000);
  assert.notEqual(second.id, first.id);
  const old = (await call('GET', `/api/payments/links/${first.id}`, { key })).data.link;
  assert.equal(old.status, 'cancelled');
  assert.equal(old.replacedBy, second.id);
  assert.equal(site.stripe.session(oldSession.id).status, 'expired', 'the open checkout for the old amount was expired');
  const page = await fetch(first.url);
  assert.equal(page.status, 410);
  assert.match(await page.text(), /This payment link has been replaced\./);
  const post = await fetch(first.url, { method: 'POST', redirect: 'manual' });
  assert.equal(post.headers.get('location'), `/pay/${first.id}`, 'no checkout for a replaced link');
  // removing a link cancels it
  assert.equal((await call('DELETE', `/api/payments/links/${second.id}`, { key })).data.link.status, 'cancelled');
});

test('lifecycle: links expire after 180 days; disconnecting cancels links and the key stops working', async () => {
  const key = await stripeConnection();
  const { link } = (await createLink(key, FIG({ id: 'inv_expire1' }))).data;
  const saved = now;
  now += (LINK_DAYS + 1) * 24 * 3600 * 1000;
  try {
    assert.equal((await call('GET', `/api/payments/links/${link.id}`, { key })).data.link.status, 'expired');
    const page = await fetch(link.url);
    assert.equal(page.status, 410);
    assert.match(await page.text(), /expired/);
  } finally {
    now = saved;
  }
  const { link: l2 } = (await createLink(key, FIG({ id: 'inv_disc001' }))).data;
  assert.equal((await call('DELETE', '/api/payments/connections/current', { key })).status, 200);
  assert.equal((await call('GET', `/api/payments/links/${l2.id}`, { key })).status, 401);
  assert.equal((await fetch(l2.url)).status, 410);
});

test('payer page: a hand-off to the provider, safe from link scanners, private', async () => {
  const key = await stripeConnection();
  const { link } = (await createLink(key, FIG({ id: 'inv_payer01' }))).data;
  const res = await fetch(link.url);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /<form method="post" action="\/pay\//);
  assert.match(html, /document\.getElementById\('pay'\)\.submit\(\)/, 'real browsers continue straight to the provider');
  assert.match(html, /\$2,596\.99/);
  assert.match(html, /Secure payment via Stripe/);
  assert.match(res.headers.get('content-security-policy'), /script-src 'nonce-/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.doesNotMatch(html, /googletagmanager|gtag/, 'the payer is never tracked');
  // GET is harmless: no checkout, no "opened"
  const before = site.stripe.state.sessions.size;
  await fetch(link.url);
  assert.equal(site.stripe.state.sessions.size, before);
  assert.equal((await call('GET', `/api/payments/links/${link.id}`, { key })).data.link.opens, 0);
  // the sender's preview neither forwards nor counts
  const preview = await (await fetch(`${link.url}?preview`)).text();
  assert.doesNotMatch(preview, /\.submit\(\)/);
  await fetch(link.url, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'preview=1' });
  assert.equal((await call('GET', `/api/payments/links/${link.id}`, { key })).data.link.opens, 0);
  // a real click: counted, and the open checkout is reused rather than duplicated
  const post = await fetch(link.url, { method: 'POST', redirect: 'manual' });
  assert.equal(post.status, 303);
  assert.equal(post.headers.get('location'), site.stripe.lastSession().url);
  assert.equal(site.stripe.state.sessions.size, before);
  assert.equal((await call('GET', `/api/payments/links/${link.id}`, { key })).data.link.opens, 1);
  assert.equal((await fetch(`${site.origin}/pay/doesnotexist000000`)).status, 404);
  assert.equal((await fetch(`${site.origin}/pay/${link.id}/x/y`)).status, 404);
});

// ---------------------------------------------------------------- PayPal
test('paypal: payee, currencies, and an order for the stored amount paid to the user', async () => {
  assert.equal((await call('POST', '/api/payments/connections', { body: { provider: 'paypal', payee: 'not an email' } })).status, 400);
  const key = await paypalConnection('Owner@Example.com');
  assert.equal((await createLink(key, FIG({ id: 'inv_pp_inr', currency: 'INR' }))).status, 422);
  const yen = await createLink(key, FIG({ id: 'inv_pp_jpy', currency: 'JPY', items: [{ quantity: '3', price: '333.4' }], adjustments: {} }));
  assert.equal(yen.status, 201);
  assert.equal(site.paypal.lastOrder().purchase_units[0].amount.value, '1000', 'no decimals for yen');
  const { link } = (await createLink(key)).data;
  const pu = site.paypal.lastOrder().purchase_units[0];
  assert.deepEqual(pu.amount, { currency_code: 'USD', value: '2596.99' });
  assert.deepEqual(pu.payee, { email_address: 'owner@example.com' });
  assert.equal(pu.custom_id, link.id);
  assert.match(pu.description, /^Invoice INV-0042/);
  assert.ok(!JSON.stringify(site.paypal.lastOrder()).includes('Harbor'), 'no client details');
  const bad = await paypalConnection('invalid@example.com');
  const refused = await createLink(bad, FIG({ id: 'inv_pp_bad' }));
  assert.equal(refused.status, 422, 'PayPal refuses an invalid payee before the link exists');
  assert.match(refused.data.error, /Payee account/);
});

test('paypal: approval → capture on return → paid; webhooks verified; a replaced link is never captured', async () => {
  const key = await paypalConnection();
  const { link } = (await createLink(key, FIG({ id: 'inv_pp_flow' }))).data;
  const post = await fetch(link.url, { method: 'POST', redirect: 'manual' });
  assert.match(post.headers.get('location'), /\/checkoutnow\//);
  const approve = await fetch(`${post.headers.get('location')}/approve`, { method: 'POST', redirect: 'manual' });
  const back = await (await fetch(approve.headers.get('location'))).text();
  assert.match(back, /is paid\./);
  assert.equal((await call('GET', `/api/payments/links/${link.id}`, { key })).data.link.status, 'paid');

  // unverified webhook: rejected
  const fake = await call('POST', '/api/payments/webhooks/paypal', { raw: JSON.stringify({ id: 'WH-x', event_type: 'CHECKOUT.ORDER.APPROVED', resource: {} }), headers: { 'Content-Type': 'application/json', 'PayPal-Transmission-Id': 't', 'PayPal-Transmission-Sig': 'forged', 'PayPal-Cert-Url': 'https://x' } });
  assert.equal(fake.status, 400);

  // the payer approves and closes the tab: the verified webhook captures
  site.paypal.state.holdWebhooks = true;
  const { link: l2 } = (await createLink(key, FIG({ id: 'inv_pp_hook' }))).data;
  const order = site.paypal.approve(site.paypal.lastOrder().id);
  site.paypal.state.holdWebhooks = false;
  const hook = await site.paypal.deliver('CHECKOUT.ORDER.APPROVED', order);
  assert.equal(hook.status, 200);
  assert.equal((await call('GET', `/api/payments/links/${l2.id}`, { key })).data.link.status, 'paid');
  assert.equal(order.status, 'COMPLETED');

  // replaced before the payer finished: approval is never captured
  site.paypal.state.holdWebhooks = true;
  const { link: l3 } = (await createLink(key, FIG({ id: 'inv_pp_repl' }))).data;
  const o3 = site.paypal.lastOrder();
  await createLink(key, FIG({ id: 'inv_pp_repl', items: [{ quantity: '1', price: '10' }], adjustments: {} }));
  site.paypal.approve(o3.id);
  site.paypal.state.holdWebhooks = false;
  await site.paypal.deliver('CHECKOUT.ORDER.APPROVED', o3);
  const back3 = await (await fetch(`${l3.url}/paypal?token=${o3.id}&PayerID=X`)).text();
  assert.match(back3, /replaced/);
  assert.equal(o3.status, 'APPROVED', 'no money taken for the old amount');
  assert.equal((await call('GET', `/api/payments/links/${l3.id}`, { key })).data.link.status, 'cancelled');
});

// ---------------------------------------------------------------- config, storage, cleanup
test('config: providers follow the environment; secrets never leave the server', async () => {
  const { data } = await call('GET', '/api/payments/config');
  assert.deepEqual(data.providers, { stripe: true, paypal: true });
  assert.deepEqual(data.unsupported.paypal, ['INR', 'ZAR']);
  assert.ok(!JSON.stringify(data).includes('sk_test'));
  const off = createPayments({ store: memoryStore(), env: {} });
  const r = await off.handle(new Request('http://x/api/payments/config'));
  assert.deepEqual((await r.json()).providers, { stripe: false, paypal: false });
  const refused = await off.handle(new Request('http://x/api/payments/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"provider":"stripe"}' }));
  assert.equal(refused.status, 503);
});

test('storage: the Netlify Blobs adapter keeps conditional writes (against a local Blobs server)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'blobs-'));
  const server = new BlobsServer({ directory: dir, token: 'tok' });
  const { port } = await server.start();
  try {
    const url = `http://127.0.0.1:${port}`;
    const store = blobStore(getStore({ name: 'folio-payments', edgeURL: url, uncachedEdgeURL: url, token: 'tok', siteID: 'site', consistency: 'strong' }));
    assert.equal(await store.get('link/a'), null);
    assert.equal(await store.set('link/a', { n: 1 }, { onlyIfNew: true }), true);
    assert.equal(await store.set('link/a', { n: 2 }, { onlyIfNew: true }), false, 'onlyIfNew keeps the first write');
    const cur = await store.getWithEtag('link/a');
    assert.deepEqual(cur.value, { n: 1 });
    assert.equal(await store.set('link/a', { n: 3 }, { onlyIfMatch: '"stale"' }), false);
    const next = await update(store, 'link/a', (v) => ({ n: v.n + 1 }));
    assert.deepEqual(next, { n: 2 });
    assert.deepEqual(await store.list('link/'), ['link/a']);
    await store.delete('link/a');
    assert.equal(await store.get('link/a'), null);
  } finally {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanup: old records are deleted; recent ones stay', async () => {
  const store = memoryStore();
  await store.set('link/old', { id: 'old', connectionId: 'c', invoiceId: 'i', createdAt: '2025-01-01T00:00:00Z' });
  await store.set('invoice/c/i', { linkId: 'old' });
  await store.set('link/new', { id: 'new', connectionId: 'c', invoiceId: 'j', createdAt: '2026-10-01T00:00:00Z' });
  await store.set('event/stripe/e1', { at: Date.parse('2026-01-01') });
  const r = await cleanup({ store, now: () => Date.parse('2026-10-05') });
  assert.equal(r.removed, 1);
  assert.deepEqual(await store.list(''), ['link/new']);
});

test('ids: readable link ids carry 100 bits and avoid ambiguous letters', () => {
  const ids = new Set(Array.from({ length: 2000 }, () => readableId()));
  assert.equal(ids.size, 2000);
  for (const id of ids) assert.match(id, /^[0-9a-hjkmnp-tv-z]{20}$/);
});

// ---------------------------------------------------------------- QR codes
function decode(text, opts) {
  const qr = encodeQr(text, opts);
  const scale = 4;
  const margin = 4;
  const n = (qr.size + margin * 2) * scale;
  const px = new Uint8ClampedArray(n * n * 4).fill(255);
  qr.modules.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + margin) * scale + dy) * n + (x + margin) * scale + dx) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }));
  return { qr, data: (jsQR(px, n, n) || {}).data };
}

test('qr: codes decode for every error-correction level, many lengths and UTF-8', () => {
  const base = 'https://folioinvoice.com/pay/k3x9m2q7v8w4p1t6r5n0';
  for (const ecl of ['L', 'M', 'Q', 'H']) {
    for (const len of [1, 20, 49, 80, 150, 300]) {
      const text = (base + 'abcdefghjkmnpqrstvwxyz0123456789'.repeat(12)).slice(0, len);
      assert.equal(decode(text, { ecl }).data, text, `${ecl} ${len}`);
    }
  }
  assert.equal(decode('Rechnung №42 — €1.234,56').data, 'Rechnung №42 — €1.234,56');
  const typical = decode(base);
  assert.equal(typical.qr.version, 4, 'a payment link fits version 4 (33 × 33)');
  const svg = qrSvg(base, { cls: 'doc__qr' });
  assert.match(svg, /^<svg class="doc__qr" viewBox="0 0 37 37"/);
  assert.match(svg, /data-qr="https:\/\/folioinvoice\.com\/pay\/k3x9m2q7v8w4p1t6r5n0"/);
  const dark = typical.qr.modules.flat().filter(Boolean).length;
  assert.equal(qrRuns(typical.qr).reduce((s, r) => s + r[2], 0), dark, 'runs cover every dark module');
});

// ---------------------------------------------------------------- the invoice
test('invoice: the payment link is validated, shown only while it matches, and never for another amount', () => {
  const inv = createInvoice({ number: 'INV-0042' });
  inv.items = [createItem({ description: 'Design', quantity: '2', price: '1200' })];
  const totals = computeTotals(inv);
  const good = { id: 'k3x9m2q7v8w4p1t6r5n0', url: 'https://folioinvoice.com/pay/k3x9m2q7v8w4p1t6r5n0', provider: 'stripe', amount: 240000, currency: 'USD', number: 'INV-0042', status: 'unpaid', createdAt: '2026-10-05T00:00:00Z', paidAt: '', onInvoice: true, qr: true };
  assert.deepEqual(normalizePaylink(good), good);
  for (const bad of [{ url: 'javascript:alert(1)//pay/k3x9m2q7v8w4p1t6r5n0' }, { url: 'https://evil.com/other/k3x9m2q7v8w4p1t6r5n0' }, { url: 'http://folioinvoice.com/pay/k3x9m2q7v8w4p1t6r5n0' }, { provider: 'venmo' }, { amount: -5 }, { amount: 1.5 }, { currency: 'XXX' }, { id: 'other0000000000000000' }]) {
    assert.equal(normalizePaylink({ ...good, ...bad }), null, JSON.stringify(bad));
  }
  assert.equal(normalizeInvoice({ ...inv, paylink: { ...good, url: '"><script>' } }).paylink, null);

  inv.paylink = { ...good };
  assert.equal(paylinkState(inv, totals), 'unpaid');
  let html = renderInvoice(inv, totals);
  assert.match(html, /<a class="doc__pay-btn" href="https:\/\/folioinvoice\.com\/pay\/k3x9m2q7v8w4p1t6r5n0">Pay invoice/);
  assert.match(html, /Secure payment via Stripe/);
  assert.match(html, /folioinvoice\.com\/pay\/k3x9m2q7v8w4p1t6r5n0<\/p>/, 'the address is printed for paper');
  assert.match(html, /<svg class="doc__qr"/);
  inv.paylink.qr = false;
  assert.doesNotMatch(renderInvoice(inv, totals), /doc__qr/);
  inv.paylink.onInvoice = false;
  assert.doesNotMatch(renderInvoice(inv, totals), /doc__pay-btn/, 'not on the invoice until added');
  inv.paylink.onInvoice = true;

  // the total changes: the link is no longer shown
  inv.items[0].price = '1300';
  const t2 = computeTotals(inv);
  assert.equal(paylinkState(inv, t2), 'changed');
  assert.doesNotMatch(renderInvoice(inv, t2), /doc__pay-btn|\/pay\//);
  inv.items[0].price = '1200';
  inv.meta.currency = 'EUR';
  assert.equal(paylinkState(inv, computeTotals(inv)), 'changed', 'a different currency is a different amount');
  inv.meta.currency = 'USD';
  inv.meta.number = 'INV-0043';
  assert.equal(paylinkState(inv, totals), 'renumbered');
  inv.meta.number = 'INV-0042';

  // paid: a Paid mark instead of the button
  inv.paylink.status = 'paid';
  inv.paylink.paidAt = '2026-10-07T10:00:00Z';
  html = renderInvoice(inv, totals);
  assert.match(html, /doc__paid-mark">Paid<\/span><span class="doc__paid-on">Oct 7, 2026/);
  assert.doesNotMatch(html, /doc__pay-btn/);
  for (const s of ['expired', 'cancelled', 'pending']) {
    inv.paylink.status = s;
    assert.doesNotMatch(renderInvoice(inv, totals), /doc__pay-btn|doc__paid/, s);
  }
});

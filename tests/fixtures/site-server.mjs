/**
 * The site as deployed, for the tests: dist/ served statically (tests/serve.cjs)
 * and the payments function mounted at /api/payments/* and /pay/*, wired to the
 * mock Stripe and PayPal APIs (tests/fixtures/payment-providers.mjs).
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { createPayments } from '../../server/payments/index.mjs';
import { memoryStore } from '../../server/payments/store.mjs';
import { mockStripe, mockPayPal } from './payment-providers.mjs';

const require = createRequire(import.meta.url);
const { createServer: createStatic } = require('../serve.cjs');

const readBuffer = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
});

/** Node request → Fetch Request → payments → Node response. */
export function mount(app, origin) {
  return async (req, res) => {
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBuffer(req);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const response = await app.handle(new Request(new URL(req.url, origin()), { method: req.method, headers, body }));
    const out = {};
    response.headers.forEach((v, k) => (out[k] = v));
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}

/**
 * Start the site with payments. Returns { origin, stripe, paypal, store, app, close }.
 * Options: { stripe: true, paypal: true, env: {...}, now }
 */
export async function startSite({ stripe = true, paypal = true, env = {}, now, log, port = 0 } = {}) {
  const s = stripe ? await mockStripe() : null;
  const p = paypal ? await mockPayPal() : null;
  const store = memoryStore();
  let origin = '';
  const app = createPayments({
    store,
    now,
    log: log || { error() {}, warn() {} },
    env: {
      ...(s ? { STRIPE_SECRET_KEY: s.secretKey, STRIPE_WEBHOOK_SECRET: s.webhookSecret, FOLIO_TEST_STRIPE_API: s.origin } : {}),
      ...(p ? { PAYPAL_CLIENT_ID: p.clientId, PAYPAL_CLIENT_SECRET: p.clientSecret, PAYPAL_WEBHOOK_ID: p.webhookId, FOLIO_TEST_PAYPAL_API: p.origin } : {}),
      ...env,
    },
  });
  const serveStatic = createStatic().listeners('request')[0];
  const payments = mount(app, () => origin);
  const server = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path.startsWith('/api/payments/') || path.startsWith('/pay/')) return payments(req, res);
    return serveStatic(req, res);
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  if (s) s.state.webhookUrl = `${origin}/api/payments/webhooks/stripe`;
  if (p) p.state.webhookUrl = `${origin}/api/payments/webhooks/paypal`;
  return {
    origin,
    stripe: s,
    paypal: p,
    store,
    app,
    async close() {
      await new Promise((r) => server.close(r));
      if (s) await s.close();
      if (p) await p.close();
    },
  };
}

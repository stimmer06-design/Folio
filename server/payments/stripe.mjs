/**
 * Stripe, through the official Node SDK.
 *
 * Folio is a Stripe Connect platform. Each Folio user who connects Stripe gets
 * their own Stripe account (created here, completed on Stripe's hosted
 * onboarding pages) with the full Stripe Dashboard; Stripe charges its fees to
 * that account and covers losses, and Folio takes no fee. Every payment is a
 * Checkout Session created *on the user's account* (Stripe-Account header), so
 * the money never passes through Folio.
 *
 * Environment: STRIPE_SECRET_KEY (platform secret key), STRIPE_WEBHOOK_SECRET
 * (signing secret of the Connect webhook endpoint). FOLIO_TEST_STRIPE_API
 * points the SDK at a local mock in the test suite.
 */
import Stripe from 'stripe';

export function stripeProvider(env = process.env) {
  if (!env.STRIPE_SECRET_KEY) return null;
  const opts = { maxNetworkRetries: 2, timeout: 20000, appInfo: { name: 'Folio invoice payment links' } };
  if (env.FOLIO_TEST_STRIPE_API) {
    const u = new URL(env.FOLIO_TEST_STRIPE_API);
    Object.assign(opts, { host: u.hostname, port: u.port, protocol: u.protocol.replace(':', '') });
  }
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, opts);
  const on = (account) => ({ stripeAccount: account });

  return {
    name: 'stripe',
    label: 'Stripe',
    webhooks: Boolean(env.STRIPE_WEBHOOK_SECRET),

    /** A new connected account with Standard-account behaviour (full Dashboard, Stripe-collected requirements). */
    async createAccount(connectionId) {
      const account = await stripe.accounts.create({
        controller: { fees: { payer: 'account' }, losses: { payments: 'stripe' }, stripe_dashboard: { type: 'full' } },
        metadata: { folio_connection: connectionId },
      }, { idempotencyKey: `folio-account-${connectionId}` });
      return account.id;
    },

    /** A one-time URL for Stripe's hosted onboarding (or for updating details later). */
    async onboardingUrl(account, { refreshUrl, returnUrl, update = false }) {
      const link = await stripe.accountLinks.create({
        account,
        type: update ? 'account_update' : 'account_onboarding',
        refresh_url: refreshUrl,
        return_url: returnUrl,
      });
      return link.url;
    },

    async accountStatus(account) {
      const a = await stripe.accounts.retrieve(account);
      return statusOf(a);
    },

    /** A Checkout Session for the stored amount on the user's own account. */
    async createCheckout(link, { origin, attempt }) {
      const meta = { folio_link: link.id, folio_invoice: link.invoiceId, invoice_number: link.number, folio_user: link.connectionId };
      const name = link.number ? `Invoice ${link.number}` : 'Invoice';
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        submit_type: 'pay',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: link.currency.toLowerCase(),
            unit_amount: link.amount,
            product_data: { name, ...(link.description ? { description: link.description } : {}) },
          },
        }],
        client_reference_id: link.id,
        metadata: meta,
        payment_intent_data: { description: name, metadata: meta },
        success_url: `${origin}/pay/${link.id}/done?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pay/${link.id}/cancel`,
      }, { ...on(link.account), idempotencyKey: `folio-checkout-${link.id}-${attempt}` });
      return { id: session.id, url: session.url, expiresAt: (session.expires_at || 0) * 1000 };
    },

    async retrieveCheckout(link, sessionId) {
      return stripe.checkout.sessions.retrieve(sessionId, {}, on(link.account));
    },

    /** Close an open session so nobody can pay it (used when a link is replaced or removed). */
    async expireCheckout(link, sessionId) {
      try {
        await stripe.checkout.sessions.expire(sessionId, {}, on(link.account));
      } catch (err) {
        // Already completed or expired: nothing to close.
        if (!(err && err.type === 'StripeInvalidRequestError')) throw err;
      }
    },

    /** Verify the Stripe-Signature header and return the event (throws if it doesn't match). */
    verifyWebhook(rawBody, signature) {
      if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
      return stripe.webhooks.constructEvent(rawBody, signature || '', env.STRIPE_WEBHOOK_SECRET);
    },

    statusOf,
  };
}

/** What Folio needs to know about a connected account. */
export function statusOf(a) {
  return {
    chargesEnabled: Boolean(a.charges_enabled),
    detailsSubmitted: Boolean(a.details_submitted),
    disabledReason: (a.requirements && a.requirements.disabled_reason) || '',
    label: (a.settings && a.settings.dashboard && a.settings.dashboard.display_name) || (a.business_profile && a.business_profile.name) || a.email || '',
  };
}

/**
 * What a Checkout Session means for the link it belongs to.
 * paid: money received. pending: the payer finished, but the payment method
 * settles later (bank debits). failed: a delayed payment failed.
 */
export function sessionOutcome(session, eventType = 'checkout.session.completed') {
  if (eventType === 'checkout.session.async_payment_succeeded') return 'paid';
  if (eventType === 'checkout.session.async_payment_failed') return 'failed';
  if (eventType === 'checkout.session.expired') return 'expired-session';
  if (session.status === 'complete' && session.payment_status === 'paid') return 'paid';
  if (session.status === 'complete' && session.payment_status === 'unpaid') return 'pending';
  if (session.status === 'expired') return 'expired-session';
  return null;
}

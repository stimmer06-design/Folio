/**
 * Stripe and PayPal webhooks. Kept apart from the API so they are never
 * rate-limited; every delivery is verified (signature / PayPal verification).
 */
import { payments } from '../../server/payments/netlify.mjs';

export default (req) => payments().handle(req);

export const config = {
  path: ['/api/payments/webhooks/stripe', '/api/payments/webhooks/paypal'],
  method: 'POST',
};

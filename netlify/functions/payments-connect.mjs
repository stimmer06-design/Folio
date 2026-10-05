/**
 * Connecting Stripe or PayPal. The one call that needs no connection key, and
 * the one that creates Stripe accounts, so it has its own, much lower limit.
 */
import { payments } from '../../server/payments/netlify.mjs';

export default (req) => payments().handle(req);

export const config = {
  path: '/api/payments/connections',
  method: 'POST',
  rateLimit: { windowSize: 60, windowLimit: 6, aggregateBy: ['ip', 'domain'] },
};

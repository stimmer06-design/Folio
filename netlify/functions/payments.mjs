/**
 * Payment links: the API used by the invoice generator, and the /pay/<id>
 * pages a client opens from an invoice. See server/payments/index.mjs.
 */
import { payments } from '../../server/payments/netlify.mjs';

export default (req) => payments().handle(req);

export const config = {
  path: ['/api/payments/config', '/api/payments/connections/*', '/api/payments/links', '/api/payments/links/*', '/api/payments/stripe/*', '/pay/*'],
  // Per visitor: generous for people, a ceiling for scripts.
  rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip', 'domain'] },
};

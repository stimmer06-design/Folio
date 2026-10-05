/**
 * Daily: delete payment-link records older than about 13 months, webhook
 * markers older than 30 days, and Stripe onboarding that was never finished.
 */
import { cleanup } from '../../server/payments/index.mjs';
import { paymentsStore } from '../../server/payments/netlify.mjs';

export default async () => {
  const { removed } = await cleanup({ store: paymentsStore() });
  console.log(`payments cleanup: removed ${removed} records`);
};

export const config = { schedule: '@daily' };

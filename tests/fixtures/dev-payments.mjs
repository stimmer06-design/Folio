/**
 * Try payment links locally, with stand-ins for Stripe and PayPal:
 *   npm run dev:payments            → http://localhost:8080/app/
 * The stand-ins show their own test pages for onboarding, checkout and
 * approval, and send signed webhooks back, so every step can be clicked
 * through without a Stripe or PayPal account. Data is kept in memory.
 */
import { startSite } from './site-server.mjs';

const port = Number(process.argv[2]) || 8080;
const site = await startSite({ port, log: console });
console.log(`Folio with test payment providers: ${site.origin}/app/`);
console.log(`  Stripe stand-in ${site.stripe.origin} · PayPal stand-in ${site.paypal.origin}`);
console.log('  Press Ctrl+C to stop.');

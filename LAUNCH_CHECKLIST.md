# Launch checklist

Replace `example.com` below with your real domain.

## Before launch

### Configure
- [ ] `src/site.json` updated:
  - `url`: `https://example.com` (no trailing slash; the build refuses anything else)
  - `email`, `supportEmail` and `legalName` set to real values
- [ ] Production build passes: `npm run build:prod`; deploy the `dist/` folder
- [ ] Unit tests pass: `npm run test:unit`
- [ ] End-to-end tests pass: `npm test` (this also builds and runs the SEO checks)
- [ ] GA4 configured:
  - `PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX` set in the host's build environment
  - site rebuilt

### Host and domain
- [ ] Host set up (`netlify.toml` already sets these on Netlify):
  - build command `node build.mjs --production`
  - publish directory `dist`
  - Node 22
  - deployed from Git or with `netlify deploy --prod` (drag-and-drop deploys can't include the payment functions)
- [ ] Production domain configured, with DNS pointing at the host
- [ ] HTTPS working; `http://` redirects to `https://`
- [ ] `www.example.com` redirects (301) to `https://example.com`
- [ ] Redirects work. `dist/_redirects` is read by Netlify and Cloudflare Pages; on any other host, add these three rules:
  - `/invoice-templates/design-studio/` → `/invoice-templates/designer/`
  - `/invoice-templates/home-services/` → `/invoice-templates/landscaper/`
  - `/free-invoice-generator/` → `/`

### Verify the live site
- [ ] `https://example.com/sitemap.xml` lists 46 URLs, all on `https://example.com`
- [ ] `https://example.com/robots.txt` shows:
  - `Disallow: /app/?`
  - `Sitemap: https://example.com/sitemap.xml`
  - `Disallow: /pay/` and `Disallow: /api/`
  - no `/_seo/`
- [ ] `https://example.com/_seo/` returns 404 (the production build leaves it out)
- [ ] Canonicals: view source on a few pages. `<link rel="canonical">` is `https://example.com/…/`.
- [ ] Analytics and privacy behaviour:
  - GA4 → Reports → Realtime shows your own visit
  - `/privacy/` says the site uses Google Analytics
  - a browser with Do Not Track or Global Privacy Control on, or a European time zone, sends nothing

### Payment links (optional; skip to launch without them)
- [ ] Stripe:
  - Connect platform set up, with your name and icon under Connect → Branding
  - `STRIPE_SECRET_KEY` set in Netlify (Functions scope, secret)
  - Connect webhook `https://example.com/api/payments/webhooks/stripe` for events on connected accounts: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `account.updated`, `account.application.deauthorized`
  - its signing secret set as `STRIPE_WEBHOOK_SECRET`
- [ ] PayPal:
  - REST app created; `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` set
  - webhook `https://example.com/api/payments/webhooks/paypal` for Checkout order approved and Payment capture completed, pending, denied and declined; its ID set as `PAYPAL_WEBHOOK_ID`
  - `PAYPAL_ENV=live` once sandbox testing is done
- [ ] Site redeployed; `https://example.com/api/payments/config` lists the providers you set up
- [ ] Test mode, end to end, for each provider:
  - connect, create a link, add it to an invoice
  - open the link from the PDF and pay (Stripe test card 4242 4242 4242 4242; a PayPal sandbox buyer)
  - the editor shows Paid, and the Stripe webhook log shows 200 responses
- [ ] Switched to live keys and webhooks, then one real low-value payment, refunded from your Stripe or PayPal Dashboard

### Search Console
- [ ] Search Console Domain property `example.com` created and verified with a DNS TXT record
- [ ] Sitemap `https://example.com/sitemap.xml` submitted
- [ ] Important URLs inspected with URL Inspection, and indexing requested:
  - `/`
  - `/invoice-generator/`
  - `/invoice-templates/`
  - `/invoice-templates/contractor/`
  - `/invoice-guides/how-to-make-an-invoice/`
  - `/tools/invoice-number-generator/`

### GA4 settings (take two minutes, and aren't retroactive)
- [ ] Custom definitions, event-scoped: `template`, `page_type`, `cta`, `via`
- [ ] Enhanced measurement: "Form interactions" turned off

### Final manual checks on the live site
- [ ] Homepage: loads, and "Create an invoice" opens the generator
- [ ] Generator:
  - create an invoice and switch templates
  - reload and it is still there
  - download the PDF and open it
  - Print shows only the invoice
- [ ] Template page: preview shows, and "Customize this invoice" opens the generator with that template and example
- [ ] Guide and tool:
  - each loads
  - the calculator updates
  - "Create an invoice with these numbers" carries the figures over
- [ ] Font: choose a font, reload, switch template; the font stays, and the PDF uses it
- [ ] Mobile, on a real phone:
  - the menu works
  - the Edit and Preview tabs work
  - Download PDF works

## After launch
- [ ] Get the first real users. Post where people who invoice already ask for help.
- [ ] Watch analytics weekly (GA4, or `/_seo/` locally).
- [ ] Watch Search Console: impressions, queries and pages.
- [ ] Watch which landing pages receive traffic.
- [ ] Watch which templates are opened.
- [ ] Watch the invoice creation rate.
- [ ] Watch the PDF export rate.
- [ ] Identify the biggest funnel drop-off.
- [ ] Talk to actual users.
- [ ] Make small changes only when the data or users point to a real problem.

## Do not build yet
- More SEO pages
- More templates
- Accounts
- Subscriptions
- AI features
- Complex dashboards
- Referral systems
- Large redesigns
- Huge content systems
- Features based purely on assumptions

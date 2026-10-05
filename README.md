# Folio — free online invoice generator

Folio is two things built as one product:

1. **The invoice generator** at `/app/`. It is a working application, not a demo. You enter your business and client details, add as many line items as you need, add tax, discount and shipping, and see a live, print-accurate preview. You can then download a typeset PDF or print. Invoices are saved in the browser, and you can reopen, create, duplicate, delete, back up and restore them. There is no account. Two optional extras: **payment links** (the client pays the invoice online through Stripe or PayPal; needs the small server function described in "Payment links") and **invoice fonts** (any template in another font, including fonts from the user's device).
2. **The product website** that surrounds it: Home, Features, Pricing, About, FAQ, Contact, Privacy and Terms. Every page leads to **Create an invoice**, which opens the real app.

The sample invoice on the marketing pages is drawn by the same renderer the app uses, so what visitors see is exactly what they will get.

3. **The template library**: 14 invoice layouts (Classic, Modern, Minimal, Editorial, Executive, Professional, Agency, Freelancer, Consultant, Design Studio, Photographer, Contractor, Construction, Home Services). You can choose one in the app at any time without changing the invoice data. The library is at `/invoice-templates/`, with a page for each template at `/invoice-templates/<slug>/`. "Use this template" links to `/app/?template=<id>`.

```
Home ── "Create an invoice" ──▶ /app/ ──▶ fill in ──▶ Download PDF / Print
```

## Run it

```bash
npm install          # dev only: Playwright + axe-core for tests
npm run build        # → dist/  (plain static files; deploy anywhere)
npm run build:prod   # the same, without the /_seo/ dashboard
npm run serve        # http://localhost:8080
npm run dev:payments # the same, plus payment links against local stand-ins for Stripe and PayPal
npm test             # build + unit tests + end-to-end QA
```

`dist/` needs nothing but a static host. The app uses ES modules, so it must be served over http(s), not opened from `file://`. Payment links additionally need the Netlify Functions in `netlify/functions/` (see "Payment links"); without them the payment-link section simply doesn't appear.

## Structure

```
build.mjs                     Static build: pages + content database → dist/, CSS bundle, sitemap, robots
build/                        content loader, Markdown, SEO helpers, dashboard (see "SEO" below)
src/
  site.json                   Name, domain, emails, Pro price, contact form endpoint
  content/faq.json            FAQ (rendered to the page AND to FAQPage structured data)
  layouts/site.html           Marketing layout (header, footer)
  layouts/app.html            Application layout (app bar, no marketing chrome)
  content/templates|guides|tools   the content database (see "SEO" below)
  pages/                      index, features, pricing, about, faq, contact, privacy, terms, 404, app,
                              invoice-generator, and the hubs: invoice-templates, invoice-guides, tools
  partials/                   header, footer, CTA, plans, interface fragments, sample documents
  scripts/
    core/      ← no DOM; shared by the app and the build
      format.js               money, dates, parsing, rounding
      model.js                invoice model, payment terms, numbering, validation of stored data
      calc.js                 totals: lines → subtotal → discount → tax → shipping → total
      render.js               invoice document → HTML (preview, print, marketing samples)
      pdf.js                  vector PDF with jsPDF + embedded fonts (loaded lazily)
      store.js                saved-invoice library in localStorage (logos de-duplicated)
      logo.js                 logo upload: validate, resize, compress
      templates.js            the template registry: layout, typography, fields, copy, sample data
      sample.js               builds a template's example invoice
      paylink.js              an invoice's payment link and whether it still matches the invoice
      qr.js                   QR code encoder (SVG for screen and print, vector squares in the PDF)
      fonts.js                invoice fonts: the curated list, size matching, the runtime registry
      sfnt.js                 reads font files: TrueType or CFF, characters, names, WOFF → TTF
    app/       ← the application UI
      main.js                 controller: autosave, actions, print, backup, tabs
      editor.js               binds the form to the model
      preview.js              live preview, scaled to fit
      library.js              "Your invoices" panel
      picker.js               "Choose a template" sheet (live previews of the user's own invoice)
      payments.js             the payment-link block: connect, create, regenerate, status
      fonts.js                the user's own fonts: device fonts, uploads (IndexedDB), PDF embedding
      fontpicker.js           the "Font" picker (popover; bottom sheet on phones)
    site/                     marketing-page scripts (header, menu, reveal, contact form, funnel events)
    tools/                    the free tools
    growth/                   the growth dashboard: metrics, Google APIs, CSV (dev builds only)
  styles/
    tokens/base/type/layout   the design system
    components/               header, buttons, fields, document (the invoice), FAQ, footer…
    marketing/                home and inner pages
    app/                      app shell, editor, preview, library, print
  assets/                     fonts (web + PDF subsets), invoice fonts, icons, og.jpg, manifest
  vendor/jspdf.umd.min.js     jsPDF 4.2.1 (MIT), the only browser dependency
server/payments/              the payment-link server (runs as Netlify Functions; see "Payment links")
netlify/functions/            payments.mjs (API + /pay pages), payments-webhooks.mjs, payments-cleanup.mjs
netlify.toml                  build command, publish directory, functions
tools/make-invoice-fonts.py   rebuilds src/assets/invoice-fonts from the upstream font releases
tests/
  unit.test.mjs               core logic (node --test)
  unit.payments.test.mjs      payment server: amounts, authorization, lifecycle, webhooks, QR codes
  unit.fonts.test.mjs         font files, size matching, invoice font field
  e2e.test.cjs                product flow, mobile devices, PDF, print, a11y, SEO, layout, payments, fonts
  fixtures/                   stand-ins for Stripe, PayPal and Google; the site + payments server for tests
```

## Templates

A template is configuration only (`core/templates.js`). The invoice stores just `meta.template`, so switching layouts never changes the content. Each entry chooses a **composition**, which is one of seven arrangements in `core/render.js`: split, letterhead, title, sidebar, statement, minimal and ledger. Each entry also sets a face (the brand's Garamond or Grotesk), a density, column labels (for example Hours and Rate), optional item groups with subtotals (Labor, Materials…), document wording (Project, Engagement, Shoot…), its page copy and realistic sample data. Every composition is built from the same document parts and the same hairline and label styles in `components/document.css`.

To add a layout, add one entry to `TEMPLATES`, and a page for it in `src/content/templates/` (a unit test checks every layout has one). Its card in the picker and its PDF export follow automatically; the page follows from the content entry. Only add a composition, a function in `render.js` plus a block of CSS, when a genuinely new arrangement is needed.

Earlier invoices that stored `meta.typeface` open as Classic (serif) or Modern (sans) and look exactly as before.

## SEO: one content model, many pages

The marketing site is also a search-driven way into the generator: search → template, guide or tool page → **Customize this invoice** or **Create an invoice with these numbers** → the real generator → PDF. Every one of these pages is generated from a single content database, so none of them is hand-copied.

```
src/content/
  templates/<slug>.json   → /invoice-templates/<slug>/   20 template pages (16 layouts + 4 trades that reuse one)
  guides/<slug>.md        → /invoice-guides/<slug>/      10 guides (Markdown + front matter)
  tools/<slug>.md         → /tools/<slug>/               3 tools (+ partials/tool-<slug>.html, scripts/tools/<slug>.js)
  redirects.json          old URL → new URL (301 in dist/_redirects, plus a noindex refresh page)
  faq.json                site FAQ (entries flagged "generator" also appear on /invoice-generator/)
build/
  content.mjs             loads and validates the database; the internal linking engine
  markdown.mjs            the small Markdown renderer for guides and tools
  seo.mjs                 JSON-LD, breadcrumbs, sitemap, robots.txt, redirects, the page audit
  dashboard.mjs           /_seo/, the unlisted content dashboard
```

**Adding a page.** Add one file, then `npm run build`. Its page, title tag, meta description, canonical, Open Graph and Twitter tags, H1, breadcrumbs (visible and BreadcrumbList), structured data, hub card, related links in both directions and sitemap entry are all generated. The build stops with a list of problems if an entry has a title over 65 characters, a description outside 80–165, a missing field, a link to a page that doesn't exist, a related slug that doesn't exist, a guide under 700 words, or a duplicate title or description. Set `status: draft` to hold an entry back; drafts appear only on the dashboard. The dashboard has a skeleton for each kind of entry.

**Template pages** use a layout from `core/templates.js` (`"layout": "contractor"`) and may bring their own example (`"sample"`). The plumber page uses the Contractor layout with a plumbing job, for instance. **Customize this invoice** opens `/app/?template=<slug>&example`. The generator then reads `assets/data/templates.json`, built from the same entries, and opens that page's own example in the right layout, without overwriting business details the user has already saved. **Start with a blank one** opens the layout empty.

**Guides** are Markdown with headings, lists, tables, `> notes` and `[links](/invoice-templates/…)`. Two embeds are available: `[[invoice: <template> | caption]]`, which renders a real invoice with the generator's renderer, and `[[generator: Button text]]`. A final `## Frequently asked questions` section becomes the page FAQ and its FAQPage data. `howto: <heading>` marks the numbered list under that heading as HowTo steps; it is used only on the four guides that really are step-by-step.

**Tools** run in the browser and use the generator's own code (`core/calc.js`, `core/tools.js`). No tax rate is built in. Each tool hands its figures to the generator through parameters. The app validates them, starts a new invoice and removes them from the address bar:

`/app/?number= &item= &qty= &price= &tax= &taxLabel= &discount= &discountType= &shipping= &paid= &currency=`

**Internal links** come from each entry's `relatedTemplates`, `relatedGuides` and `relatedTools`. These are reciprocated automatically (a guide that names a template appears on that template's page) and topped up from the same category. Blocks are capped at three or four links. Guides also link in their text, and the footer links every hub.

**Structured data.** The pages carry the following, describing only what is on the page:

- Organization and WebSite on the homepage
- SoftwareApplication on the homepage and WebApplication on `/app/` and each tool
- Article on guides
- FAQPage wherever a FAQ is visible, matching it question for question
- HowTo on the step-by-step guides
- BreadcrumbList and ItemList on hubs

There are no ratings, reviews or invented prices.

**Crawling.** `robots.txt` allows everything except `/app/?…`, the generator's address-bar states, and `/_seo/`. Canonical URLs are absolute, use a trailing slash and never include parameters. The sitemap lists every indexable page, with `lastmod` for content pages. Redirects for renamed slugs (`design-studio` → `designer`, `home-services` → `landscaper`) and for `/free-invoice-generator/` (→ the homepage, which targets that query) are in `dist/_redirects` for Netlify or Cloudflare Pages. Other hosts need the same three rules.

**The dashboard** (`/_seo/`) lists every page with its type, title and description lengths, H1, word count, internal links in and out, schema types, canonical and any issues: thin, orphaned, or a missing H1 or breadcrumbs. It is `noindex` and disallowed, but it is a public file. Build for production with `npm run build:prod` to leave it out.

## Analytics and the growth dashboard

**One event layer.** `core/track.js` records every product event: `track(name, props)`.

- **Shared code.** The marketing pages, the generator and the tools all use it. It's bundled into `site.js`, and imported by the app and tools.
- **What each event carries:**
  - only allow-listed property names, each with a short slug-like value;
  - the page path, page type and content slug;
  - the device class (mobile, tablet or desktop);
  - the visit's acquisition: source, medium, campaign, landing page and referring site.
- **How acquisition is decided:** from campaign (`utm_*`) tags, then the referrer. For example, google.com is classed as organic and reddit.com as social; with no referrer, the visit is direct. It's kept for the browser tab in `sessionStorage`, with no cookie.
- **Where events go:** each is kept in `window.folioEvents` and announced as a `folio:track` DOM event. Providers listen for that event, and product code never calls a vendor.
- **Never recorded:** anything typed into an invoice, query strings, full referrer URLs, or a visitor identifier.

| Event | When |
| --- | --- |
| `seo_page_view` | A template, guide, tool, hub or `/invoice-generator/` page is viewed (plus `template_view`, `guide_view` and `tool_view`) |
| `template_selected` | A template is chosen: Customize, Start blank, Use template, or the generator's picker |
| `generator_cta_clicked` | Any link into the generator, with `cta` naming where it sits: header, bottom, article, tool, card… |
| `tool_used` | A tool's inputs are first changed |
| `invoice_generator_opened` | The generator loads, with `via` (template, tool, guide, home, site or direct), `template` and `from_page` |
| `invoice_started` | A new invoice: blank, an example, prefilled by a tool, or a duplicate |
| `invoice_created` | The first edit of an invoice, or its first export with content; once per invoice (`app/usage.js`) |
| `pdf_downloaded`, `print_clicked` | Exports, attributed to the template page the invoice came from |

**Google Analytics 4** (`core/analytics.js`) is a listener on that event. It is off unless a measurement ID is set.

- **Configuring it.** Set `PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX npm run build`, or `analytics.ga4MeasurementId` in `src/site.json`. Without an ID, nothing is loaded or sent and the site is unchanged.
- **How it behaves when on:**
  - gtag.js loads after the page, when the browser is idle;
  - page addresses are sent without query strings, keeping only `utm_*` tags;
  - referrers are reduced to their origin;
  - Google signals and ad personalisation are off;
  - visitors whose browser sends Global Privacy Control or Do Not Track are not measured.
- **The privacy notice** changes with the setting, so it always describes what is actually running.
- **Consent.** GA4 sets cookies, and the site asks for no consent, so visitors in the EEA, the UK and Switzerland are not measured. GA4 doesn't run in browsers set to a European time zone, and Consent Mode denies analytics storage for any other visit Google locates there. Everyone else is measured with analytics cookies and no advertising storage. Measuring European visitors would need a consent banner first.
- **Another provider** (Plausible, PostHog or a server endpoint) would be one more listener: replay `window.folioEvents`, then listen for `folio:track`.

**Setting up GA4**

1. Create a GA4 property and a web data stream. Build with its measurement ID.
2. In GA4 → Admin → Custom definitions, register these as **event-scoped custom dimensions**: `template`, `page_type`, `cta` and `via`. The dashboard's Setup section shows which are missing.
3. In GA4 → Admin → Data streams → Enhanced measurement, turn off "Form interactions". The site's own events cover the forms that matter.

**The growth dashboard** is at `/_seo/`, above the SEO audit.

It shows:
- an overview against the previous period;
- the funnel (visitor → SEO page → generator → invoice → PDF), with the biggest drop-off marked;
- *What should I do next?*;
- content opportunities;
- landing pages, templates, content by type, traffic sources, and Search Console pages and queries.

Date ranges are 7, 28 or 90 days, or custom. CSV export covers the funnel, pages, templates and search pages.

**Connecting the dashboard to your data**

- **No backend is needed.** You sign in with Google's own popup, and the page receives a short-lived, read-only token that is kept in memory only. Reports come straight from the GA4 Data API and the Search Console API.
- **Setup:**
  - Create a **Web** OAuth client in Google Cloud. Enable the *Google Analytics Data API* and the *Google Search Console API*, and add the dashboard's origin (for example `http://localhost:8080`) as an authorised JavaScript origin.
  - Build with `GA4_PROPERTY_ID=<numeric property id>`, `GOOGLE_OAUTH_CLIENT_ID=<client id>` and, optionally, `SEARCH_CONSOLE_SITE=sc-domain:example.com`.
- **Without the API**, import Search Console's Performance export: the Pages.csv and Queries.csv files from its zip. The import stays in your browser.

**What the dashboard will and won't show**

- It shows only measured data. Comparisons with the previous period appear only when that period has data.
- An observation is made only once there is enough data, and pages are compared only with this site's own pages. The thresholds are in `growth/metrics.js` (`MIN`).
- It distinguishes three empty states: not set up, connected but nothing measured, and a measured zero.

**Where the dashboard runs.** The dashboard page holds no analytics data itself. Data appears only for someone who signs in with access to the GA4 property. `npm run build:prod` leaves the dashboard and its scripts out entirely; run it locally with `npm run build && npm run serve`, then open `http://localhost:8080/_seo/`.

## Payment links

A user creates an invoice, clicks **Create Stripe payment link** (or PayPal), and gets a link for that invoice's amount due. **Add to invoice** puts a quiet **PAY INVOICE →** button on the invoice, with the address printed under it and, optionally, a QR code. It works in the preview, the PDF (a clickable link and a vector QR code) and print. The client clicks it and pays on Stripe's or PayPal's own pages, and the invoice turns **Paid**.

### How it works

```
browser (invoice in localStorage)          Netlify Function (server/payments)              Stripe / PayPal
  Create link ── invoice figures ─────────▶ recompute the amount due (core/calc.js) ────▶ Checkout Session / order
              ◀─ link id + URL + amount ── store the link (Netlify Blobs)                  on the user's account
  invoice: PAY INVOICE → /pay/<id>
client opens /pay/<id> ─────────────────▶ checkout for the STORED amount ─────────────▶ hosted payment page
                                          ◀── signed webhook / server-side capture ───── paid
  status (polled while open) ◀──────────── paid · pending · failed · expired · cancelled
```

- **There are no Folio user accounts.** Connecting Stripe or PayPal issues a random *connection key* that only the user's browser holds (`localStorage["folio:payments"]`; it also travels in the backup file). The server stores a hash of it. Every API call that creates, reads, regenerates or cancels a link must carry it, and a link can only be read or changed with the key of the connection that created it.
- **Amounts are never taken from the browser.** The browser sends the invoice's figures (quantities, prices, tax, discount, shipping, deposit, currency); a request that contains any amount field is rejected. The server recomputes the amount due with the same `core/calc.js` the app uses, stores it, and every checkout is created from the stored amount. The app checks that the server's amount equals the invoice's before it shows the link.
- **The link stays right for the invoice.** If the amount due, the currency or the number changes, the button disappears from the invoice and the editor says "Invoice total changed — payment link needs to be regenerated." Regenerating creates a new link and cancels the old one on the server (an open Stripe checkout for it is expired; a PayPal approval for it is never captured). Old PDFs then show "This payment link has been replaced."
- **Status comes only from Stripe and PayPal**: verified webhooks (Stripe signature with the official SDK; PayPal's verify-webhook-signature API), the server's own PayPal capture, and server-side checks when the app asks. Statuses: `unpaid`, `pending` (bank payments that settle later), `paid`, `failed`, `expired` (links last 180 days), `cancelled`.
- **Stripe:** Folio is a Stripe Connect platform. "Connect Stripe" creates the user's own Stripe account (full Stripe Dashboard, Stripe's fees charged to them, Folio takes nothing) and sends them through Stripe's hosted onboarding. Each payment is a Checkout Session created on their account, with metadata `folio_link`, `folio_invoice`, `invoice_number` and `folio_user` (the connection id).
- **PayPal:** PayPal's partner onboarding needs PayPal's approval, so Folio uses PayPal's documented *pay another account* checkout (Orders v2): the order names the user's PayPal email as the payee, the client approves on paypal.com, Folio captures it, and the money goes straight to the user. Folio can't verify that the email belongs to the user, so the editor asks them to check it. PayPal doesn't accept INR or ZAR, so the app offers Stripe for those.
- **What is sent and stored:** the invoice id, number, currency, project line, business name and the amount due. Never the client's name, email or address, line descriptions, notes or logo. Records are deleted about 13 months after a link is created (`payments-cleanup`, daily); disconnecting cancels the connection's links and deletes it.
- **Pages at /pay/<id>** are plain HTML from the function (noindex, no analytics, strict Content-Security-Policy). They forward real browsers straight to Stripe or PayPal; mail-client link scanners, which don't submit forms, never open a checkout.
- **Analytics:** `payment_link_created`, `payment_link_clicked` and `invoice_payment_completed` (with `provider`, `template`, `layout`, `page_type`), reported from the sender's own generator. The person who pays is never tracked.

### Set it up (Netlify)

Deploy from Git, or with `netlify deploy --prod`. Drag-and-drop deploys upload static files only, so they can't include the functions. `netlify.toml` sets the build (`node build.mjs --production`, `dist`) and the functions directory. Netlify Blobs needs no setup.

Environment variables (Site configuration → Environment variables; mark the secrets as secret, scope them to Functions):

| Variable | |
|---|---|
| `STRIPE_SECRET_KEY` | the Stripe platform's secret key (`sk_test_…` while testing, then `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | signing secret of the Connect webhook endpoint (`whsec_…`) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | your PayPal REST app's credentials |
| `PAYPAL_WEBHOOK_ID` | the ID of that app's webhook |
| `PAYPAL_ENV` | `live` for real payments; anything else uses the PayPal sandbox |
| `PUBLIC_SITE_URL` | optional: the address printed in links (default: the production URL Netlify reports) |

Set only Stripe's or only PayPal's variables to offer one provider. With neither, the payment-link section doesn't appear.

**Stripe**
1. In the Stripe Dashboard, open **Connect** and complete the platform setup (platform profile; you are creating accounts with full Stripe Dashboard access, where Stripe handles fees and losses). Add your name and icon under Connect → Branding: they appear on the onboarding pages.
2. **Developers → API keys**: copy the secret key into `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add endpoint**: URL `https://<your domain>/api/payments/webhooks/stripe`, listening to **events on Connected accounts**: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `account.updated`, `account.application.deauthorized`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Test in test mode first (test keys, a test-mode webhook, card 4242 4242 4242 4242), then repeat steps 2–3 in live mode.

**PayPal**
1. At developer.paypal.com → **Apps & Credentials**, create a REST app (sandbox first, then live). Copy the client ID and secret.
2. In the app, **Add webhook**: URL `https://<your domain>/api/payments/webhooks/paypal`, events **Checkout order approved**, **Payment capture completed**, **Payment capture pending**, **Payment capture denied** and **Payment capture declined**. Copy the webhook ID into `PAYPAL_WEBHOOK_ID`.
3. Test with sandbox buyer and seller accounts, then switch to live credentials and `PAYPAL_ENV=live`.

**Check it:** `https://<your domain>/api/payments/config` lists the providers that are on. Create a link on a test invoice, pay it, and watch the editor turn **Paid**. In Stripe, the webhook endpoint's log should show 200 responses.

### Limits

- Stripe users get a new Stripe account through Folio, even if they already have one; Stripe lets them reuse their details from an existing account. If a browser loses its connection key (cleared data, another device without the backup), the user connects again; Folio can't recover the key.
- PayPal payees aren't verified (see above).
- Refunds and disputes are handled in the user's Stripe or PayPal account; Folio leaves a refunded invoice marked paid.

## Invoice fonts

**Font** (in "Template, font & paper") changes the lettering of any template without changing the template. The choice is saved with the invoice and carried to the next one, survives template changes, and appears in the preview, print and PDF. Thirteen fonts are offered, grouped as Recommended, Serif, Sans and Monospace: Inter, EB Garamond, IBM Plex Sans, Source Serif, Libre Baskerville, Lora, Crimson Pro, Hanken Grotesk, DM Sans, Work Sans, Manrope, IBM Plex Mono and JetBrains Mono. All are under the SIL Open Font License; licences are in `src/assets/invoice-fonts/`. Each is subset to the PDF character set and shipped as WOFF2 (screen and print) and TrueType (PDF) from the same instance. `tools/make-invoice-fonts.py` rebuilds them.

Each template's type sizes were set for its own fonts, so other fonts are scaled by their x-height and width (`--d-scale`, `core/fonts.js`); a template keeps its proportions in any font.

**Your fonts.** "Scan device for fonts" uses the Local Font Access API (`queryLocalFonts`, Chrome and Edge on desktop) only after the user clicks, and the browser asks for permission. The list isn't stored or sent; a chosen font is remembered by name and drawn with CSS `local()`. Where the API doesn't exist, the picker offers only **Upload a font** (TTF, OTF, WOFF, WOFF2, up to 15 MB), which is kept in IndexedDB on the device. Nothing about fonts goes to Folio or to analytics.

**In PDFs.** jsPDF can embed TrueType fonts only. The curated fonts, TrueType device fonts and TTF or WOFF uploads are embedded (subset to the characters used). OpenType-CFF (.otf) fonts, WOFF2 uploads, font collections (.ttc), files over 12 MB, and fonts whose licence forbids embedding can't be, so those PDFs use the template's Folio font. The picker marks such fonts, and the download message says so. Print → Save as PDF keeps any font. Characters a font lacks fall back to Folio's fonts.

## How the PDF works

`core/pdf.js` renders the invoice off-screen with the real stylesheet. It then reads every word's position, every rule and the logo, and redraws them with jsPDF using the same typefaces, embedded. As a result the PDF matches the preview for every template without any template-specific PDF code. Text stays selectable (with real spaces between words), and pages break only between rows or blocks. Following pages repeat the table header and carry the footer with page numbers. A typical invoice is 30–60 KB. jsPDF and the fonts load only when the app is idle or when someone exports; marketing pages never download them. Print renders a clean copy of the invoice into a print-only container, so the app's interface never reaches the printer. A payment link becomes a clickable link annotation; its QR code is re-encoded and drawn as vector squares.

## Before launch

- Set the real domain, emails and Pro price in `src/site.json`. The domain drives canonical URLs, Open Graph tags and the sitemap.
- Analytics: set `PUBLIC_GA_MEASUREMENT_ID` in the production build environment. Leave it empty and nothing is measured. European visitors are excluded (see "Analytics" above).
- Set `formEndpoint` (for example a Formspree URL) to receive contact messages. Until then, the contact form opens a pre-written email.
- Pricing: Pro is presented as **in development**, with an early-access link. Folio itself takes no payments; payment links pay your users' own Stripe or PayPal accounts.
- Payment links: see "Payment links → Set it up". Without the environment variables the feature stays hidden.
- The template samples and template pages use invented businesses and people. Replace them if you want different examples.
- Saved invoices live in one browser on one device. The app explains this and offers backup and restore. Syncing across devices is a Pro feature that would need a backend.

## Fonts

EB Garamond and Hanken Grotesk are under the SIL Open Font License; the licence texts are in `src/assets/fonts/`. The invoice fonts in the font picker are listed under "Invoice fonts"; their licences are in `src/assets/invoice-fonts/`. The web fonts are subset from the full upstream fonts, keeping true small caps and old-style figures. The PDF fonts are static subsets that cover Latin-1, common punctuation, € and ₹.

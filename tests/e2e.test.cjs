/**
 * Folio — end-to-end QA in headless Chromium.
 *
 *   npm test   (builds, runs unit tests, then this file)
 *
 * The first test is the product's critical path, step by step:
 * land on the homepage → Create an invoice → fill everything in → download
 * the PDF → open it and check it is a clean, complete invoice.
 * PDF checks use poppler (pdftotext, pdfinfo, pdffonts, pdftoppm).
 */
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createServer } = require('./serve.cjs');

const OUT = path.join(__dirname, 'output');
// The production domain, as configured: tests follow src/site.json, so changing it needs no test changes.
const SITE = require('../src/site.json').url;
const SITE_RE = SITE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
fs.mkdirSync(OUT, { recursive: true });
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const PAGES = ['/', '/features/', '/invoice-templates/', '/invoice-templates/contractor/', '/pricing/', '/about/', '/faq/', '/contact/', '/privacy/', '/terms/', '/app/',
  // the SEO pages: one of each kind, plus the hubs (every page is also checked in 'SEO machine')
  '/invoice-generator/', '/invoice-templates/plumber/', '/invoice-templates/designer/', '/invoice-guides/', '/invoice-guides/how-to-make-an-invoice/',
  '/invoice-guides/invoice-vs-bill/', '/tools/', '/tools/invoice-number-generator/', '/tools/invoice-tax-calculator/', '/tools/sales-tax-calculator/'];
const WIDTHS = [1440, 1200, 1024, 768, 480, 390];

const has = (bin) => { try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; } catch { return false; } };
const POPPLER = has('pdftotext');
// Text is placed word by word (exactly where the browser set it), so collapse runs of spaces.
const pdfText = (f) => execFileSync('pdftotext', ['-layout', f, '-'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/[ \t]+/g, ' ');
const pdfPages = (f) => Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [f], { stdio: ['ignore', 'pipe', 'ignore'] }).toString())[1]);
const pdfFonts = (f) => execFileSync('pdffonts', [f], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
const pdfUris = (f) => [...fs.readFileSync(f).toString('latin1').matchAll(/\/URI \(([^)]*)\)/g)].map((m) => m[1]);
/** Rasterise a PDF page (poppler) and read any QR code on it, as a phone camera would. */
function pdfQr(f, page = 1) {
  const jsQR = require('jsqr');
  const stem = path.join(OUT, `qr-${path.basename(f, '.pdf')}`);
  execFileSync('pdftoppm', ['-r', '200', '-gray', '-f', String(page), '-l', String(page), '-singlefile', f, stem], { stdio: 'ignore' });
  const buf = fs.readFileSync(`${stem}.pgm`);
  let i = 0;
  const tok = () => { while (/\s/.test(String.fromCharCode(buf[i]))) i++; let t = ''; while (!/\s/.test(String.fromCharCode(buf[i]))) t += String.fromCharCode(buf[i++]); return t; };
  tok();
  const w = Number(tok());
  const h = Number(tok());
  tok();
  i++;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let k = 0; k < w * h; k++) { const v = buf[i + k]; rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = v; rgba[k * 4 + 3] = 255; }
  const r = jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' });
  return r ? r.data : null;
}

const results = [];
async function test(name, fn) {
  if (process.env.E2E_ONLY && !new RegExp(process.env.E2E_ONLY, 'i').test(name)) return; // run a subset while developing
  const t = Date.now();
  try {
    await fn();
    results.push(true);
    console.log(`  ✓ ${name} (${Date.now() - t} ms)`);
  } catch (err) {
    results.push(false);
    console.log(`  ✗ ${name}\n      ${String(err.stack || err).split('\n').slice(0, 8).join('\n      ')}`);
  }
}

(async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const problems = [];

  async function open(url, opts = {}) {
    const { viewport = { width: 1440, height: 900 }, reducedMotion = 'reduce', ...rest } = opts;
    const context = await browser.newContext({ viewport, reducedMotion, acceptDownloads: true, ...rest });
    const page = await context.newPage();
    page.on('console', (m) => m.type() === 'error' && !/mocked/.test(m.text()) && problems.push(`${url}: ${m.text()}`));
    page.on('pageerror', (e) => problems.push(`${url}: pageerror ${e.message}`));
    page.on('response', (r) => r.status() >= 400 && !/does-not-exist|api\/mock/.test(r.url()) && problems.push(`${url}: HTTP ${r.status()} ${r.url()}`));
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    return { context, page };
  }
  const settle = (page) => page.waitForTimeout(450); // debounce + animation frame
  /** Choose a template through the real picker UI. */
  async function pickTemplate(page, id) {
    if ((await page.evaluate(() => window.folio.invoice.meta.template)) === id) return;
    await page.locator('[data-action="templates"]:visible').first().click();
    await page.waitForSelector('dialog[data-templates][open]');
    await page.click(`[data-use="${id}"]`);
    await page.waitForSelector('dialog[data-templates]:not([open])', { state: 'attached' });
    await settle(page);
  }

  // A logo fixture, drawn by the browser.
  const logoFile = path.join(OUT, 'logo-fixture.png');
  {
    const p = await browser.newPage({ viewport: { width: 360, height: 120 } });
    await p.setContent('<body style="margin:0;background:transparent"><div style="width:360px;height:120px;display:flex;align-items:center;gap:16px;font:600 44px Georgia"><div style="width:80px;height:80px;background:#1e3a5f"></div>Marlow</div></body>');
    await p.screenshot({ path: logoFile, omitBackground: true });
    await p.close();
  }

  console.log('\nFolio — end-to-end QA\n');

  // ------------------------------------------------------------------ 1. the critical path
  await test('User flow: homepage → Create an invoice → fill in → PDF → clean invoice', async () => {
    const { context, page } = await open('/');

    // (1–2) Land; the purpose is clear above the fold.
    const h1 = await page.locator('h1').innerText();
    assert.match(h1, /Professional invoices/);
    const cta = page.locator('.hero a.btn', { hasText: 'Create an invoice' });
    const box = await cta.boundingBox();
    assert.ok(box && box.y + box.height < 900, 'primary CTA above the fold');
    assert.ok(await page.locator('.hero .doc').isVisible(), 'a real invoice is shown in the hero');
    await page.screenshot({ path: path.join(OUT, 'flow-01-home.png') });

    // (3) Create an invoice → the real application.
    await cta.click();
    await page.waitForURL(`${BASE}/app/`);
    await page.waitForFunction(() => window.folio && window.folio.invoice);
    assert.ok(await page.locator('[data-form]').isVisible());

    // (4) Business information, including a logo.
    await page.fill('[data-bind="business.name"]', 'Marlow Studio');
    await page.fill('[data-bind="business.email"]', 'accounts@marlowstudio.com');
    await page.fill('[data-bind="business.phone"]', '(415) 555-0132');
    await page.fill('[data-bind="business.address"]', '410 Market Street, Suite 200\nSan Francisco, CA 94105');
    await page.setInputFiles('[data-logo-input]', logoFile);
    await page.waitForSelector('[data-logo-thumb] img');
    await page.waitForSelector('[data-preview] .doc__logo');

    // (5) Customer information.
    await page.fill('[data-bind="client.name"]', 'Harbor & Pine Bakery');
    await page.fill('[data-bind="client.email"]', 'accounts@harborpine.com');
    await page.fill('[data-bind="client.address"]', '88 Pier Avenue\nSausalito, CA 94965');
    await page.fill('[data-bind="meta.number"]', 'INV-0042');
    await page.fill('[data-bind="meta.issueDate"]', '2026-10-01');
    await page.selectOption('[data-bind="meta.terms"]', 'net30');
    assert.equal(await page.inputValue('[data-bind="meta.dueDate"]'), '2026-10-31', 'Net 30 sets the due date');

    // (6) Products / services.
    const row = (n) => page.locator('.item').nth(n);
    const fillRow = async (n, d, q, p) => {
      await row(n).locator('[data-key="description"]').fill(d);
      await row(n).locator('[data-key="quantity"]').fill(q);
      await row(n).locator('[data-key="price"]').fill(p);
    };
    await fillRow(0, 'Brand identity — wordmark, colour and type system', '1', '2400');
    await page.click('[data-action="add-item"]');
    await fillRow(1, 'Website design and build, six pages', '6', '450');
    await row(1).locator('[data-key="price"]').press('Enter'); // Enter on the last price adds a row
    assert.equal(await page.locator('.item').count(), 3);
    await fillRow(2, 'Hosting and maintenance (October – December)', '3', '79.99');

    // (7) Totals calculate automatically.
    await settle(page);
    assert.deepEqual(await page.locator('.item__amount').allInnerTexts(), ['$2,400.00', '$2,700.00', '$239.97']);
    assert.equal(await page.locator('[data-sum="subtotal"]').innerText(), '$5,339.97');

    // (8) The preview updates.
    const doc = page.locator('[data-preview] .doc');
    for (const s of ['Marlow Studio', 'Harbor & Pine Bakery', 'INV-0042', 'Website design and build', '$5,339.97']) {
      assert.ok((await doc.innerText()).includes(s), `preview shows ${s}`);
    }

    // (9) Tax, discount and shipping.
    await page.fill('#f-tax', '8.25');
    await page.fill('[data-bind="adjustments.taxLabel"]', 'Sales tax');
    await page.fill('#f-discount', '10');
    await page.fill('#f-shipping', '25');
    await page.fill('[data-bind="adjustments.shippingLabel"]', 'Courier');
    await settle(page);
    assert.equal(await page.locator('[data-sum="discount"]').innerText(), '−$534.00');
    assert.equal(await page.locator('[data-sum="tax"]').innerText(), '$396.49');
    assert.equal(await page.locator('[data-sum="total"]').innerText(), '$5,227.46');
    assert.match(await doc.innerText(), /Sales tax \(8\.25%\)[\s\S]*\$396\.49/);
    assert.match(await doc.innerText(), /Courier[\s\S]*\$25\.00/);
    assert.match(await page.locator('[data-preview] .doc__amount').innerText(), /\$5,227\.46/);

    // (10) Notes and payment instructions.
    await page.fill('[data-bind="payment"]', 'Bank transfer to Marlow Studio LLC\nFirst Coastal Bank · Account 000123456 · Routing 121000358');
    await page.fill('[data-bind="notes"]', 'Thank you for your business. Please include the invoice number with your payment.');
    await settle(page);
    await page.screenshot({ path: path.join(OUT, 'flow-02-app-filled.png') });

    // (11) Download the PDF.
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.appbar [data-action="pdf"]')]);
    assert.equal(dl.suggestedFilename(), 'Invoice-INV-0042-Harbor-Pine-Bakery.pdf');
    const file = path.join(OUT, 'flow-invoice.pdf');
    await dl.saveAs(file);
    assert.match(await page.locator('[data-toast]').innerText(), /Downloaded/);

    // (12–13) Open it: a clean, complete, professional invoice and nothing else.
    const buf = fs.readFileSync(file);
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(buf.length < 400 * 1024, `PDF size ${Math.round(buf.length / 1024)} KB`);
    if (POPPLER) {
      const text = pdfText(file);
      for (const s of ['Marlow Studio', '410 Market Street, Suite 200', 'San Francisco, CA 94105', 'accounts@marlowstudio.com', '(415) 555-0132',
        'INVOICE', 'INV-0042', 'BILLED TO', 'Harbor & Pine Bakery', '88 Pier Avenue', 'accounts@harborpine.com',
        'Oct 1, 2026', 'Oct 31, 2026', 'Net 30', 'AMOUNT DUE', 'Brand identity — wordmark, colour and type system',
        'Website design and build, six pages', 'Hosting and maintenance (October – December)', '$2,400.00', '$2,700.00', '$239.97',
        'Subtotal', '$5,339.97', 'Discount (10%)', '$534.00', 'Sales tax (8.25%)', '$396.49', 'Courier', '$25.00', 'Total', '$5,227.46',
        'PAYMENT', 'First Coastal Bank · Account 000123456 · Routing 121000358', 'NOTES', 'Thank you for your business.']) {
        assert.ok(text.includes(s), `PDF contains "${s}"`);
      }
      for (const ui of ['Download PDF', 'Fill with an example', 'Your invoices', 'Add item', 'Business name', 'Edit', 'Folio']) {
        assert.ok(!text.includes(ui), `PDF must not contain UI text "${ui}"`);
      }
      assert.equal(pdfPages(file), 1);
      const fonts = pdfFonts(file);
      assert.match(fonts, /Folio-serif\s+CID TrueType\s+Identity-H\s+yes/, 'Garamond embedded');
      assert.match(fonts, /Folio-sans\s+CID TrueType\s+Identity-H\s+yes/, 'Grotesk embedded');
      const images = execFileSync('pdfimages', ['-list', file], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      assert.ok(images.split('\n').length > 3, 'logo embedded in the PDF');
      execFileSync('pdftoppm', ['-r', '100', '-png', '-singlefile', file, path.join(OUT, 'flow-03-pdf')]);
    }
    await context.close();
  });

  // ------------------------------------------------------------------ 2. saving and the library
  await test('Save / load: autosave, reopen, new, duplicate, delete, backup and restore', async () => {
    const { context, page } = await open('/app/');
    await page.click('[data-action="example"]');
    await page.fill('[data-bind="meta.number"]', 'INV-0100');
    await settle(page);
    assert.equal(await page.locator('[data-save-state]').innerText(), 'SAVED');

    // Reopen the app: the invoice is still there.
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.inputValue('[data-bind="client.name"]'), 'Harbor & Pine Bakery');
    assert.equal(await page.inputValue('[data-bind="meta.number"]'), 'INV-0100');

    // New invoice: next number, business details carried over, client empty.
    await page.click('.appbar [data-action="new"]');
    assert.equal(await page.inputValue('[data-bind="meta.number"]'), 'INV-0101');
    assert.equal(await page.inputValue('[data-bind="business.name"]'), 'Marlow Studio');
    assert.equal(await page.inputValue('[data-bind="client.name"]'), '');
    await page.fill('[data-bind="client.name"]', 'Ferris & Lowe');
    await page.locator('.item').first().locator('[data-key="description"]').fill('Consultation');
    await page.locator('.item').first().locator('[data-key="price"]').fill('640');
    await settle(page);

    // Library lists both, newest first.
    await page.click('.appbar [data-action="library"]');
    await page.waitForSelector('dialog[open]');
    assert.deepEqual(await page.locator('.lib-item__number').allInnerTexts(), ['INV-0101', 'INV-0100']);
    await page.screenshot({ path: path.join(OUT, 'library-1440.png') });

    // Open the older one.
    await page.locator('.lib-item', { hasText: 'INV-0100' }).locator('[data-lib="open"]').click();
    assert.equal(await page.inputValue('[data-bind="client.name"]'), 'Harbor & Pine Bakery');

    // Duplicate it.
    await page.click('.appbar [data-action="library"]');
    await page.locator('.lib-item', { hasText: 'INV-0100' }).locator('[data-lib="duplicate"]').click();
    assert.equal(await page.inputValue('[data-bind="meta.number"]'), 'INV-0102');
    assert.equal(await page.inputValue('[data-bind="client.name"]'), 'Harbor & Pine Bakery');
    assert.equal(await page.locator('.item').count(), 3);

    // Delete (with confirmation).
    await page.click('.appbar [data-action="library"]');
    const victim = page.locator('.lib-item', { hasText: 'INV-0101' });
    await victim.locator('[data-lib="delete"]').click();
    assert.match(await victim.innerText(), /cannot be undone/);
    await victim.locator('[data-lib="cancel"]').click();
    assert.equal(await page.locator('.lib-item').count(), 3, 'cancel keeps it');
    await page.locator('.lib-item', { hasText: 'INV-0101' }).locator('[data-lib="delete"]').click();
    await page.locator('.lib-item', { hasText: 'INV-0101' }).locator('[data-lib="confirm"]').click();
    assert.equal(await page.locator('.lib-item').count(), 2);

    // Backup and restore into a fresh browser profile.
    const [backup] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="backup"]')]);
    const backupFile = path.join(OUT, 'backup.json');
    await backup.saveAs(backupFile);
    assert.equal(JSON.parse(fs.readFileSync(backupFile, 'utf8')).invoices.length, 2);
    await context.close();

    const fresh = await open('/app/');
    await fresh.page.click('.appbar [data-action="library"]');
    assert.equal(await fresh.page.locator('.lib-item').count(), 1);
    await fresh.page.setInputFiles('[data-restore-input]', backupFile);
    await fresh.page.waitForFunction(() => document.querySelectorAll('.lib-item').length === 3);
    assert.match(await fresh.page.locator('[data-toast]').innerText(), /Restored 2 invoices/);
    await fresh.context.close();
  });

  // ------------------------------------------------------------------ 3. print
  await test('Print: only the invoice reaches the printer', async () => {
    const { context, page } = await open('/app/?example');
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
    await page.click('.appbar [data-action="print"]');
    assert.equal(await page.evaluate(() => window.__printed), 1);
    assert.match(await page.evaluate(() => document.getElementById('print-page-size').textContent), /size: letter/);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.app').isVisible(), false, 'app hidden in print');
    assert.equal(await page.locator('.print-root .doc').isVisible(), true, 'invoice visible in print');
    const file = path.join(OUT, 'print.pdf');
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    if (POPPLER) {
      const text = pdfText(file);
      assert.ok(text.includes('Harbor & Pine Bakery') && text.includes('$5,202.46'));
      for (const ui of ['Download PDF', 'Your invoices', 'Add item', 'Business name']) assert.ok(!text.includes(ui), `print has no "${ui}"`);
      assert.equal(pdfPages(file), 1);
    }
    await context.close();
  });

  // ------------------------------------------------------------------ 4. phones and tablets
  for (const [label, device] of [['iPhone 13', devices['iPhone 13']], ['Pixel 7', devices['Pixel 7']], ['iPad Mini', devices['iPad Mini']]]) {
    await test(`Mobile flow on ${label}: tabs, form, preview fits, PDF downloads`, async () => {
      const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = device;
      const { context, page } = await open('/app/', { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
      const narrow = viewport.width < 1024;
      assert.equal(await page.locator('.app-tabs').isVisible(), narrow, 'Edit / Preview tabs on narrow screens');
      await page.fill('[data-bind="business.name"]', 'Marlow Studio');
      await page.fill('[data-bind="client.name"]', 'Harbor & Pine Bakery');
      await page.locator('.item').first().locator('[data-key="description"]').fill('Consultation');
      await page.locator('.item').first().locator('[data-key="quantity"]').fill('2');
      await page.locator('.item').first().locator('[data-key="price"]').fill('150');
      await settle(page);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'no horizontal scroll in editor');
      for (const sel of ['.fld__input', '.appbar [data-action="pdf"]', '.appbar [data-action="library"]']) {
        const b = await page.locator(sel).first().boundingBox();
        assert.ok(b.height >= 40, `${sel} is a comfortable tap target (${b.height}px)`);
      }
      const fontSize = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.fld__input')).fontSize));
      assert.ok(fontSize >= 16 || !narrow, 'inputs ≥16px so iOS does not zoom');
      await page.screenshot({ path: path.join(OUT, `mobile-${label.replace(/\W+/g, '')}-edit.png`) });
      if (narrow) {
        assert.match(await page.locator('[data-tab-total]').innerText(), /\$300\.00/);
        await page.click('[data-view="preview"]');
        await settle(page);
        assert.equal(await page.locator('#editor').isVisible(), false);
      }
      const sheet = await page.locator('[data-preview] .doc').boundingBox();
      assert.ok(sheet.width <= viewport.width, 'the page is scaled to fit the screen');
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'no horizontal scroll in preview');
      await page.screenshot({ path: path.join(OUT, `mobile-${label.replace(/\W+/g, '')}-preview.png`) });
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.appbar [data-action="pdf"]')]);
      assert.match(dl.suggestedFilename(), /^Invoice-INV-\d+-Harbor-Pine-Bakery\.pdf$/);
      await context.close();
    });
  }

  // ------------------------------------------------------------------ 5. invoice rules
  await test('Rules: payment terms ↔ due date, warnings, removing items, no negative numbers', async () => {
    const { context, page } = await open('/app/');
    await page.fill('[data-bind="meta.issueDate"]', '2026-10-01');
    await page.selectOption('[data-bind="meta.terms"]', 'net14');
    assert.equal(await page.inputValue('[data-bind="meta.dueDate"]'), '2026-10-15');
    await page.fill('[data-bind="meta.dueDate"]', '2026-11-30');
    assert.equal(await page.inputValue('[data-bind="meta.terms"]'), 'net60');
    await page.fill('[data-bind="meta.dueDate"]', '2026-11-11');
    assert.equal(await page.inputValue('[data-bind="meta.terms"]'), 'custom');
    await page.fill('[data-bind="meta.dueDate"]', '2026-09-01');
    assert.equal(await page.locator('[data-due-warning]').isVisible(), true);
    await page.selectOption('[data-bind="meta.terms"]', 'receipt');
    await settle(page);
    assert.equal(await page.locator('[data-due-warning]').isVisible(), false);
    assert.match(await page.locator('[data-preview] .doc__due-on').innerText(), /Due on receipt/);

    assert.equal(await page.locator('.item__remove').first().isDisabled(), true, 'the only item cannot be removed');
    await page.click('[data-action="add-item"]');
    await page.locator('.item').nth(1).locator('[data-key="description"]').fill('Second');
    await page.locator('.item').nth(0).locator('.item__remove').click();
    assert.equal(await page.locator('.item').count(), 1);
    assert.equal(await page.locator('.item [data-key="description"]').inputValue(), 'Second');
    await page.locator('.item [data-key="quantity"]').fill('-3');
    await page.locator('.item [data-key="price"]').fill('100');
    await settle(page);
    assert.equal(await page.locator('[data-sum="total"]').innerText(), '$0.00', 'negative quantities count as zero');
    await context.close();
  });

  await test('PDF: long invoices paginate; currencies and both typefaces render', async () => {
    const { context, page } = await open('/app/?example');
    await page.evaluate(() => {
      const inv = window.folio.invoice;
      for (let i = 0; i < 40; i++) inv.items.push({ id: 'x' + i, description: `Consulting session ${i + 1}, including preparation notes and a written summary for the board`, quantity: '1', price: '120' });
    });
    await page.fill('[data-bind="meta.number"]', 'INV-LONG');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.appbar [data-action="pdf"]')]);
    const file = path.join(OUT, 'long.pdf');
    await dl.saveAs(file);
    if (POPPLER) {
      const pages = pdfPages(file);
      assert.ok(pages >= 3, `paginated (${pages} pages)`);
      const t = pdfText(file);
      assert.ok(t.includes(`PAGE ${pages} OF ${pages}`));
      assert.ok(t.includes('Consulting session 40,'));
      assert.ok(t.includes(await page.locator('[data-sum="total"]').innerText()));
    }
    let current = null;
    for (const [cur, tpl, expected] of [['EUR', 'classic', '€'], ['JPY', 'modern', '¥'], ['INR', 'classic', '₹'], ['INR', 'modern', '₹'], ['GBP', 'contractor', '£']]) {
      await page.selectOption('[data-currency-select]', cur);
      if (tpl !== current) { await pickTemplate(page, tpl); current = tpl; }
      const face = tpl;
      const [d] = await Promise.all([page.waitForEvent('download'), page.click('.appbar [data-action="pdf"]')]);
      const f = path.join(OUT, `cur-${cur}-${face}.pdf`);
      await d.saveAs(f);
      if (POPPLER) {
        const t = pdfText(f);
        assert.ok(t.includes(expected), `${cur}/${face} uses ${expected}`);
        assert.ok(!t.includes('?'), `${cur}/${face} has no missing glyphs`);
      }
    }
    await context.close();
  });

  // ------------------------------------------------------------------ templates
  await test('Templates: switching through all 16 keeps every detail; choice persists', async () => {
    const { context, page } = await open('/app/');
    await page.fill('[data-bind="business.name"]', 'John Smith Design');
    await page.fill('[data-bind="client.name"]', 'ABC Company');
    await page.fill('[data-bind="meta.project"]', 'Website redesign');
    await page.locator('.item').first().locator('[data-key="description"]').fill('Website Design');
    await page.locator('.item').first().locator('[data-key="price"]').fill('2500');
    await settle(page);
    const snapshot = () => page.evaluate(() => { const i = window.folio.invoice; return JSON.stringify({ ...i, updatedAt: 0, meta: { ...i.meta, template: 0 } }); });
    const before = await snapshot();
    const ids = await page.evaluate(async () => (await import('/assets/js/core/templates.js')).TEMPLATES.map((t) => t.id));
    assert.equal(ids.length, 16);
    for (const id of ['classic', 'executive', ...ids.filter((x) => !['classic', 'executive'].includes(x))]) {
      if (id === 'classic') continue;
      await pickTemplate(page, id);
      assert.equal(await page.evaluate(() => window.folio.invoice.meta.template), id);
      assert.equal(await page.locator('[data-preview] .doc').getAttribute('data-template'), id);
      const text = (await page.locator('[data-preview] .doc').textContent()).replace(/\s+/g, ' ');
      for (const s of ['John Smith Design', 'ABC Company', 'Website Design', '$2,500.00', 'Website redesign']) assert.ok(text.includes(s), `${id}: preview shows ${s}`);
      assert.equal(await page.inputValue('[data-bind="client.name"]'), 'ABC Company', `${id}: form untouched`);
      assert.equal(await snapshot(), before, `${id}: invoice data unchanged`);
    }
    assert.match(await page.locator('[data-toast]').innerText(), /Your details are unchanged/);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-preview] .doc').getAttribute('data-template'), ids[ids.length - 1], 'template saved with the invoice');
    // the next new invoice starts in the last template used
    await page.click('.appbar [data-action="new"]');
    assert.equal(await page.evaluate(() => window.folio.invoice.meta.template), ids[ids.length - 1]);
    await context.close();
  });

  await test('Templates: editor adapts (hours, groups, project label) and the picker filters', async () => {
    const { context, page } = await open('/app/');
    await pickTemplate(page, 'freelancer');
    assert.deepEqual(await page.locator('.items__head span').evaluateAll((els) => els.slice(0, 3).map((e) => e.textContent)), ['Work', 'Hours', 'Rate']);
    await pickTemplate(page, 'contractor');
    assert.equal(await page.locator('.item__group select').count(), 1, 'group select appears');
    await page.locator('.item').first().locator('[data-key="description"]').fill('Cabinet installation');
    await page.locator('.item').first().locator('[data-key="quantity"]').fill('24');
    await page.locator('.item').first().locator('[data-key="price"]').fill('65');
    await page.click('[data-action="add-item"]');
    await page.locator('.item').nth(1).locator('select[data-key="group"]').selectOption('Materials');
    await page.locator('.item').nth(1).locator('[data-key="description"]').fill('Maple cabinets');
    await page.locator('.item').nth(1).locator('[data-key="price"]').fill('4850');
    await page.fill('#f-paid', '3000');
    await settle(page);
    const doc = await page.locator('[data-preview] .doc').innerText();
    assert.match(doc, /LABOR[\s\S]*Cabinet installation[\s\S]*MATERIALS[\s\S]*Maple cabinets/);
    assert.match(doc, /Less deposit received[\s\S]*−\$3,000\.00/);
    assert.equal(await page.locator('[data-sum="due"]').innerText(), '$3,410.00');
    assert.equal(await page.locator('[data-tpl-label="project"]').first().textContent(), 'Project');
    await pickTemplate(page, 'consultant');
    assert.equal(await page.locator('[data-tpl-label="project"]').first().textContent(), 'Engagement');
    // groups chosen under Contractor are kept even where Consultant has other sections
    assert.equal(await page.locator('.item').nth(1).locator('select[data-key="group"]').inputValue(), 'Materials');
    await pickTemplate(page, 'classic');
    assert.equal(await page.locator('.item__group').count(), 0, 'no group select on Classic');
    assert.equal(await page.evaluate(() => window.folio.invoice.items[1].group), 'Materials', 'group data kept');
    // filter in the picker
    await page.locator('[data-action="templates"]:visible').first().click();
    await page.click('.tpl-filter__btn[data-filter="trades"]');
    assert.deepEqual(await page.locator('.tpl-card:visible .tpl-card__name').allInnerTexts(), ['Contractor', 'Construction', 'Home Services', 'Auto Repair']);
    await page.screenshot({ path: path.join(OUT, 'picker-trades-1440.png') });
    await page.keyboard.press('Escape');
    await context.close();
  });

  await test('Templates: library page, filter, template pages and "Customize this invoice" deep links', async () => {
    const { context, page } = await open('/invoice-templates/');
    assert.equal(await page.locator('.tcard').count(), 20);
    await page.click('.tlib__filter [data-filter="creative"]');
    assert.deepEqual(await page.locator('.tcard:visible .tcard__name').allInnerTexts(), ['Designer', 'Photographer', 'Videographer']);
    await page.click('.tlib__filter [data-filter="all"]');
    await page.screenshot({ path: path.join(OUT, 'templates-library-1440.png'), fullPage: true });
    await page.click('.tcard:has-text("Photographer") .tcard__name a');
    await page.waitForURL(`${BASE}/invoice-templates/photographer/`);
    assert.equal(await page.locator('h1').innerText(), 'Free Photography Invoice Template');
    const main = (await page.locator('main').innerText()).toLowerCase();
    for (const s of ['Who it is for', 'What to include', 'How to fill it in', 'Questions', 'Related templates', 'Guides & tools']) assert.ok(main.includes(s.toLowerCase()), s);
    assert.equal(await page.locator('.tdetail .doc').getAttribute('data-template'), 'photographer');
    await page.screenshot({ path: path.join(OUT, 'template-page-1440.png'), fullPage: true });
    await page.click('.tdetail__actions a.btn');
    await page.waitForURL(`${BASE}/app/`);
    assert.equal(await page.evaluate(() => window.folio.invoice.meta.template), 'photographer');
    assert.equal(await page.inputValue('[data-bind="client.name"]'), 'Emma & Daniel Hart', 'the page’s example is loaded');
    assert.match(await page.locator('[data-toast]').innerText(), /Photographer example loaded/);
    // with an invoice in progress, a template link starts a new invoice rather than restyling it
    await page.goto(`${BASE}/app/?template=contractor`, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.folio.invoice.meta.template), 'contractor');
    assert.equal(await page.inputValue('[data-bind="client.name"]'), '');
    assert.equal(await page.evaluate(() => window.folio.library.invoices.length), 2);
    assert.equal(new URL(page.url()).search, '', 'parameters removed from the address bar');
    await context.close();
  });

  await test('Funnel: profession page → generator in the right layout, with its own example; events recorded locally', async () => {
    const { context, page } = await open('/invoice-templates/plumber/');
    const events = () => page.evaluate(() => (window.folioEvents || []).map((e) => e.name + ':' + (e.props.template || e.props.content_slug)));
    assert.deepEqual(await events(), ['seo_page_view:plumber', 'template_view:plumber']);
    assert.equal(await page.locator('.tdetail .doc').getAttribute('data-template'), 'contractor', 'plumber uses the contractor layout');
    assert.match(await page.locator('.tdetail .doc').textContent(), /Keller Plumbing/);
    assert.match(await page.locator('.tdetail__facts').innerText(), /Contractor/);
    // blank start: the layout, nothing filled in
    await page.click('.tdetail__actions a.go');
    await page.waitForURL(`${BASE}/app/`);
    assert.equal(await page.evaluate(() => window.folio.invoice.meta.template), 'contractor');
    assert.equal(await page.inputValue('[data-bind="client.name"]'), '');
    assert.match(await page.locator('[data-toast]').innerText(), /Plumber template selected/);
    let appEvents = await page.evaluate(() => window.folioEvents.map((e) => [e.name, e.props]));
    assert.equal(appEvents[0][0], 'invoice_generator_opened');
    assert.deepEqual([appEvents[0][1].from_page, appEvents[0][1].via, appEvents[0][1].template, appEvents[0][1].page_type], ['/invoice-templates/plumber/', 'template', 'plumber', 'app']);
    assert.deepEqual(appEvents.map((e) => e[0]), ['invoice_generator_opened', 'invoice_started'], 'starting an invoice is not creating one');
    // Fill with an example now uses the plumber page's example, not the contractor's
    await page.click('[data-action="example"]');
    await settle(page);
    assert.equal(await page.inputValue('[data-bind="business.name"]'), 'Keller Plumbing & Drain');
    // customize from the page: the example, with saved business details kept
    await page.fill('[data-bind="business.name"]', 'Real Plumbing Co.');
    await settle(page);
    await page.goto(`${BASE}/invoice-templates/plumber/`);
    await page.click('.tdetail__actions a.btn');
    await page.waitForURL(`${BASE}/app/`);
    assert.equal(await page.inputValue('[data-bind="client.name"]'), 'Robert & Ann Liu');
    assert.equal(await page.inputValue('[data-bind="business.name"]'), 'Real Plumbing Co.', 'saved details never overwritten');
    assert.notEqual(await page.inputValue('[data-bind="meta.number"]'), 'KP-2026-0318', 'the example never breaks your numbering');
    // PDF and print events
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="pdf"]:visible').first().click()]);
    await dl.path();
    await page.evaluate(() => { window.print = () => {}; });
    await page.locator('[data-action="print"]:visible').first().click();
    appEvents = await page.evaluate(() => window.folioEvents.map((e) => e.name));
    for (const n of ['invoice_generator_opened', 'invoice_created', 'pdf_downloaded', 'print_clicked']) assert.ok(appEvents.includes(n), n);
    // old and unknown template links degrade gracefully
    await page.goto(`${BASE}/app/?template=design-studio`, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.folio.invoice.meta.template), 'studio');
    await page.goto(`${BASE}/app/?template=no-such-template`, { waitUntil: 'networkidle' });
    assert.ok(await page.evaluate(() => Boolean(window.folio.invoice)), 'unknown template: the app still opens');
    await context.close();
  });

  await test('Tools: number generator, tax calculator and sales tax calculator hand their numbers to the generator', async () => {
    const { context, page } = await open('/tools/invoice-number-generator/');
    const year = new Date().getFullYear();
    assert.equal(await page.locator('[data-out="number"]').innerText(), `INV-${year}-0001`);
    await page.fill('input[name="prefix"]', 'MS');
    await page.selectOption('select[name="datePart"]', 'none');
    await page.fill('input[name="number"]', '120');
    await page.selectOption('select[name="digits"]', '5');
    assert.equal(await page.locator('[data-out="number"]').innerText(), 'MS-00120');
    assert.equal(await page.locator('[data-out="then"]').innerText(), 'MS-00121, MS-00122, MS-00123');
    assert.ok((await page.evaluate(() => window.folioEvents.map((e) => e.name))).includes('tool_used'));
    await page.click('[data-out="link"]');
    await page.waitForURL(`${BASE}/app/`);
    assert.equal(await page.inputValue('[data-bind="meta.number"]'), 'MS-00120');
    await page.fill('[data-bind="client.name"]', 'Harbor & Pine');
    await settle(page);
    await page.click('.appbar [data-action="new"]');
    assert.equal(await page.inputValue('[data-bind="meta.number"]'), 'MS-00121', 'the sequence continues');

    await page.goto(`${BASE}/tools/invoice-tax-calculator/`, { waitUntil: 'networkidle' });
    await page.fill('input[name="item"]', 'Brand project');
    await page.fill('input[name="price"]', '2400');
    await page.fill('input[name="discount"]', '10');
    await page.fill('input[name="tax"]', '8.25');
    await page.fill('input[name="shipping"]', '40');
    await page.fill('input[name="paid"]', '500');
    const out = async (k) => page.locator(`[data-out="${k}"]`).innerText();
    assert.deepEqual([await out('subtotal'), await out('discount'), await out('tax'), await out('total'), await out('due')], ['$2,400.00', '−$240.00', '$178.20', '$2,378.20', '$1,878.20']);
    await page.selectOption('select[name="currency"]', 'EUR');
    assert.match(await out('total'), /€/);
    await page.selectOption('select[name="currency"]', 'USD');
    await page.click('[data-out="link"]');
    await page.waitForURL(`${BASE}/app/`);
    const t = await page.evaluate(() => window.folio.totals);
    assert.deepEqual([t.subtotal, t.discount, t.tax, t.shipping, t.total, t.due], [2400, 240, 178.2, 40, 2378.2, 1878.2], 'the invoice matches the calculator');
    assert.equal(await page.locator('.item').first().locator('[data-key="description"]').inputValue(), 'Brand project');

    await page.goto(`${BASE}/tools/sales-tax-calculator/`, { waitUntil: 'networkidle' });
    await page.fill('input[name="amount"]', '267.50');
    await page.fill('input[name="rate"]', '7');
    assert.deepEqual([await out('net'), await out('tax'), await out('gross')], ['$267.50', '$18.73', '$286.23']);
    await page.check('input[value="remove"]', { force: true });
    assert.deepEqual([await out('net'), await out('tax'), await out('gross')], ['$250.00', '$17.50', '$267.50']);
    await page.click('[data-out="link"]');
    await page.waitForURL(`${BASE}/app/`);
    const s = await page.evaluate(() => window.folio.totals);
    assert.deepEqual([s.subtotal, s.tax, s.total], [250, 17.5, 267.5]);
    await context.close();
  });

  await test('SEO machine: every page in the sitemap — metadata, breadcrumbs, structured data, links in; robots, redirects, dashboard', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const sitemap = await (await ctx.request.get(BASE + '/sitemap.xml')).text();
    const urls = [...sitemap.matchAll(new RegExp(`<loc>${SITE_RE}([^<]*)</loc>`, 'g'))].map((m) => m[1]);
    assert.ok(urls.length >= 45, `${urls.length} URLs in the sitemap`);
    assert.ok(!urls.some((u) => /[?#]|_seo|404|design-studio|home-services|free-invoice-generator/.test(u)), 'no parameters, redirects or private pages');
    const titles = new Set();
    const descs = new Set();
    for (const url of urls) {
      const page = await ctx.newPage();
      const res = await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
      assert.equal(res.status(), 200, url);
      const m = await page.evaluate(() => ({
        title: document.title,
        desc: document.querySelector('meta[name=description]').content,
        canonical: document.querySelector('link[rel=canonical]').href,
        robots: document.querySelector('meta[name=robots]').content,
        h1: document.querySelectorAll('h1').length,
        tw: document.querySelector('meta[name="twitter:title"]')?.content,
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)),
        crumbs: [...document.querySelectorAll('.crumbs li')].map((li) => li.textContent.trim()),
        overflow: document.documentElement.scrollWidth - innerWidth,
      }));
      assert.ok(m.title.length <= 70 && !titles.has(m.title), `${url} title: ${m.title}`);
      assert.ok(!descs.has(m.desc), `${url} description is unique`);
      titles.add(m.title); descs.add(m.desc);
      assert.ok(m.desc.length >= 80 && m.desc.length <= 170, `${url} description ${m.desc.length}`);
      assert.equal(m.canonical, `${SITE}${url}`);
      assert.equal(m.robots, 'index, follow');
      assert.equal(m.h1, 1, `${url} has one h1`);
      assert.ok(m.tw, `${url} twitter:title`);
      assert.ok(m.overflow <= 0, `${url} fits a phone`);
      const types = m.ld.map((x) => x['@type']);
      const kind = url.split('/')[1];
      if (['invoice-templates', 'invoice-guides', 'tools'].includes(kind) && url.split('/').length === 4) {
        assert.equal(m.crumbs.length, 3, `${url} breadcrumbs`);
        const bc = m.ld.find((x) => x['@type'] === 'BreadcrumbList');
        assert.deepEqual(bc.itemListElement.map((i) => i.item), [`${SITE}/`, `${SITE}/${kind}/`, `${SITE}${url}`]);
        assert.ok(types.includes('FAQPage'), `${url} FAQPage`);
        if (kind === 'invoice-guides') {
          const art = m.ld.find((x) => x['@type'] === 'Article');
          assert.ok(art && art.headline && art.dateModified && art.author.name === 'Folio', `${url} Article`);
        }
        if (kind === 'tools') assert.ok(types.includes('WebApplication'), `${url} WebApplication`);
        // the FAQ in structured data is the FAQ on the page
        const faq = m.ld.find((x) => x['@type'] === 'FAQPage');
        const visible = await page.locator('main .faq summary').allTextContents();
        assert.deepEqual(faq.mainEntity.map((q) => q.name), visible.map((v) => v.trim()), `${url} FAQ schema matches the page`);
      }
      // no fabricated ratings, reviews or prices anywhere
      const raw = JSON.stringify(m.ld);
      assert.ok(!/aggregateRating|"review"|ratingValue/.test(raw), `${url}: no ratings`);
      await page.close();
    }
    const howtos = [];
    for (const g of ['how-to-make-an-invoice', 'how-to-send-an-invoice', 'how-to-create-an-invoice-pdf', 'how-to-invoice-as-a-freelancer', 'invoice-vs-bill']) {
      const html = await (await ctx.request.get(`${BASE}/invoice-guides/${g}/`)).text();
      if (html.includes('"@type":"HowTo"')) howtos.push(g);
    }
    assert.deepEqual(howtos, ['how-to-make-an-invoice', 'how-to-send-an-invoice', 'how-to-create-an-invoice-pdf', 'how-to-invoice-as-a-freelancer'], 'HowTo only on step-by-step guides');

    const robots = await (await ctx.request.get(BASE + '/robots.txt')).text();
    assert.match(robots, /Disallow: \/app\/\?/);
    assert.ok(robots.includes(`Sitemap: ${SITE}/sitemap.xml`));
    for (const [from, to] of [['/invoice-templates/design-studio/', '/invoice-templates/designer/'], ['/invoice-templates/home-services/', '/invoice-templates/landscaper/'], ['/free-invoice-generator/', '/']]) {
      const page = await ctx.newPage();
      await page.goto(BASE + from);
      await page.waitForURL(BASE + to);
      await page.close();
      const stub = await (await ctx.request.get(BASE + from)).text();
      assert.match(stub, new RegExp(`rel="canonical" href="${SITE_RE}${to.replace(/\//g, '\\/')}"`));
      assert.match(stub, /noindex/);
    }
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'dist', '_redirects'), 'utf8'), /^\/invoice-templates\/design-studio\/ \/invoice-templates\/designer\/ 301$/m);

    const dash = await ctx.newPage();
    await dash.goto(BASE + '/_seo/');
    assert.equal(await dash.locator('meta[name=robots]').getAttribute('content'), 'noindex, nofollow');
    assert.ok(await dash.locator('[data-audit] tbody tr').count() >= urls.length);
    const flagged = await dash.locator('[data-audit] tbody tr').evaluateAll((rows) => rows.filter((r) => r.querySelector('td:last-child .dash__bad')).map((r) => r.children[1].textContent + ': ' + r.lastElementChild.textContent));
    assert.deepEqual(flagged, [], 'the dashboard finds no SEO issues');
    await dash.click('[data-f="guide"]');
    assert.equal(await dash.locator('[data-audit] tbody tr:visible').count(), 10);
    await dash.screenshot({ path: path.join(OUT, 'seo-dashboard.png') });
    await ctx.close();
    console.log(`      ${urls.length} indexable pages checked`);
  });

  // ------------------------------------------------------------------ analytics & growth dashboard
  /** Record everything GA4 would receive: dataLayer pushes, kept across page loads in localStorage. */
  const GA_RECORDER = `
    window.folioAnalytics = { ga4: 'G-TEST1234' };
    window.dataLayer = [];
    window.dataLayer.push = function () {
      Array.prototype.push.apply(this, arguments);
      try {
        const log = JSON.parse(localStorage.getItem('__ga') || '[]');
        for (const a of arguments) log.push([...a].map((x) => (x instanceof Date ? 'date' : x)));
        localStorage.setItem('__ga', JSON.stringify(log));
      } catch (e) {}
      return this.length;
    };`;
  const GA_PARAMS = new Set(['page_location', 'page_referrer', 'page_title', 'send_page_view', 'allow_google_signals', 'allow_ad_personalization_signals',
    'page_type', 'content_slug', 'template', 'layout', 'tool', 'cta', 'via', 'start', 'from_page', 'visit_source', 'visit_medium', 'visit_campaign', 'landing_page', 'referrer_host', 'device_type']);

  await test('Analytics: off by default; nothing loaded, nothing sent, the site works', async () => {
    const { context, page } = await open('/invoice-templates/plumber/');
    const gaRequests = [];
    context.on('request', (r) => /google-analytics|googletagmanager/.test(r.url()) && gaRequests.push(r.url()));
    assert.deepEqual(await page.evaluate(() => window.folioAnalyticsState), { enabled: false, reason: 'not-configured' });
    assert.equal(await page.evaluate(() => typeof window.gtag), 'undefined');
    await page.click('.tdetail__actions a.btn');
    await page.waitForURL(`${BASE}/app/`);
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => window.folioAnalyticsState), { enabled: false, reason: 'not-configured' });
    assert.equal(await page.inputValue('[data-bind="client.name"]'), 'Robert & Ann Liu', 'the generator works as before');
    assert.ok((await page.evaluate(() => window.folioEvents.map((e) => e.name))).includes('invoice_generator_opened'), 'events are still recorded locally');
    assert.deepEqual(gaRequests, []);
    const privacy = await (await context.request.get(BASE + '/privacy/')).text();
    assert.match(privacy, /uses no third-party analytics/, 'the privacy notice matches what runs');
    await context.close();
  });

  await test('Analytics: with GA4 configured, the whole funnel is measured and no invoice data is sent', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
    const gtagLoads = [];
    await context.route('https://www.googletagmanager.com/**', (r) => { gtagLoads.push(r.request().url()); return r.fulfill({ contentType: 'text/javascript', body: '/* gtag stub */' }); });
    await context.addInitScript(GA_RECORDER);
    const page = await context.newPage();
    page.on('pageerror', (e) => problems.push(`analytics: ${e.message}`));
    // arrive from a search engine with a campaign tag
    await page.goto(`${BASE}/invoice-templates/plumber/?utm_source=Newsletter&utm_medium=email&utm_campaign=autumn`, { referer: 'https://www.google.com/search?q=plumber+invoice', waitUntil: 'networkidle' });
    assert.deepEqual(await page.evaluate(() => window.folioAnalyticsState), { enabled: true, reason: 'ga4' });
    await page.waitForTimeout(200);
    assert.ok(gtagLoads.some((u) => u.includes('id=G-TEST1234')), 'gtag.js is loaded (after the page)');
    await page.click('.tdetail__actions a.btn');
    await page.waitForURL(`${BASE}/app/`);
    await page.fill('[data-bind="client.name"]', 'Jane Secretclient');
    await page.fill('[data-bind="client.email"]', 'jane.secret@example.com');
    await page.locator('.item').first().locator('[data-key="description"]').fill('Secret widget overhaul');
    await page.locator('.item').first().locator('[data-key="price"]').fill('14832.22');
    await settle(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="pdf"]:visible').first().click()]);
    await dl.path();
    // a guide's CTA and a tool's hand-off, with values in the address
    await page.goto(`${BASE}/invoice-guides/how-to-make-an-invoice/`, { waitUntil: 'networkidle' });
    await page.click('.article__cta a');
    await page.waitForURL(`${BASE}/app/`);
    await page.goto(`${BASE}/tools/invoice-tax-calculator/`, { waitUntil: 'networkidle' });
    await page.fill('input[name="item"]', 'Confidential retainer');
    await page.fill('input[name="price"]', '9999');
    await page.click('[data-out="link"]');
    await page.waitForURL(`${BASE}/app/`);
    await page.waitForTimeout(300);

    const log = await page.evaluate(() => JSON.parse(localStorage.getItem('__ga')));
    const events = log.filter((c) => c[0] === 'event');
    const names = events.map((c) => c[1]);
    for (const n of ['page_view', 'seo_page_view', 'template_view', 'template_selected', 'generator_cta_clicked', 'invoice_generator_opened', 'invoice_started', 'invoice_created', 'pdf_downloaded', 'guide_view', 'tool_view', 'tool_used']) {
      assert.ok(names.includes(n), `${n} sent`);
    }
    const created = events.filter((c) => c[1] === 'invoice_created');
    assert.equal(created.length, 1, 'one invoice created (the edited one), not one per generator visit');
    assert.deepEqual([created[0][2].template, created[0][2].layout, created[0][2].via, created[0][2].start], ['plumber', 'contractor', 'template', 'example']);
    assert.deepEqual([created[0][2].visit_source, created[0][2].visit_medium, created[0][2].visit_campaign, created[0][2].landing_page], ['newsletter', 'email', 'autumn', '/invoice-templates/plumber/'], 'acquisition carried through the visit');
    const opens = events.filter((c) => c[1] === 'invoice_generator_opened').map((c) => c[2].via);
    assert.deepEqual(opens, ['template', 'guide', 'tool'], 'each route into the generator is told apart');
    assert.ok(events.some((c) => c[1] === 'generator_cta_clicked' && c[2].cta === 'article'), 'guide CTA named');
    assert.ok(events.some((c) => c[1] === 'generator_cta_clicked' && c[2].cta === 'tool' && c[2].tool === 'invoice-tax-calculator'), 'tool CTA named');
    for (const c of events) for (const k of Object.keys(c[2] || {})) assert.ok(GA_PARAMS.has(k), `unexpected parameter ${k} on ${c[1]}`);
    const sets = log.filter((c) => c[0] === 'set').map((c) => c[1].page_location);
    assert.ok(sets.every((u) => !/[?&](item|price|template|example|number|tax)=/.test(u)), `no query strings: ${sets.join(' ')}`);
    assert.ok(sets.some((u) => /utm_source=Newsletter/.test(u)), 'campaign tags are kept for GA4');
    const all = JSON.stringify(log);
    for (const secret of ['Secretclient', 'jane.secret', 'Secret widget', '14832', 'Confidential', '9999', 'q=plumber']) assert.ok(!all.includes(secret), `${secret} never sent`);
    await context.close();
  });

  await test('Analytics: not run for European visitors (no consent is asked for)', async () => {
    const context = await browser.newContext({ timezoneId: 'Europe/Paris' });
    const gaRequests = [];
    context.on('request', (r) => /googletagmanager/.test(r.url()) && gaRequests.push(r.url()));
    await context.addInitScript(GA_RECORDER);
    const page = await context.newPage();
    await page.goto(`${BASE}/invoice-templates/contractor/`, { waitUntil: 'networkidle' });
    assert.deepEqual(await page.evaluate(() => window.folioAnalyticsState), { enabled: false, reason: 'consent-region' });
    await page.click('.tdetail__actions a.btn');
    await page.waitForURL(`${BASE}/app/`);
    assert.deepEqual(await page.evaluate(() => window.folioAnalyticsState), { enabled: false, reason: 'consent-region' });
    assert.equal(await page.evaluate(() => localStorage.getItem('__ga')), null, 'nothing queued for Google');
    assert.deepEqual(gaRequests, []);
    assert.equal(await page.evaluate(() => document.cookie), '', 'no cookies');
    await context.close();
  });

  await test('Analytics: Do Not Track / Global Privacy Control turn measurement off', async () => {
    const context = await browser.newContext();
    const gaRequests = [];
    context.on('request', (r) => /googletagmanager/.test(r.url()) && gaRequests.push(r.url()));
    await context.addInitScript(`${GA_RECORDER}; Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });`);
    const page = await context.newPage();
    await page.goto(`${BASE}/invoice-guides/`, { waitUntil: 'networkidle' });
    assert.deepEqual(await page.evaluate(() => window.folioAnalyticsState), { enabled: false, reason: 'privacy-signal' });
    assert.deepEqual(await page.evaluate(() => localStorage.getItem('__ga')), null);
    assert.deepEqual(gaRequests, []);
    await context.close();
  });

  await test('Growth dashboard: private, honest when empty, and correct when connected', async () => {
    const { mockGoogle, configureDashboard } = require('./fixtures/google.cjs');
    // never linked from the public site, never in the sitemap
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const sitemap = await (await ctx.request.get(BASE + '/sitemap.xml')).text();
    assert.ok(!sitemap.includes('_seo'));
    for (const url of [...sitemap.matchAll(new RegExp(`<loc>${SITE_RE}([^<]*)</loc>`, 'g'))].map((m) => m[1])) {
      assert.ok(!(await (await ctx.request.get(BASE + url)).text()).includes('_seo'), `${url} links to the dashboard`);
    }

    // 1. not set up: an explanation, never zeros
    let page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`dashboard: ${e.message}`));
    await page.goto(BASE + '/_seo/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'noindex, nofollow');
    assert.match(await page.locator('[data-g="overview"]').innerText(), /No analytics data yet\.[\s\S]*Connect Google Analytics/);
    assert.equal(await page.locator('.g-tile').count(), 0, 'no tiles, so no zeros that look like measurements');
    assert.equal(await page.locator('[data-g="landing"] table').count(), 0);
    assert.equal(await page.locator('[data-empty="unavailable"]').count() > 3, true);
    assert.match(await page.locator('[data-g="setup"]').innerText(), /To do\s+The site sends analytics/i);
    assert.ok(await page.locator('[data-audit] tbody tr').count() > 40, 'the SEO audit is still there');
    await page.screenshot({ path: path.join(OUT, 'growth-empty-1440.png'), fullPage: false });

    // Search Console CSV import works without any Google connection
    await page.setInputFiles('[data-g="import"]', [
      { name: 'Pages.csv', mimeType: 'text/csv', buffer: Buffer.from('Top pages,Clicks,Impressions,CTR,Position\nhttps://folioinvoice.com/invoice-templates/plumber/,30,5000,0.6%,7.5\nhttps://folioinvoice.com/invoice-templates/contractor/,240,12000,2%,6.2\nhttps://folioinvoice.com/invoice-guides/how-to-make-an-invoice/,140,6000,2.33%,4.2\nhttps://folioinvoice.com/invoice-templates/freelancer/,90,4000,2.25%,9\n') },
      { name: 'Queries.csv', mimeType: 'text/csv', buffer: Buffer.from('Top queries,Clicks,Impressions,CTR,Position\nplumber invoice,12,2600,0.46%,7.9\n') },
    ]);
    await page.waitForSelector('[data-table="search"]');
    assert.match(await page.locator('[data-g="search"]').innerText(), /Imported from a Search Console export/);
    assert.match(await page.locator('[data-opp="lowCtr"]').innerText(), /Plumber[\s\S]*5,000 impressions/);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-table="search"]').count(), 1, 'import kept in this browser');
    await page.click('[data-action="clear-gsc"]');
    assert.equal(await page.locator('[data-table="search"]').count(), 0);
    await page.close();

    // 2. connected, but the property has no data yet
    page = await ctx.newPage();
    await mockGoogle(page, [], { empty: true });
    await configureDashboard(page, { measurementConfigured: true, ga4PropertyId: '123456789', oauthClientId: 'test.apps.googleusercontent.com', searchConsoleSite: 'sc-domain:folioinvoice.com' });
    await page.goto(BASE + '/_seo/', { waitUntil: 'networkidle' });
    assert.match(await page.locator('[data-g="overview"]').innerText(), /Not connected/);
    await page.click('[data-action="connect"]');
    await page.waitForFunction(() => document.documentElement.dataset.growth === 'ready');
    assert.match(await page.locator('[data-g="overview"]').innerText(), /No analytics data recorded in this period/);
    assert.equal(await page.locator('.g-tile').count(), 0);
    await page.close();

    // 3. connected with data
    page = await ctx.newPage();
    const seen = [];
    await mockGoogle(page, seen);
    await configureDashboard(page, { measurementConfigured: true, ga4PropertyId: '123456789', oauthClientId: 'test.apps.googleusercontent.com', searchConsoleSite: 'sc-domain:folioinvoice.com' });
    await page.goto(BASE + '/_seo/', { waitUntil: 'networkidle' });
    await page.click('[data-action="connect"]');
    await page.waitForFunction(() => document.documentElement.dataset.growth === 'ready');
    const tile = async (k) => (await page.locator(`[data-tile="${k}"]`).innerText()).replace(/\s+/g, ' ');
    assert.match(await tile('visitors'), /1,284 \+18% vs previous 28 days \(1,088\)/);
    assert.match(await tile('invoices_created'), /240 \+27%/);
    assert.match(await tile('pdf_downloads'), /198 \+22%/);
    // funnel: numbers, rates and the biggest drop-off
    const step = async (k) => (await page.locator(`[data-step="${k}"]`).innerText()).replace(/\s+/g, ' ');
    assert.match(await step('seo_page_view'), /820 64% of visitors 64% continue · 36% drop off/);
    assert.match(await step('invoice_generator_opened'), /380 30% of visitors 46% continue · 54% drop off ▲ Biggest drop-off/i);
    assert.equal(await page.locator('.g-funnel__row--worst').getAttribute('data-step'), 'invoice_generator_opened');
    // what to do next: the funnel first, with its evidence
    const first = await page.locator('.g-action').first().innerText();
    assert.match(first, /SEO page views → Generator opens[\s\S]*54% of 820/);
    assert.ok(await page.locator('.g-action[data-kind="template"]').count() >= 1);
    // landing pages: default by visitors, sortable
    const firstPage = () => page.locator('[data-table="landing"] tbody tr').first().locator('.g-path').innerText();
    assert.equal(await firstPage(), '/');
    await page.click('[data-sort="landing:conversion"]');
    assert.equal(await firstPage(), '/app/');
    assert.equal(await page.locator('[data-table="landing"] th[aria-sort="descending"]').innerText(), 'CONVERSION ↓');
    await page.click('[data-sort="landing:conversion"]');
    assert.equal(await firstPage(), '/invoice-guides/how-to-create-an-invoice-pdf/', 'ascending: the weakest first');
    // templates
    const contractor = (await page.locator('[data-table="templates"] tbody tr', { hasText: 'Contractor' }).innerText()).replace(/\s+/g, ' ');
    assert.match(contractor, /Contractor 421 173 120 96 82 29% 80% 85%/);
    // sources and search
    assert.match((await page.locator('[data-bucket="Organic Search"]').innerText()).replace(/\s+/g, ' '), /760 59% of visitors/);
    assert.match(await page.locator('[data-g="search"]').innerText(), /From the Search Console API/);
    assert.match(await page.locator('[data-g="setup"]').innerText(), /Custom definitions: via/);
    // export
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="templates"]')]);
    const text = fs.readFileSync(await csv.path(), 'utf8');
    assert.match(csv.suggestedFilename(), /^folio-templates-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
    assert.match(text, /^Template,Views,Customize clicks,Generator opens,Invoices created,PDF downloads/);
    assert.match(text, /\r\ncontractor,421,173,120,96,82,/);
    const [fcsv] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="funnel"]')]);
    assert.match(fs.readFileSync(await fcsv.path(), 'utf8'), /Generator opens,380,0\.296,0\.4634,0\.5366/);
    // date ranges: presets and custom change what is asked for
    const lastGa = () => seen.filter((b) => b.requests && !b.requests[0].dimensions).at(-1).requests[0].dateRanges; // the totals report, with both periods
    assert.equal(lastGa().length, 2);
    const days = (r) => Math.round((new Date(r.endDate) - new Date(r.startDate)) / 864e5) + 1;
    assert.equal(days(lastGa()[0]), 28, 'default: last 28 days');
    await page.click('[data-range="7"]');
    await page.waitForFunction(() => document.documentElement.dataset.growth === 'ready');
    assert.deepEqual([days(lastGa()[0]), days(lastGa()[1])], [7, 7]);
    assert.match(await tile('visitors'), /vs previous 7 days/);
    await page.click('[data-range="custom"]');
    await page.fill('[name="g-start"]', '2026-09-01');
    await page.fill('[name="g-end"]', '2026-09-15');
    await page.click('[data-action="apply-custom"]');
    await page.waitForFunction(() => document.documentElement.dataset.growth === 'ready');
    assert.deepEqual(lastGa()[0], { startDate: '2026-09-01', endDate: '2026-09-15', name: 'current' });
    assert.deepEqual(lastGa()[1], { startDate: '2026-08-17', endDate: '2026-08-31', name: 'previous' });
    assert.ok(seen.filter((b) => b.gsc).at(-1).gsc.startDate === '2026-09-01', 'Search Console follows the range');
    await page.click('[data-range="28"]');
    await page.waitForFunction(() => document.documentElement.dataset.growth === 'ready');
    await page.screenshot({ path: path.join(OUT, 'growth-dashboard-1440.png'), fullPage: true });
    // accessible
    await page.addScriptTag({ content: AXE });
    const v = await page.evaluate(async () => (await axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
    assert.deepEqual(v, []);
    await ctx.close();
  });

  await test('Production build: no dashboard, no growth scripts, the same site', async () => {
    const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'folio-prod-'));
    execFileSync('node', [path.join(__dirname, '..', 'build.mjs'), '--production', `--out=${out}`], { stdio: 'ignore', env: { ...process.env, PUBLIC_GA_MEASUREMENT_ID: '' } }); // same analytics setting as the build under test
    assert.ok(!fs.existsSync(path.join(out, '_seo')), 'no dashboard');
    assert.ok(!fs.existsSync(path.join(out, 'assets', 'js', 'growth')), 'no dashboard scripts');
    assert.doesNotMatch(fs.readFileSync(path.join(out, 'robots.txt'), 'utf8'), /_seo/);
    const dev = fs.readFileSync(path.join(__dirname, '..', 'dist', 'sitemap.xml'), 'utf8');
    assert.equal(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8'), dev, 'same pages');
    assert.equal(fs.readFileSync(path.join(out, 'invoice-templates', 'plumber', 'index.html'), 'utf8'), fs.readFileSync(path.join(__dirname, '..', 'dist', 'invoice-templates', 'plumber', 'index.html'), 'utf8'));
    fs.rmSync(out, { recursive: true, force: true });
  });

  await test('Templates: matrix — 16 templates × 5 data sets, desktop + mobile: no overlap, nothing clipped', async () => {
    const logo = 'data:image/png;base64,' + fs.readFileSync(logoFile).toString('base64');
    const long = 'Northstar Design Studio & Partners International Holdings LLC';
    const sets = await (async () => {
      const ctx = await open('/app/');
      const ids = await ctx.page.evaluate(async () => (await import('/assets/js/core/templates.js')).TEMPLATES.map((t) => ({ id: t.id, groups: t.groups ? t.groups.options : [] })));
      await ctx.context.close();
      return ids;
    })();
    const datasets = (groups) => ({
      empty: {},
      one: { business: { name: 'Northstar Design Studio' }, client: { name: 'ABC Company' }, items: [{ description: 'Website Design', quantity: '1', price: '2500' }] },
      full: {
        business: { name: long, email: 'accounts-receivable@northstar-design-studio-international.com', phone: '+1 (312) 555-0187 ext. 2045', address: '1520 West Fulton Street, Building C, Suite 4400\nChicago, Illinois 60607-1234\nUnited States of America', website: 'northstar-design-studio-international.com', taxId: 'EIN 12-3456789', logo },
        client: { name: 'The Very Long Named Client Company of Greater Chicago and the Midwest Region Incorporated', email: 'accounts.payable.department@verylongclientcompany.example.com', address: 'Attn: Accounts Payable, Floor 37\n200 North LaSalle Street\nChicago, IL 60601-1003\nUnited States' },
        meta: { number: 'INV-2026-000123', project: 'Complete brand identity, website redesign and three-year maintenance agreement for the Midwest region', issueDate: '2026-10-01', dueDate: '2026-10-31', terms: 'net30' },
        items: Array.from({ length: 12 }, (_, i) => ({
          description: i % 3 === 0 ? `Phase ${i + 1}: strategy, research and stakeholder interviews across four regional offices\nIncludes a written report, two workshops and up to three rounds of revisions` : `Line ${i + 1} — production work with a reasonably long description that wraps onto a second line`,
          quantity: i === 1 ? '1250' : String(i + 1), price: i === 2 ? '987654.32' : '1234.56', group: groups.length ? groups[i % groups.length] : '',
        })),
        adjustments: { taxRate: '8.875', taxLabel: 'Sales tax', discountType: 'percent', discountValue: '12.5', shipping: '1250', shippingLabel: 'Courier and freight', paid: '25000' },
        payment: 'Wire transfer to Northstar Design Studio & Partners International Holdings LLC\nFirst Coastal Bank · Account 0001 2345 6789 · Routing 121000358 · SWIFT FCBKUS33XXX\nPlease quote the invoice number INV-2026-000123 as the payment reference.',
        notes: 'Thank you for your business. Late payments are subject to a 1.5% monthly service charge. All work remains the property of the studio until paid in full. Questions about this invoice: accounts-receivable@northstar-design-studio-international.com.',
      },
      sparse: { business: { name: 'Jo Lee' }, client: { name: 'Sam' }, meta: { terms: 'custom', dueDate: '', project: '' }, items: [{ description: 'Consultation', quantity: '1', price: '90' }] },
      huge: { business: { name: 'Big Ticket Ltd', logo }, client: { name: 'Mega Corp' }, items: [{ description: 'Infrastructure', quantity: '1', price: '123456789.99' }], adjustments: { taxRate: '20', discountValue: '5' } },
    });

    const checkLayout = () => {
      const doc = document.querySelector('[data-preview] .doc');
      const box = doc.getBoundingClientRect();
      const words = [];
      const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let n;
      while ((n = walker.nextNode())) {
        const cs = getComputedStyle(n.parentElement);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        for (const m of n.data.matchAll(/\S+/g)) {
          range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
          for (const r of range.getClientRects()) if (r.width > 0.5) words.push({ t: m[0], l: r.left, r: r.right, top: r.top, b: r.bottom });
        }
      }
      const problems = [];
      for (const w of words) if (w.l < box.left - 1 || w.r > box.right + 1) problems.push(`outside page: ${w.t}`);
      for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) {
        const a = words[i], b = words[j];
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const oy = Math.min(a.b, b.b) - Math.max(a.top, b.top);
        if (ox > 1.5 && oy > Math.min(a.b - a.top, b.b - b.top) * 0.35) problems.push(`overlap: "${a.t}" / "${b.t}"`);
      }
      return { problems: problems.slice(0, 5), count: words.length };
    };

    let checked = 0;
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
      const { viewport, ...rest } = { viewport: { width: vp.width, height: vp.height }, ...vp };
      const { context, page } = await open('/app/', { viewport, isMobile: rest.isMobile, hasTouch: rest.hasTouch });
      if (vp.width < 1024) await page.click('[data-view="preview"]');
      for (const t of sets) {
        for (const [name, data] of Object.entries(datasets(t.groups))) {
          await page.evaluate(([d, id]) => window.folio.replace({ ...d, meta: { ...(d.meta || {}), template: id } }), [data, t.id]);
          await page.waitForTimeout(60);
          await page.evaluate(() => Promise.all([...document.querySelectorAll('[data-preview] img')].map((i) => i.decode().catch(() => {}))));
          const res = await page.evaluate(checkLayout);
          assert.deepEqual(res.problems, [], `${t.id}/${name} @${vp.width}`);
          assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${t.id}/${name} @${vp.width}: page overflow`);
          if (name === 'full' && vp.width === 1440) await page.locator('[data-preview] .doc').screenshot({ path: path.join(OUT, `matrix-${t.id}-full.png`) });
          checked++;
        }
      }
      await context.close();
    }
    console.log(`      ${checked} template × data × viewport combinations checked`);
  });

  await test('Templates: every template exports a clean PDF (stress data) and prints only the invoice', async () => {
    const { context, page } = await open('/app/');
    const ids = await page.evaluate(async () => (await import('/assets/js/core/templates.js')).TEMPLATES.map((t) => ({ id: t.id, groups: t.groups ? t.groups.options : [] })));
    const logo = 'data:image/png;base64,' + fs.readFileSync(logoFile).toString('base64');
    for (const t of ids) {
      const data = {
        business: { name: 'Northstar Design Studio', email: 'billing@northstar.studio', address: '1520 West Fulton Street\nChicago, IL 60607', logo },
        client: { name: 'ABC Company', address: '200 North LaSalle Street\nChicago, IL 60601' },
        meta: { number: `T-${t.id.toUpperCase()}`, project: 'Website redesign', template: t.id },
        items: Array.from({ length: 28 }, (_, i) => ({ description: `Line item ${i + 1}, website design and build work for the spring campaign`, quantity: '2', price: '125', group: t.groups.length ? t.groups[i % t.groups.length] : '' })),
        adjustments: { taxRate: '10', discountValue: '5', paid: '1000' },
        payment: 'Bank transfer · Account 0001 2345 · Routing 121000358',
        notes: 'Thank you for your business.',
      };
      await page.evaluate((d) => window.folio.replace(d), data);
      await settle(page);
      const due = await page.locator('[data-sum="due"]').innerText(); // the balance, wherever the template sets it
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.appbar [data-action="pdf"]')]);
      const file = path.join(OUT, `tpl-${t.id}.pdf`);
      await dl.saveAs(file);
      if (!POPPLER) continue;
      const text = pdfText(file);
      const pages = pdfPages(file);
      assert.ok(pages >= 2 && pages <= 4, `${t.id}: ${pages} pages`);
      for (let i = 1; i <= 28; i++) assert.ok(text.includes(`Line item ${i},`), `${t.id}: item ${i} present`);
      const flat = text.replace(/\s+/g, ' ').toLowerCase(); // names may wrap in narrow columns
      for (const s of ['Northstar Design Studio', 'ABC Company', 'Website redesign', due, `PAGE ${pages} OF ${pages}`]) assert.ok(flat.includes(s.toLowerCase()), `${t.id}: PDF has ${s}`);
      for (const ui of ['Download PDF', 'Choose a template', 'Change template', 'Add item']) assert.ok(!text.includes(ui), `${t.id}: no UI text`);
      // every continuation page repeats the table heading
      const perPage = execFileSync('pdftotext', ['-f', String(pages), '-l', String(pages), file, '-'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const heading = (await page.locator('[data-preview] .doc__items thead th').evaluateAll((ths) => ths.map((th) => th.textContent.trim().toUpperCase())))[0];
      assert.ok(perPage.includes(heading) || !/Line item/.test(perPage), `${t.id}: header repeated on page ${pages}`);
      execFileSync('pdftoppm', ['-r', '45', '-png', '-f', '1', '-l', '2', file, path.join(OUT, `tpl-${t.id}`)]);
    }
    // print: the chosen template, and nothing of the app
    await page.evaluate(() => { window.print = () => {}; });
    for (const id of ['statement', 'ledger'].map((c) => ({ statement: 'executive', ledger: 'construction' }[c]))) {
      await page.evaluate((tid) => window.folio.replace({ business: { name: 'Northstar Design Studio' }, client: { name: 'ABC Company' }, items: [{ description: 'Website Design', quantity: '1', price: '2500' }], meta: { template: tid } }), id);
      await page.click('.appbar [data-action="print"]');
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.locator('.print-root .doc').getAttribute('data-template'), id);
      const f = path.join(OUT, `print-${id}.pdf`);
      await page.pdf({ path: f, preferCSSPageSize: true, printBackground: true });
      await page.emulateMedia({ media: 'screen' });
      if (POPPLER) {
        const t = pdfText(f);
        assert.ok(t.includes('ABC Company') && t.includes('$2,500.00') && !t.includes('Change template'), `print ${id}`);
        assert.equal(pdfPages(f), 1);
      }
    }
    await context.close();
  });

  // ------------------------------------------------------------------ 6. marketing site
  await test('Marketing: navigation, CTAs into the app, how-it-works anchor, mobile menu', async () => {
    const { context, page } = await open('/');
    for (const [label, url] of [['Features', '/features/'], ['Pricing', '/pricing/'], ['About', '/about/'], ['FAQ', '/faq/']]) {
      await page.click(`.site-nav >> text=${label}`);
      await page.waitForURL(BASE + url);
      assert.equal(await page.locator('h1').count(), 1);
      // every marketing page offers the app in the header
      assert.equal(await page.locator('.site-nav__cta a').getAttribute('href'), '../app/');
    }
    await page.goto(BASE + '/');
    await page.click('a[href="#how-it-works"]');
    await page.waitForTimeout(200);
    const top = await page.locator('#how-it-works').boundingBox();
    assert.ok(top.y < 200, 'See how it works scrolls to the section');
    await page.goto(BASE + '/pricing/');
    await page.click('a[href*="topic=pro"]');
    await page.waitForURL(/contact\/\?topic=pro/);
    assert.equal(await page.locator('input[value="pro"]').isChecked(), true);
    await context.close();

    const m = await open('/about/', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    assert.equal(await m.page.locator('.site-header__mobile-cta').isVisible(), true, 'Create button in mobile header');
    await m.page.click('[data-menu-toggle]');
    await m.page.waitForSelector('.mobile-menu.is-open');
    await m.page.waitForTimeout(400);
    await m.page.screenshot({ path: path.join(OUT, 'mobile-menu.png') });
    await m.page.keyboard.press('Escape');
    await m.page.waitForSelector('.mobile-menu', { state: 'hidden' });
    await m.page.click('[data-menu-toggle]');
    await m.page.click('.mobile-menu >> text=Create an invoice');
    await m.page.waitForURL(BASE + '/app/');
    await m.context.close();
  });

  await test('Links: every internal link and anchor resolves; external links are https', async () => {
    const ctx = await browser.newContext();
    const ids = {};
    const links = [];
    const sitemap = await (await ctx.request.get(BASE + '/sitemap.xml')).text();
    const all = [...new Set([...PAGES, ...[...sitemap.matchAll(new RegExp(`<loc>${SITE_RE}([^<]*)</loc>`, 'g'))].map((m) => m[1])])];
    for (const url of all) {
      const page = await ctx.newPage();
      await page.goto(BASE + url);
      ids[url] = await page.evaluate(() => [...document.querySelectorAll('[id]')].map((e) => e.id));
      (await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.getAttribute('href'), abs: a.href }))))
        .forEach((l) => links.push({ from: url, ...l }));
      await page.close();
    }
    const seen = new Set();
    for (const l of links) {
      if (/^mailto:/.test(l.href)) { assert.match(l.href, /^mailto:[^@]+@[^@]+\.[a-z]{2,}$/); continue; }
      const u = new URL(l.abs);
      if (u.origin !== BASE) { assert.equal(u.protocol, 'https:', l.href); continue; }
      if (!seen.has(u.pathname)) {
        assert.equal((await ctx.request.get(BASE + u.pathname)).status(), 200, `${l.from} → ${l.href}`);
        seen.add(u.pathname);
      }
      if (u.hash) assert.ok(ids[u.pathname]?.includes(u.hash.slice(1)), `${l.from} → ${l.href} (missing #id)`);
    }
    assert.equal((await ctx.request.get(BASE + '/no/such/page/')).status(), 404);
    await ctx.close();
    console.log(`      ${links.length} links checked`);
  });

  await test('Contact form: validation and pre-written email fallback', async () => {
    const { context, page } = await open('/contact/');
    await page.click('button[type="submit"]');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'c-name');
    assert.equal(await page.locator('#e-name').innerText(), 'Please tell us your name.');
    await page.fill('#c-name', 'Jane Cooper');
    await page.fill('#c-email', 'jane@example');
    await page.locator('#c-email').blur();
    assert.match(await page.locator('#e-email').innerText(), /incomplete/);
    await page.fill('#c-email', 'jane@example.com');
    await page.fill('#c-message', 'Could Folio support Swedish invoices?');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-form-status]:not([hidden])');
    await context.close();
  });

  // ------------------------------------------------------------------ 7. layout at every breakpoint
  await test('Layout: no overflow or clipped text on any page at 1440/1200/1024/768/480/390', async () => {
    for (const url of PAGES) {
      for (const w of WIDTHS) {
        const { context, page } = await open(url, { viewport: { width: w, height: 900 } });
        if (url === '/app/') { await page.click('[data-action="example"]'); await settle(page); }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(overflow <= 0, `${url} @${w}: overflow ${overflow}px`);
        const offscreen = await page.evaluate(() => [...document.querySelectorAll('h1, h2, h3, p, a, button, li, dd, label')]
          .filter((e) => !e.closest('.plate__surface, .preview, .print-root, dialog, .visually-hidden, .hp, .ui-frag') && e.getClientRects().length)
          .filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; })
          .map((e) => e.outerHTML.slice(0, 70)));
        assert.deepEqual(offscreen, [], `${url} @${w}`);
        if ([1440, 768, 390].includes(w)) await page.screenshot({ path: path.join(OUT, `page${url.replace(/\W+/g, '-')}${w}.png`), fullPage: true });
        await context.close();
      }
    }
  });

  // ------------------------------------------------------------------ 8. accessibility
  await test('Accessibility: axe-core (WCAG 2.2 AA) on every page and the open library, desktop and mobile', async () => {
    for (const url of [...PAGES, '/404.html']) {
      for (const w of [1440, 390]) {
        const { context, page } = await open(url, { viewport: { width: w, height: 900 } });
        const run = async (label) => {
          await page.addScriptTag({ content: AXE });
          const v = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }))
            .violations.map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
          assert.deepEqual(v, [], `${label} @${w}`);
        };
        if (url === '/app/') {
          await page.click('[data-action="example"]');
          await settle(page);
          await run('/app/');
          await page.click('.appbar [data-action="library"]');
          await page.waitForSelector('dialog[open]');
          await run('/app/ library');
        } else {
          await run(url);
        }
        await context.close();
      }
    }
  });

  await test('Accessibility: keyboard — skip link, visible focus, library dialog', async () => {
    const { context, page } = await open('/app/');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'editor');
    const invisible = [];
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(60);
      const ok = await page.evaluate(() => {
        const el = document.activeElement;
        const cs = getComputedStyle(el);
        const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        const field = cs.boxShadow !== 'none';
        const wrap = el.closest('label') && getComputedStyle(el.closest('label')).outlineStyle !== 'none';
        return ring || field || wrap || el.className;
      });
      if (ok !== true) invisible.push(ok);
    }
    assert.deepEqual(invisible, []);
    await page.click('.appbar [data-action="library"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog[open]', { state: 'detached' }).catch(() => {});
    assert.equal(await page.locator('dialog[open]').count(), 0, 'Escape closes the library');
    await context.close();
  });

  // ------------------------------------------------------------------ 9. SEO, loading, errors
  await test('SEO: titles, descriptions, canonical, Open Graph, JSON-LD, sitemap', async () => {
    const ctx = await browser.newContext();
    const sitemap = await (await ctx.request.get(BASE + '/sitemap.xml')).text();
    const titles = new Set();
    for (const url of PAGES) {
      const page = await ctx.newPage();
      await page.goto(BASE + url);
      const m = await page.evaluate(() => ({
        title: document.title,
        desc: document.querySelector('meta[name=description]').content,
        canonical: document.querySelector('link[rel=canonical]').href,
        og: ['og:title', 'og:description', 'og:image', 'og:url'].every((p) => document.querySelector(`meta[property="${p}"]`)?.content),
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)['@type']),
      }));
      assert.ok(m.title.length <= 70 && !titles.has(m.title), `${url} title: ${m.title}`);
      titles.add(m.title);
      assert.ok(m.desc.length >= 80 && m.desc.length <= 170, `${url} description ${m.desc.length}`);
      assert.equal(m.canonical, `${SITE}${url}`);
      assert.ok(m.og);
      assert.ok(sitemap.includes(`${SITE}${url}<`), `${url} in sitemap`);
      if (url === '/') assert.deepEqual(m.ld, ['SoftwareApplication', 'Organization', 'WebSite']);
      if (url === '/app/') assert.deepEqual(m.ld, ['WebApplication']);
      if (url === '/faq/') assert.deepEqual(m.ld, ['FAQPage']);
      await page.close();
    }
    for (const a of ['/assets/og.jpg', '/assets/favicon.svg', '/assets/favicon-32.png', '/assets/apple-touch-icon.png', '/assets/icon-512.png', '/assets/site.webmanifest', '/robots.txt']) {
      assert.equal((await ctx.request.get(BASE + a)).status(), 200, a);
    }
    const home = await (await ctx.request.get(BASE + '/')).text();
    assert.match(home, /invoice generator/i);
    await ctx.close();
  });

  await test('Loading: page weight, no third-party requests, PDF engine loaded lazily', async () => {
    for (const url of PAGES) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const hosts = new Set();
      const urls = [];
      page.on('request', (r) => { hosts.add(new URL(r.url()).host); urls.push(r.url()); });
      await page.goto(BASE + url, { waitUntil: 'load' });
      const bytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0));
      assert.deepEqual([...hosts], [new URL(BASE).host], `${url}: no third-party requests`);
      if (url !== '/app/') assert.ok(!urls.some((u) => /jspdf|pdf-fonts/.test(u)), `${url} does not load the PDF engine`);
      console.log(`      ${url.padEnd(12)} ${String(Math.round(bytes / 1024)).padStart(4)} KB at load`);
      await context.close();
    }
  });

  // ------------------------------------------------------------------ payment links
  // The site with its payments function, wired to local stand-ins for Stripe and PayPal.
  const { startSite } = await import('./fixtures/site-server.mjs');
  const pay = await startSite();
  async function openPay(url, opts = {}) {
    const { viewport = { width: 1440, height: 900 }, ...rest } = opts;
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', acceptDownloads: true, ...rest });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && !/status of 410|status of 404|ERR_/.test(m.text()) && errors.push(m.text()));
    await page.goto(pay.origin + url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.folio && window.folio.payments && window.folio.payments.enabled);
    return { context, page, errors };
  }
  const eventsOf = (page, name) => page.evaluate((n) => (window.folioEvents || []).filter((e) => e.name === n).map((e) => e.props), name);

  await test('Payment links: Stripe — connect once, one click, on the invoice with a QR code; the PDF and print carry a working link', async () => {
    const { context, page, errors } = await openPay('/app/?template=classic&example');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const block = page.locator('div.paylink');
    assert.ok(await block.isVisible(), 'the payment-link block appears when the service is configured');
    assert.equal((await page.locator('[data-paylink="create"]').innerText()).trim().toUpperCase(), 'CREATE STRIPE PAYMENT LINK');
    await page.click('[data-paylink="create"]');
    assert.ok(await page.locator('[data-connect="stripe"]').isVisible(), 'first: connect the account that receives the money');
    await Promise.all([page.waitForURL(/\/onboarding\/acct_/), page.click('[data-paylink="connect-stripe"]')]);
    await Promise.all([page.waitForURL(/\/app\//), page.click('button')]); // Stripe's onboarding (stand-in), then back
    await page.waitForFunction(() => window.folio.invoice.paylink, null, { timeout: 10000 });
    const link = await page.evaluate(() => window.folio.invoice.paylink);
    const due = await page.evaluate(() => Math.round(window.folio.totals.due * 100));
    assert.equal(link.amount, due, 'the link is for this invoice’s amount due');
    assert.equal(link.provider, 'stripe');
    assert.match(link.url, new RegExp(`^${pay.origin.replace(/[.:/]/g, '\\$&')}/pay/[0-9a-z]{20}$`));
    assert.equal(await page.locator('[data-paylink-created]').innerText(), 'Payment link created');
    assert.equal(await page.locator('[data-paylink-status]').innerText(), 'UNPAID');
    await page.click('[data-paylink="copy"]');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), link.url);
    assert.equal(await page.locator('[data-paylink="open"]').getAttribute('href'), `${link.url}?preview`);
    assert.equal(await page.locator('[data-preview] .doc__pay-btn').count(), 0, 'not on the invoice until added');
    await page.click('[data-paylink="toggle"]');
    await page.check('[data-paylink-qr]');
    await settle(page);
    assert.equal(await page.locator('[data-preview] .doc__pay-btn').getAttribute('href'), link.url);
    assert.match(await page.locator('[data-preview] .doc__pay-btn').innerText(), /PAY INVOICE/);
    assert.match(await page.locator('[data-preview] .doc__pay-via').innerText(), /Secure payment via Stripe/);
    assert.equal(await page.locator('[data-preview] .doc__qr').getAttribute('data-qr'), link.url);
    assert.match(await page.locator('[data-privacy-note]').innerText(), /shares this invoice’s number and amount/);
    await page.locator('[data-preview] .doc__note--pay').screenshot({ path: path.join(OUT, 'paylink-invoice.png') });
    const axeRun = (target) => page.evaluate(async ([src, sel]) => { if (!window.axe) eval(src); return (await window.axe.run(document.querySelector(sel), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes.length}`); }, [AXE, target]);
    assert.deepEqual(await axeRun('div.paylink'), [], 'the payment-link block passes axe');
    const payer = await context.newPage();
    await payer.goto(`${link.url}?preview`);
    assert.deepEqual(await payer.evaluate(async (src) => { eval(src); return (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => v.id); }, AXE), [], 'the client’s payment page passes axe');
    await payer.close();
    const created = await eventsOf(page, 'payment_link_created');
    assert.equal(created.length, 1);
    assert.equal(created[0].provider, 'stripe');
    assert.equal(created[0].template, 'classic');
    assert.equal(created[0].page_type, 'app');
    assert.ok(!JSON.stringify(await page.evaluate(() => window.folioEvents)).includes(link.id), 'analytics never gets the link');

    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.appbar [data-action="pdf"]')]);
    const file = path.join(OUT, 'paylink.pdf');
    await dl.saveAs(file);
    if (POPPLER) {
      assert.deepEqual(pdfUris(file), [link.url], 'the button is a clickable link in the PDF');
      assert.ok(pdfText(file).includes(link.url.replace(/^https?:\/\//, '')), 'the address is printed');
      assert.equal(pdfQr(file), link.url, 'the QR code in the PDF scans');
      assert.equal(pdfPages(file), 1);
    }
    // Print: the copy sent to the printer has the same link and code.
    await page.evaluate(() => { window.print = () => {}; });
    await page.click('.appbar [data-action="print"]');
    await page.emulateMedia({ media: 'print' });
    const printed = path.join(OUT, 'paylink-print.pdf');
    await page.pdf({ path: printed, preferCSSPageSize: true, printBackground: true });
    if (POPPLER) {
      assert.ok(pdfUris(printed).includes(link.url), 'printed to PDF, the link still works');
      assert.equal(pdfQr(printed), link.url, 'the printed QR code scans');
    }
    assert.deepEqual(errors, []);
    await context.close();
  });

  await test('Payment links: the total changes → regenerate; the client pays; the invoice shows Paid', async () => {
    const { context, page, errors } = await openPay('/app/?template=modern&example');
    // Already connected in this test? No: a fresh browser connects again (the stand-in onboarding is instant).
    await page.click('[data-paylink="create"]');
    await Promise.all([page.waitForURL(/\/onboarding\//), page.click('[data-paylink="connect-stripe"]')]);
    await Promise.all([page.waitForURL(/\/app\//), page.click('button')]);
    await page.waitForFunction(() => window.folio.invoice.paylink);
    const first = await page.evaluate(() => window.folio.invoice.paylink);
    await page.click('[data-paylink="toggle"]');
    await page.locator('.item').first().locator('[data-key="price"]').fill('3100');
    await settle(page);
    assert.equal(await page.locator('[data-paylink-warn-text]').innerText(), 'Invoice total changed — payment link needs to be regenerated.');
    assert.equal(await page.locator('[data-preview] .doc__pay-btn').count(), 0, 'a link for the old amount is never left on the invoice');
    assert.equal(await page.locator('[data-paylink="copy"]').isVisible(), false, 'and it can’t be copied');
    await page.click('[data-paylink="regenerate"]');
    await page.waitForFunction((id) => window.folio.invoice.paylink.id !== id, first.id);
    const second = await page.evaluate(() => window.folio.invoice.paylink);
    assert.equal(second.amount, await page.evaluate(() => Math.round(window.folio.totals.due * 100)));
    assert.equal(second.onInvoice, true, 'still on the invoice');
    assert.equal(await page.locator('[data-preview] .doc__pay-btn').getAttribute('href'), second.url);
    const old = await page.request.get(first.url);
    assert.equal(old.status(), 410);
    assert.match(await old.text(), /This payment link has been replaced\./);

    // The client opens the link and pays on Stripe (stand-in).
    const client = await context.newPage();
    await client.goto(second.url);
    await client.waitForURL(/\/checkout\/cs_test_/);
    assert.match(await client.locator('[data-amount]').innerText(), new RegExp(`^${second.amount} usd`));
    await client.click('[data-pay]');
    await client.waitForURL(/\/pay\/.*\/done/);
    assert.match(await client.locator('h1').innerText(), /is paid\./);
    await client.close();

    await page.evaluate(() => window.folio.payments.sync());
    await page.waitForFunction(() => window.folio.invoice.paylink.status === 'paid');
    await settle(page);
    assert.equal(await page.locator('[data-paylink-status]').innerText(), 'PAID');
    assert.match(await page.locator('[data-paylink-created]').innerText(), /^Paid \$[\d,]+\.\d\d on .* via Stripe$/);
    assert.equal(await page.locator('[data-preview] .doc__paid-mark').innerText(), 'PAID');
    assert.equal(await page.locator('[data-preview] .doc__pay-btn').count(), 0);
    assert.equal((await eventsOf(page, 'payment_link_clicked')).length, 1);
    const done = await eventsOf(page, 'invoice_payment_completed');
    assert.equal(done.length, 1);
    assert.equal(done[0].provider, 'stripe');
    await page.reload();
    await page.waitForFunction(() => window.folio && window.folio.invoice.paylink);
    assert.equal(await page.evaluate(() => window.folio.invoice.paylink.status), 'paid', 'kept after reload');
    await page.click('.appbar [data-action="library"]');
    assert.match(await page.locator('.lib-item.is-current .lib-item__client').innerText(), /· Paid$/);
    assert.deepEqual(errors, []);
    await context.close();
  });

  await test('Payment links: PayPal — email, link, approval, capture, Paid; currencies PayPal can’t take', async () => {
    const { context, page, errors } = await openPay('/app/?template=contractor&example');
    await page.check('input[name="paylink-provider"][value="paypal"]', { force: true });
    assert.equal((await page.locator('[data-paylink="create"]').innerText()).trim().toUpperCase(), 'CREATE PAYPAL PAYMENT LINK');
    await page.click('[data-paylink="create"]');
    await page.fill('[data-paylink-payee]', 'not-an-email');
    await page.click('[data-paylink="connect-paypal"]');
    assert.match(await page.locator('[data-paylink-error]').innerText(), /email address of the PayPal account/);
    await page.fill('[data-paylink-payee]', 'accounts@ridgeline.example');
    await page.click('[data-paylink="connect-paypal"]');
    await page.waitForFunction(() => window.folio.invoice.paylink);
    const link = await page.evaluate(() => window.folio.invoice.paylink);
    assert.equal(link.provider, 'paypal');
    assert.equal(pay.paypal.lastOrder().purchase_units[0].payee.email_address, 'accounts@ridgeline.example');
    await page.click('[data-paylink="toggle"]');
    await settle(page);
    assert.match(await page.locator('[data-preview] .doc__pay-via').innerText(), /Pay with PayPal/);
    const client = await context.newPage();
    await client.goto(link.url);
    await client.waitForURL(/\/checkoutnow\//);
    await client.click('[data-approve]');
    await client.waitForURL(/\/paypal\?token=/);
    assert.match(await client.locator('h1').innerText(), /is paid\./);
    await client.close();
    await page.evaluate(() => window.folio.payments.sync());
    await page.waitForFunction(() => window.folio.invoice.paylink.status === 'paid');
    // INR: PayPal can't take it; the user is told before anything is created.
    await page.click('.appbar [data-action="new"]');
    await page.locator('.item').first().locator('[data-key="description"]').fill('Work');
    await page.locator('.item').first().locator('[data-key="price"]').fill('100');
    await page.selectOption('[data-currency-select]', 'INR');
    await page.check('input[name="paylink-provider"][value="paypal"]', { force: true });
    await page.click('[data-paylink="create"]');
    assert.match(await page.locator('[data-paylink-error]').innerText(), /PayPal doesn’t accept payments in INR/);
    assert.equal(await page.evaluate(() => window.folio.invoice.paylink), null);
    assert.deepEqual(errors, []);
    await context.close();
  });

  await test('Payment links: without the payment service nothing appears and nothing fails', async () => {
    const { context, page } = await open('/app/?example');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('div.paylink').isVisible(), false);
    assert.equal(await page.evaluate(() => window.folio.payments.enabled), false);
    const res = await page.request.get(BASE + '/api/payments/config');
    assert.equal(res.status(), 200, 'the static fallback answers');
    assert.deepEqual((await res.json()).providers, { stripe: false, paypal: false });
    await context.close();
  });

  // ------------------------------------------------------------------ invoice fonts
  await test('Fonts: Modern + Garamond — chosen in the picker, kept across templates and reloads, embedded in the PDF', async () => {
    const { context, page } = await open('/app/?template=modern&example');
    assert.equal(await page.locator('[data-font-name]').innerText(), 'Template default');
    await page.click('[data-action="fonts"]');
    await page.waitForSelector('dialog[data-fonts][open]');
    const groups = await page.locator('.font-group__title').allInnerTexts();
    assert.deepEqual(groups.map((g) => g.toUpperCase()), ['RECOMMENDED', 'SERIF', 'SANS', 'MONOSPACE', 'YOUR FONTS']);
    assert.equal(await page.locator('.font-opt[aria-pressed="true"]').getAttribute('data-font-id'), '');
    assert.match(await page.locator('.font-opt[data-font-id="lora"] .font-opt__sample').getAttribute('style'), /Folio Lora/, 'each option is shown in its own font');
    const results = await page.evaluate(async (src) => { eval(src); return (await window.axe.run(document.querySelector('dialog[data-fonts]'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => v.id); }, AXE);
    assert.deepEqual(results, [], 'the picker passes axe');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.fontId), 'inter', 'arrow keys move through the list');
    await page.click('.font-opt[data-font-id="eb-garamond"]');
    await page.waitForSelector('dialog[data-fonts]:not([open])', { state: 'attached' });
    await settle(page);
    assert.equal(await page.locator('[data-font-name]').innerText(), 'EB Garamond');
    assert.match(await page.locator('[data-preview] .doc').getAttribute('style'), /--serif: "EB Garamond".*--sans: "EB Garamond".*--d-scale: 1\.1\d+/);
    assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('[data-preview] .doc__business')).fontFamily), /^"EB Garamond"/);
    await pickTemplate(page, 'executive');
    assert.equal(await page.evaluate(() => window.folio.invoice.meta.font), 'eb-garamond', 'switching template keeps the font');
    await page.reload();
    await page.waitForFunction(() => window.folio && window.folio.invoice);
    assert.equal(await page.evaluate(() => [window.folio.invoice.meta.font, window.folio.invoice.meta.template].join()), 'eb-garamond,executive');
    // Inter: a curated font embedded in the PDF
    await page.click('[data-action="fonts"]');
    await page.click('.font-opt[data-font-id="inter"]');
    await settle(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.appbar [data-action="pdf"]')]);
    const file = path.join(OUT, 'font-inter.pdf');
    await dl.saveAs(file);
    if (POPPLER) {
      assert.equal((pdfFonts(file).match(/Folio-custom/g) || []).length, 2, 'Inter regular and semibold are embedded');
      assert.ok(pdfText(file).includes(await page.locator('[data-sum="total"]').innerText()));
      assert.ok(!pdfText(file).includes('?'), 'no missing characters');
    }
    // the next invoice starts in the same font
    await page.click('.appbar [data-action="new"]');
    assert.equal(await page.evaluate(() => window.folio.invoice.meta.font), 'inter');
    await context.close();
  });

  await test('Fonts: device fonts only after the user asks; uploads stay on the device; the PDF says when it can’t include one', async () => {
    const SYS = { LiberationSans: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 'LiberationSans-Bold': '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 'Loma-Bold': '/usr/share/fonts/opentype/tlwg/Loma-Bold.otf' };
    const haveSys = Object.values(SYS).every((f) => fs.existsSync(f));
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
    await context.route('**/__device-fonts/*', (route) => route.fulfill({ body: fs.readFileSync(SYS[decodeURIComponent(route.request().url().split('/__device-fonts/')[1])]) }));
    // A stand-in for the Local Font Access API (Chromium's needs a real permission prompt).
    await context.addInitScript(() => {
      const faces = [['Liberation Sans', 'Regular', 'LiberationSans'], ['Liberation Sans', 'Bold', 'LiberationSans-Bold'], ['Loma', 'Bold', 'Loma-Bold']];
      window.__fontQueries = 0;
      window.queryLocalFonts = async (opts = {}) => {
        window.__fontQueries += 1;
        if (window.__denyFonts) throw new DOMException('denied', 'NotAllowedError');
        const list = faces.map(([family, style, ps]) => ({ family, style, fullName: `${family} ${style}`, postscriptName: ps, blob: async () => (await fetch(`/__device-fonts/${ps}`)).blob() }));
        return opts.postscriptNames ? list.filter((f) => opts.postscriptNames.includes(f.postscriptName)) : list;
      };
    });
    const page = await context.newPage();
    const sent = [];
    page.on('request', (r) => r.method() !== 'GET' && sent.push(r.url()));
    await page.goto(BASE + '/app/?example', { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.__fontQueries), 0, 'no font is looked up until the user asks');
    await page.click('[data-action="fonts"]');
    await page.evaluate(() => { window.__denyFonts = true; });
    await page.click('[data-font-scan]');
    await page.waitForSelector('[data-toast][data-kind="error"]');
    assert.match(await page.locator('[data-toast]').innerText(), /wasn’t allowed\. You can upload a font file instead/);
    await page.evaluate(() => { window.__denyFonts = false; });
    if (haveSys) {
      await page.click('[data-font-scan]');
      await page.waitForSelector('[data-local-family="Liberation Sans"]');
      assert.match(await page.locator('[data-font-count]').innerText(), /2 fonts on this device/);
      await page.fill('[data-font-search]', 'lib');
      assert.equal(await page.locator('[data-local-family]').count(), 1, 'search narrows the list');
      await page.click('[data-local-family="Liberation Sans"]');
      await settle(page);
      assert.equal(await page.evaluate(() => window.folio.invoice.meta.font), 'local:LiberationSans');
      assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('[data-preview] .doc__business')).fontFamily), /Folio User local LiberationSans/);
      let [dl] = await Promise.all([page.waitForEvent('download'), page.click('.appbar [data-action="pdf"]')]);
      let file = path.join(OUT, 'font-device.pdf');
      await dl.saveAs(file);
      if (POPPLER) assert.equal((pdfFonts(file).match(/Folio-custom/g) || []).length, 2, 'a TrueType device font is embedded, regular and bold');
      // An OpenType-CFF device font: shown on screen, but the PDF honestly falls back.
      await page.click('[data-action="fonts"]');
      await page.click('[data-font-scan]');
      await page.click('[data-local-family="Loma"]');
      await settle(page);
      assert.match(await page.locator('[data-font-note]').innerText(), /OpenType \(CFF\) font/);
      [dl] = await Promise.all([page.waitForEvent('download'), page.click('.appbar [data-action="pdf"]')]);
      file = path.join(OUT, 'font-cff.pdf');
      await dl.saveAs(file);
      assert.match(await page.locator('[data-toast]').innerText(), /isn’t in the PDF because it is an OpenType \(CFF\) font.*The PDF uses EB Garamond; Print → Save as PDF keeps your font\./);
      if (POPPLER) assert.ok(!pdfFonts(file).includes('Folio-custom'));
    }
    // Uploads: a TrueType file is embedded; WOFF2 is shown but not embedded.
    await page.click('[data-action="fonts"]');
    await page.setInputFiles('[data-font-upload]', path.join(__dirname, '..', 'src/assets/invoice-fonts/work-sans-regular.ttf'));
    await page.waitForFunction(() => /^upload:/.test(window.folio.invoice.meta.font));
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('.appbar [data-action="pdf"]')]);
    let file = path.join(OUT, 'font-upload-ttf.pdf');
    await dl.saveAs(file);
    if (POPPLER) assert.ok(pdfFonts(file).includes('Folio-custom'), 'an uploaded TrueType font is embedded');
    await page.click('[data-action="fonts"]');
    await page.setInputFiles('[data-font-upload]', path.join(__dirname, '..', 'src/assets/invoice-fonts/manrope-regular.woff2'));
    await page.waitForFunction(() => window.folio.fonts.items[0].format === 'woff2' && window.folio.invoice.meta.font === window.folio.fonts.items[0].id);
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('.appbar [data-action="pdf"]')]);
    file = path.join(OUT, 'font-upload-woff2.pdf');
    await dl.saveAs(file);
    assert.match(await page.locator('[data-toast]').innerText(), /WOFF2 files can only be shown on screen here/);
    // Not a font: refused, nothing changes
    const before = await page.evaluate(() => window.folio.invoice.meta.font);
    await page.click('[data-action="fonts"]');
    await page.setInputFiles('[data-font-upload]', { name: 'notes.ttf', mimeType: 'font/ttf', buffer: Buffer.from('not a font at all, just text') });
    await page.waitForSelector('[data-toast][data-kind="error"]');
    assert.equal(await page.evaluate(() => window.folio.invoice.meta.font), before);
    // After a reload, the uploaded font comes back from this browser's storage.
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForFunction((id) => window.folio && window.folio.fonts.available.has(id), before);
    // the invoice is drawn in the template's fonts until the browser's font store has loaded, then in the upload
    await page.waitForFunction(() => /Folio User upload/.test(getComputedStyle(document.querySelector('[data-preview] .doc__business')).fontFamily), null, { timeout: 5000 });
    assert.deepEqual(sent, [], 'no font or font list was sent anywhere');
    await context.close();
  });

  await test('Fonts: phones get a bottom sheet with no sideways scrolling; browsers without device fonts offer upload only', async () => {
    const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
    const context = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, reducedMotion: 'reduce' });
    await context.addInitScript(() => { delete Window.prototype.queryLocalFonts; delete window.queryLocalFonts; }); // like Safari and Firefox
    const page = await context.newPage();
    await page.goto(BASE + '/app/?example', { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => 'queryLocalFonts' in window), false);
    await page.locator('[data-action="fonts"]').scrollIntoViewIfNeeded();
    await page.click('[data-action="fonts"]');
    await page.waitForSelector('dialog[data-fonts][open]');
    const box = await page.locator('dialog[data-fonts]').boundingBox();
    assert.ok(Math.abs(box.x) < 1 && Math.abs(box.width - viewport.width) < 1, 'full width');
    assert.ok(Math.abs(box.y + box.height - viewport.height) < 2, 'anchored to the bottom edge');
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'no horizontal scroll');
    assert.equal(await page.evaluate(() => document.querySelector('.font-sheet__list').scrollWidth - document.querySelector('.font-sheet__list').clientWidth), 0);
    assert.equal(await page.locator('[data-font-scan]').isVisible(), false, 'no device-font scan where the API is missing');
    assert.ok(await page.locator('[data-font-unsupported]').isVisible());
    assert.ok(await page.locator('label:has([data-font-upload])').isVisible(), 'upload instead');
    for (const opt of await page.locator('.font-opt').all()) {
      const b = await opt.boundingBox();
      if (b) assert.ok(b.height >= 44, 'comfortable tap targets');
    }
    await page.screenshot({ path: path.join(OUT, 'fonts-mobile.png') });
    await page.click('.font-opt[data-font-id="ibm-plex-mono"]');
    await settle(page);
    assert.equal(await page.evaluate(() => window.folio.invoice.meta.font), 'ibm-plex-mono');
    await context.close();
  });

  await test('Fonts: matrix — 13 fonts × 16 templates, stress data with a payment link and QR code: no overlap, nothing clipped', async () => {
    const { context, page } = await open('/app/');
    const { templates, fonts } = await page.evaluate(async () => ({
      templates: (await import('/assets/js/core/templates.js')).TEMPLATES.map((t) => ({ id: t.id, groups: t.groups ? t.groups.options : [] })),
      fonts: (await import('/assets/js/core/fonts.js')).FONTS.map((f) => f.id),
    }));
    const data = (groups) => ({
      full: {
        business: { name: 'Northstar Design Studio & Partners International Holdings LLC', email: 'accounts-receivable@northstar-design-studio-international.com', phone: '+1 (312) 555-0187 ext. 2045', address: '1520 West Fulton Street, Building C, Suite 4400\nChicago, Illinois 60607-1234', website: 'northstar-design-studio-international.com', taxId: 'EIN 12-3456789' },
        client: { name: 'The Very Long Named Client Company of Greater Chicago and the Midwest Region Incorporated', email: 'accounts.payable.department@verylongclientcompany.example.com', address: 'Attn: Accounts Payable, Floor 37\n200 North LaSalle Street\nChicago, IL 60601-1003' },
        meta: { number: 'INV-2026-000123', project: 'Complete brand identity, website redesign and three-year maintenance agreement for the Midwest region', issueDate: '2026-10-01', dueDate: '2026-10-31', terms: 'net30' },
        items: Array.from({ length: 12 }, (_, i) => ({ description: i % 3 === 0 ? `Phase ${i + 1}: strategy, research and stakeholder interviews across four regional offices\nIncludes a written report and two workshops` : `Line ${i + 1} — production work with a reasonably long description that wraps onto a second line`, quantity: i === 1 ? '1250' : String(i + 1), price: i === 2 ? '987654.32' : '1234.56', group: groups.length ? groups[i % groups.length] : '' })),
        adjustments: { taxRate: '8.875', taxLabel: 'Sales tax', discountType: 'percent', discountValue: '12.5', shipping: '1250', shippingLabel: 'Courier and freight', paid: '25000' },
        payment: 'Wire transfer to Northstar Design Studio & Partners International Holdings LLC\nFirst Coastal Bank · Account 0001 2345 6789 · Routing 121000358',
        notes: 'Thank you for your business. Late payments are subject to a 1.5% monthly service charge.',
      },
      huge: { business: { name: 'Big Ticket Ltd' }, client: { name: 'Mega Corp' }, items: [{ description: 'Infrastructure', quantity: '1', price: '123456789.99' }], adjustments: { taxRate: '20', discountValue: '5' } },
    });
    const check = () => {
      const doc = document.querySelector('[data-preview] .doc');
      const box = doc.getBoundingClientRect();
      const words = [];
      const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let n;
      while ((n = walker.nextNode())) {
        for (const m of n.data.matchAll(/\S+/g)) {
          range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
          for (const r of range.getClientRects()) if (r.width > 0.5) words.push({ t: m[0], l: r.left, r: r.right, top: r.top, b: r.bottom });
        }
      }
      const out = [];
      for (const w of words) if (w.l < box.left - 1 || w.r > box.right + 1) out.push(`outside page: ${w.t}`);
      for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) {
        const a = words[i], b = words[j];
        if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1.5 && Math.min(a.b, b.b) - Math.max(a.top, b.top) > Math.min(a.b - a.top, b.b - b.top) * 0.35) out.push(`overlap: "${a.t}" / "${b.t}"`);
      }
      for (const q of [...doc.querySelectorAll('.doc__qr, .doc__pay-btn')].map((el) => el.getBoundingClientRect())) {
        if (q.left < box.left - 1 || q.right > box.right + 1) out.push('payment block outside the page');
      }
      return out.slice(0, 4);
    };
    let checked = 0;
    for (const font of fonts) for (const t of templates) for (const [name, d] of Object.entries(data(t.groups))) {
      await page.evaluate(([x, id, f]) => {
        window.folio.replace({ ...x, meta: { ...(x.meta || {}), template: id, font: f } });
        const inv = window.folio.invoice;
        window.folio.replace({ ...inv, paylink: { id: 'k3x9m2q7v8w4p1t6r5n0', url: 'https://folioinvoice.com/pay/k3x9m2q7v8w4p1t6r5n0', provider: 'stripe', amount: Math.round(window.folio.totals.due * 100), currency: inv.meta.currency, number: inv.meta.number.trim(), status: 'unpaid', createdAt: '', paidAt: '', onInvoice: true, qr: true } });
      }, [d, t.id, font]);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(40);
      assert.equal(await page.locator('[data-preview] .doc__qr').count(), 1);
      assert.deepEqual(await page.evaluate(check), [], `${font} / ${t.id} / ${name}`);
      checked++;
    }
    console.log(`      ${checked} font × template × data combinations checked`);
    await context.close();
  });

  await pay.close();

  await test('No console errors, page errors or failed requests anywhere', async () => {
    assert.deepEqual([...new Set(problems)], []);
  });

  await browser.close();
  server.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed · output in tests/output/\n`);
  process.exit(failed ? 1 : 0);
})();

/**
 * Folio app controller (/app/). Wires the editor, live preview, invoice
 * library, PDF export and printing together. All state lives in the browser.
 */
import { Library } from '../core/store.js';
import { computeTotals } from '../core/calc.js';
import { renderInvoice } from '../core/render.js';
import { createPdf, pdfFileName, loadPdfDeps } from '../core/pdf.js';
import { formatMoney } from '../core/format.js';
import { normalizeInvoice, isPristine, newId, createItem } from '../core/model.js';
import { sampleInvoice } from '../core/sample.js';
import { Editor } from './editor.js';
import { Preview } from './preview.js';
import { LibraryPanel } from './library.js';
import { TemplatePicker, thumbnail, fitDocs } from './picker.js';
import { templateById, templateBySlug, hasTemplate } from '../core/templates.js';
import { prefillFromParams } from '../core/tools.js';
import { track } from '../core/track.js';
import { startAnalytics } from '../core/analytics.js';
import { Usage } from './usage.js';
import { Payments } from './payments.js';
import { FontLibrary, notEmbeddableReason } from './fonts.js';
import { FontPicker } from './fontpicker.js';
import { fontById, fontStack } from '../core/fonts.js';
import { PAY_PROVIDERS } from '../core/paylink.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const PDF_DEPS = {
  jspdfUrl: new URL('../../vendor/jspdf.umd.min.js', import.meta.url).href,
  fontBase: new URL('../../pdf-fonts/', import.meta.url).href,
};
const INVOICE_FONTS = new URL('../../invoice-fonts/', import.meta.url).href;
const SAVE_DELAY = 350;
const PRESETS = new URL('../../data/templates.json', import.meta.url).href;

const library = new Library();
startAnalytics(window.folioAnalytics); // a no-op unless a GA4 measurement ID is configured
const usage = new Usage(library);
const fonts = new FontLibrary();
let invoice = null;
let totals = null;

// ---------------------------------------------------------------- toast
let toastTimer = 0;
function toast(message, kind = 'info') {
  const t = $('[data-toast]');
  t.textContent = message;
  t.dataset.kind = kind;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), kind === 'error' ? 6000 : 3500);
}

// ---------------------------------------------------------------- saving
let saveTimer = 0;
function setSaveState(text, state) {
  const s = $('[data-save-state]');
  s.textContent = text;
  s.dataset.state = state;
}
function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveState('Saving…', 'pending');
  saveTimer = setTimeout(saveNow, SAVE_DELAY);
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  const ok = library.save(invoice);
  if (ok) setSaveState('Saved', 'saved');
  else setSaveState(library.available ? 'Not saved — storage full' : 'Not saved — storage blocked', 'error');
  updateCount();
}
const flush = () => saveTimer && saveNow();
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

// ---------------------------------------------------------------- render
const preview = new Preview({ desk: $('.preview__desk'), fit: $('[data-fit]'), page: $('[data-preview]') });
const editor = new Editor($('[data-form]'), {
  onChange: () => {
    refresh();
    scheduleSave();
    usage.edited(invoice);
  },
  onError: (msg) => toast(msg, 'error'),
});

function refresh() {
  totals = computeTotals(invoice);
  editor.showTotals(totals);
  preview.render(invoice, totals);
  const total = formatMoney(totals.total, invoice.meta.currency);
  $('[data-tab-total]').textContent = total;
  const number = invoice.meta.number.trim();
  const client = invoice.client.name.trim();
  $('[data-doc-title]').textContent = [number ? `Invoice ${number}` : 'Untitled invoice', client].filter(Boolean).join(' · ');
  $('[data-intro]').hidden = !isPristine(invoice) || library.invoices.length > 1;
  showTemplate();
  showFont();
  payments.render();
  const l = invoice.paylink;
  $('[data-privacy-note]').textContent = l && ['unpaid', 'pending', 'failed', 'paid'].includes(l.status)
    ? `Saved in this browser only. The payment link shares this invoice’s number and amount with Folio’s payment service and ${PAY_PROVIDERS[l.provider].name}.`
    : 'Saved in this browser only. Nothing is uploaded.';
}

/** The "Font" field: the font's name, an "Aa" in it, and a note when the PDF can't include it. */
function showFont() {
  const id = invoice.meta.font || '';
  const f = fontById(id);
  const t = templateById(invoice.meta.template);
  const name = id ? f ? f.name : fonts.nameOf(id) || 'Font not available' : 'Template default';
  $('[data-font-name]').textContent = name;
  $('[data-font-sample]').style.fontFamily = f ? fontStack(f) : t.face === 'sans' ? 'var(--sans)' : 'var(--serif)';
  const item = fonts.items.find((x) => x.id === id);
  const note = $('[data-font-note]');
  let text = '';
  if (id && !f) text = 'This font isn’t available in this browser, so the invoice uses the template’s fonts.';
  else if (item && item.embeddable === false) text = `${notEmbeddableReason(item.reason, item.name)} PDFs use Folio’s font instead; Print → Save as PDF keeps yours.`;
  note.textContent = text;
  note.hidden = !text;
}

function useFont(id) {
  const before = invoice.meta.font || '';
  invoice.meta.font = id;
  refresh();
  scheduleSave();
  const f = fontById(id);
  if (before !== id) toast(id ? `Font: ${f ? f.name : fonts.nameOf(id)}. Your template and details are unchanged.` : 'Back to the template’s own fonts.');
}

/** The current template's name, description and thumbnail wherever the app shows them. */
let shownTemplate = null;
function showTemplate() {
  const t = templateById(invoice.meta.template);
  $$('[data-tpl-name]').forEach((el) => (el.textContent = t.name));
  $('[data-tpl-desc]').textContent = t.summary;
  const key = `${t.id}|${invoice.meta.paper}`;
  if (shownTemplate !== key) {
    shownTemplate = key;
    const thumb = $('[data-tpl-thumb]');
    thumb.setAttribute('data-doc-frame', '');
    thumb.innerHTML = thumbnail(null, t.id);
    fitDocs(thumb.parentElement);
  }
}

function useTemplate(id, { announce = true } = {}) {
  if (!hasTemplate(id)) return;
  const before = templateById(invoice.meta.template);
  editor.setTemplate(id); // changes meta.template only; onChange refreshes and saves
  const t = templateById(id);
  if (announce) track('template_selected', { template: t.slug, layout: t.id, cta: 'picker' });
  if (announce) toast(before.id === t.id ? `${t.name} is already selected.` : `Now using the ${t.name} template. Your details are unchanged.`);
}

function updateCount() {
  const n = library.invoices.length;
  $('[data-count]').textContent = n > 1 ? String(n) : '';
}

function open(inv, { focus = false } = {}) {
  flush();
  invoice = inv;
  library.setCurrent(inv.id);
  editor.load(invoice);
  refresh();
  updateCount();
  setSaveState(library.available ? 'Saved' : 'Not saved — storage blocked', library.available ? 'saved' : 'error');
  if (focus) $('[data-bind="client.name"]').focus({ preventScroll: true });
  payments.sync();
}

// ---------------------------------------------------------------- actions
function newInvoice() {
  flush();
  const inv = library.create();
  open(inv);
  usage.started(inv, { via: 'new', start: 'blank' });
  setView('edit');
  window.scrollTo({ top: 0 });
  toast(`New invoice ${inv.meta.number}. Your business details are already filled in.`);
  const target = inv.business.name ? '[data-bind="client.name"]' : '[data-bind="business.name"]';
  $(target).focus({ preventScroll: true });
}

/** Fill the open invoice with an example: the template page's own, if the app was opened from one. */
let pageSample = null;
function fillExample() {
  const sample = pageSample && pageSample.layout === invoice.meta.template ? pageSample.sample : undefined;
  const ex = sampleInvoice({ template: invoice.meta.template, sample, now: new Date() });
  ex.id = invoice.id;
  ex.createdAt = invoice.createdAt;
  ex.meta.number = invoice.meta.number || ex.meta.number;
  ex.meta.paper = invoice.meta.paper;
  if (invoice.business.name.trim()) ex.business = invoice.business; // never overwrite real details
  ex.meta.font = invoice.meta.font;
  ex.paylink = invoice.paylink;
  Object.assign(invoice, ex);
  editor.load(invoice);
  refresh();
  saveNow();
  toast('Example filled in. Change anything; the preview follows.');
}

async function downloadPdf(btn) {
  flush();
  const buttons = $$('[data-action="pdf"]');
  buttons.forEach((b) => b.setAttribute('aria-busy', 'true'));
  try {
    // The invoice's own font goes into the PDF when it can (TrueType); otherwise say which font is used.
    const face = templateById(invoice.meta.template).face;
    const { font, notice } = await fonts.pdfFont(invoice.meta.font, face, INVOICE_FONTS);
    const doc = await createPdf(invoice, totals, { ...PDF_DEPS, font });
    const name = pdfFileName(invoice);
    doc.save(name);
    usage.exported(invoice, 'pdf_downloaded');
    const fallback = face === 'sans' ? 'Hanken Grotesk' : 'EB Garamond';
    if (notice || doc.folioFont === 'fallback') toast(`Downloaded ${name}. ${notice || 'Your font couldn’t be included.'} The PDF uses ${fallback}; Print → Save as PDF keeps your font.`, 'info');
    else toast(`Downloaded ${name}`, 'success');
  } catch (err) {
    console.error(err);
    toast('The PDF could not be created. Check your connection and try again, or use Print → Save as PDF.', 'error');
  } finally {
    buttons.forEach((b) => b.removeAttribute('aria-busy'));
    if (btn) btn.focus();
  }
}

async function print() {
  flush();
  usage.exported(invoice, 'print_clicked');
  const root = $('[data-print-root]');
  root.innerHTML = renderInvoice(invoice, totals);
  // The invoice's font must be loaded before the page is printed.
  if (document.fonts) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  let pageStyle = $('#print-page-size');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'print-page-size';
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = `@page { size: ${invoice.meta.paper === 'a4' ? 'A4' : 'letter'}; margin: 0.6in 0.65in 0.6in; }`;
  const original = document.title;
  document.title = pdfFileName(invoice).replace(/\.pdf$/, ''); // default name for "Save as PDF"
  const done = () => {
    document.title = original;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

function downloadBackup() {
  flush();
  const data = { app: 'folio', version: 1, exportedAt: new Date().toISOString(), invoices: library.invoices };
  const pay = payments.backup();
  if (pay) data.payments = pay; // payment-link connections, so restored invoices keep their links
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `folio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Backup downloaded (${library.invoices.length} invoice${library.invoices.length === 1 ? '' : 's'}).`, 'success');
}

async function restoreBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.invoices;
    if (!Array.isArray(list)) throw new Error('not a backup');
    let added = 0;
    for (const raw of list) {
      const inv = normalizeInvoice(raw);
      if (library.get(inv.id)) {
        if (JSON.stringify(library.get(inv.id)) === JSON.stringify(inv)) continue;
        inv.id = newId('inv');
      }
      library.invoices.push(inv);
      added += 1;
    }
    library.persist();
    libraryPanel.render();
    updateCount();
    if (!Array.isArray(data)) payments.restore(data.payments);
    toast(added ? `Restored ${added} invoice${added === 1 ? '' : 's'}.` : 'Everything in that backup is already here.', 'success');
  } catch {
    toast('That file is not a Folio backup.', 'error');
  }
}

const libraryPanel = new LibraryPanel($('[data-library]'), library, {
  onOpen: (id) => open(library.get(id), { focus: false }),
  onDuplicate: (id) => {
    flush();
    const copy = library.duplicate(id);
    open(copy);
    usage.started(copy, { via: 'duplicate', start: 'duplicate' });
    setView('edit');
    toast(`Duplicated as ${copy.meta.number}. Dates are set to today.`);
  },
  onDelete: (id) => {
    const wasCurrent = id === library.currentId;
    const gone = library.get(id);
    const next = library.remove(id);
    if (wasCurrent) open(next);
    updateCount();
    toast(`Deleted ${gone?.meta.number || 'invoice'}.`);
  },
});

const fontPicker = new FontPicker($('[data-fonts]'), {
  library: fonts,
  getInvoice: () => invoice,
  onPick: (id) => useFont(id),
  toast,
});

const payments = new Payments($('[data-paylink]'), {
  getInvoice: () => invoice,
  getTotals: () => totals,
  update: (fn) => {
    fn(invoice);
    refresh();
    saveNow();
  },
  toast,
  eventProps: (inv) => ({ template: usage.templateOf(inv), layout: inv.meta.template }),
});

const picker = new TemplatePicker($('[data-templates]'), {
  getInvoice: () => invoice,
  onPick: (id) => {
    useTemplate(id);
    const target = $('.preview__bar') && window.matchMedia('(min-width: 64rem)').matches ? null : $('[data-action="templates"]');
    if (target) target.focus({ preventScroll: true });
  },
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  if (a === 'library') libraryPanel.open();
  else if (a === 'new') { libraryPanel.close(); newInvoice(); }
  else if (a === 'pdf') downloadPdf(btn);
  else if (a === 'print') print();
  else if (a === 'example') fillExample();
  else if (a === 'templates') picker.open();
  else if (a === 'fonts') fontPicker.open(btn);
  else if (a === 'backup') downloadBackup();
});
$('[data-restore-input]').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (file) restoreBackup(file);
});

// Keyboard shortcuts: ⌘/Ctrl+P prints the invoice (not the app), ⌘/Ctrl+S saves now.
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return;
  if (e.key === 'p') { e.preventDefault(); print(); }
  if (e.key === 's') { e.preventDefault(); saveNow(); toast('Saved in this browser.'); }
});

// ---------------------------------------------------------------- tabs (narrow screens)
const workspace = $('[data-workspace]');
function setView(view) {
  workspace.dataset.currentView = view;
  $$('[data-view]').forEach((tab) => {
    const on = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  if (view === 'preview') preview.scale();
}
$$('[data-view]').forEach((tab) =>
  tab.addEventListener('click', () => {
    setView(tab.dataset.view);
    window.scrollTo({ top: 0 });
  })
);

// ---------------------------------------------------------------- start
//
// Links into the generator (all parameters are removed from the address bar):
//   ?template=<id | slug | page>  start in a template. Template pages built from
//                                 src/content/templates may use a layout under
//                                 another name; their layouts and examples are in
//                                 assets/data/templates.json (fetched only when needed)
//   ?example                      …and fill in that page's example
//   ?new                          start a new invoice
//   ?number= ?item= ?qty= ?price= ?tax= ?taxLabel= ?discount= ?discountType=
//   ?shipping= ?paid= ?currency=  start with these values (the free tools)

/** A template page's layout and example; null if there is no such page. */
async function loadPreset(slug) {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  try {
    const res = await fetch(PRESETS);
    if (!res.ok) return null;
    const data = (await res.json())[slug];
    return data && hasTemplate(data.layout) ? data : null;
  } catch {
    return null;
  }
}

const params = new URLSearchParams(location.search);
const requested = (params.get('template') || '').trim().toLowerCase();
const registered = requested ? (hasTemplate(requested) ? templateById(requested) : templateBySlug(requested)) : null;
// A page's own example is only fetched when it is needed.
const preset = requested && (!registered || params.has('example')) ? await loadPreset(registered ? registered.slug : requested) : null;
const layout = preset ? templateById(preset.layout) : registered;
const prefill = prefillFromParams(params);
if (preset) pageSample = preset;

let first = library.ensureCurrent();
if (params.has('new') || ((layout || prefill) && !isPristine(first))) first = library.create();
open(first);
if (layout) useTemplate(layout.id, { announce: false });
if (prefill) {
  if (prefill.meta.number) invoice.meta.number = prefill.meta.number;
  if (prefill.meta.currency) invoice.meta.currency = prefill.meta.currency;
  if (prefill.items) invoice.items = prefill.items.map((it) => createItem(it));
  Object.assign(invoice.adjustments, prefill.adjustments);
  editor.load(invoice);
  refresh();
  saveNow();
}
if (params.has('example') && isPristine(invoice)) fillExample();

const name = preset ? preset.name : layout && layout.name;
if (layout && params.has('example')) toast(`${name} example loaded. Change anything; your saved business details are kept.`);
else if (layout) toast(`${name} template selected. Fill in your details; the preview follows.`);
else if (prefill) toast(prefill.meta.number && !prefill.items ? `Invoice ${prefill.meta.number} started.` : 'Invoice started with your figures. Add the client and a description.');

// How the visitor got here: the page that sent them (this site only) and the kind of entry.
let fromPage;
try { fromPage = document.referrer && new URL(document.referrer).origin === location.origin ? new URL(document.referrer).pathname : undefined; } catch { fromPage = undefined; }
const fromKind = !fromPage ? 'direct' : fromPage === '/' ? 'home' : /^\/invoice-guides\//.test(fromPage) ? 'guide' : /^\/tools\//.test(fromPage) ? 'tool' : /^\/invoice-templates\//.test(fromPage) ? 'template' : 'site';
const via = preset || layout ? 'template' : prefill ? 'tool' : fromKind;
const entryTemplate = preset ? preset.slug : layout ? layout.slug : undefined;
track('invoice_generator_opened', { via, template: entryTemplate, from_page: fromPage });
if (layout || prefill || params.has('new')) {
  usage.started(invoice, { template: entryTemplate, via, start: params.has('example') && layout ? 'example' : prefill ? 'prefill' : 'blank' });
}
if (location.search) history.replaceState(null, '', location.pathname);
document.documentElement.classList.add('app-ready');

// The user's own fonts (device and uploads) load from this browser; then the invoice redraws in them.
fonts.init().then(() => refresh()).catch(() => {});
// Payment links: shown only when the payment service is deployed and configured.
payments.init({ returned: params.get('payments') });

// Fetch the PDF engine and fonts once the page is idle, so the first export is instant.
(window.requestIdleCallback || ((fn) => setTimeout(fn, 1500)))(() => loadPdfDeps(PDF_DEPS).catch(() => {}));

// For automated tests and debugging.
window.folio = {
  library,
  fonts,
  payments,
  get invoice() { return invoice; },
  get totals() { return totals; },
  /** Replace the open invoice's content (tests). */
  replace(data) {
    Object.assign(invoice, normalizeInvoice({ ...data, id: invoice.id }));
    editor.load(invoice);
    refresh();
    saveNow();
  },
};

/**
 * The invoice model: defaults, payment terms, numbering and validation of
 * untrusted (stored) data. Pure — no DOM, no storage.
 */
import { CURRENCIES, todayISO, addDaysISO, daysBetween } from './format.js';
import { normalizePaylink } from './paylink.js';

export const SCHEMA_VERSION = 1;

export const TERMS = [
  { id: 'receipt', label: 'Due on receipt', days: 0 },
  { id: 'net7', label: 'Net 7', days: 7 },
  { id: 'net14', label: 'Net 14', days: 14 },
  { id: 'net15', label: 'Net 15', days: 15 },
  { id: 'net30', label: 'Net 30', days: 30 },
  { id: 'net45', label: 'Net 45', days: 45 },
  { id: 'net60', label: 'Net 60', days: 60 },
  { id: 'net90', label: 'Net 90', days: 90 },
  { id: 'custom', label: 'Custom', days: null },
];

export const termsById = (id) => TERMS.find((t) => t.id === id) || TERMS.find((t) => t.id === 'net30');

/** Due date implied by the payment terms (custom keeps the current due date). */
export function dueDateFor(issueDate, termsId, currentDue = '') {
  const t = termsById(termsId);
  return t.days == null ? currentDue : addDaysISO(issueDate, t.days);
}

/** Terms that match a due date exactly, else "custom". */
export function termsForDueDate(issueDate, dueDate) {
  const days = daysBetween(issueDate, dueDate);
  const match = TERMS.find((t) => t.days === days);
  return match ? match.id : 'custom';
}

let seq = 0;
export function newId(prefix = 'id') {
  seq += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${rand}${seq}`;
}

export function createItem(fields = {}) {
  return { id: newId('item'), description: '', quantity: '1', price: '', group: '', ...fields };
}

/**
 * The invoice's font (meta.font): '' for the template's own fonts, a font from
 * core/fonts.js ("inter"), a font installed on the device ("local:<PostScript
 * name>") or one the user uploaded ("upload:<id>", kept in this browser).
 */
export const FONT_ID = /^(?:[a-z0-9-]{1,40}|local:[A-Za-z0-9._+-]{1,63}|upload:[a-z0-9_-]{1,40})$/;

/** Old invoices stored a typeface instead of a template. */
export const templateForTypeface = (typeface) => (typeface === 'sans' ? 'modern' : 'classic');

export function emptyBusiness() {
  return { name: '', email: '', phone: '', address: '', taxId: '', website: '', logo: null };
}

export function createInvoice({ business, number = 'INV-0001', currency = 'USD', template, typeface = 'serif', paper = 'letter', terms = 'net30', taxRate = '', taxLabel = 'Tax', payment = '', font = '', now } = {}) {
  const issueDate = todayISO(now);
  const stamp = new Date().toISOString();
  return {
    id: newId('inv'),
    version: SCHEMA_VERSION,
    createdAt: stamp,
    updatedAt: stamp,
    business: { ...emptyBusiness(), ...(business || {}) },
    client: { name: '', email: '', address: '' },
    meta: { number, issueDate, dueDate: dueDateFor(issueDate, terms), terms, currency, paper, template: template || templateForTypeface(typeface), project: '', font: typeof font === 'string' && FONT_ID.test(font) ? font : '' },
    items: [createItem()],
    adjustments: {
      taxRate,
      taxLabel,
      discountType: 'percent',
      discountValue: '',
      shipping: '',
      shippingLabel: 'Shipping',
      paid: '',
    },
    notes: '',
    payment,
    paylink: null,
  };
}

/** Business details and preferences that carry over to the next invoice. */
export function profileFrom(invoice) {
  return {
    business: { ...invoice.business },
    currency: invoice.meta.currency,
    template: invoice.meta.template,
    paper: invoice.meta.paper,
    terms: invoice.meta.terms === 'custom' ? 'net30' : invoice.meta.terms,
    taxRate: invoice.adjustments.taxRate,
    taxLabel: invoice.adjustments.taxLabel,
    payment: invoice.payment,
    font: invoice.meta.font || '',
  };
}

/** "INV-0041" → "INV-0042" (keeps prefix, suffix and zero padding). */
export function incrementNumber(number) {
  const m = /^(.*?)(\d+)(\D*)$/.exec(number || '');
  if (!m) return number ? `${number}-2` : 'INV-0001';
  return m[1] + String(parseInt(m[2], 10) + 1).padStart(m[2].length, '0') + m[3];
}

/** Next number after the highest-numbered invoice that shares the latest prefix. */
export function nextInvoiceNumber(numbers) {
  const parsed = numbers
    .map((n) => /^(.*?)(\d+)(\D*)$/.exec(n || ''))
    .filter(Boolean)
    .map((m) => ({ prefix: m[1], n: parseInt(m[2], 10), width: m[2].length, suffix: m[3] }));
  if (!parsed.length) return 'INV-0001';
  const best = parsed.reduce((a, b) => (b.n > a.n ? b : a));
  return best.prefix + String(best.n + 1).padStart(best.width, '0') + best.suffix;
}

/** True when nobody has typed anything into the invoice yet. */
export function isPristine(inv) {
  const filled = (o) => Object.values(o).some((v) => typeof v === 'string' && v.trim());
  return (
    !filled(inv.client) &&
    inv.items.every((it) => !it.description.trim() && !String(it.price).trim()) &&
    !inv.notes.trim() &&
    !(inv.meta.project || '').trim()
  );
}

// ---- Validation of stored / imported data ---------------------------------

const str = (v, d = '') => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

function pick(src, defaults) {
  const out = {};
  for (const k of Object.keys(defaults)) out[k] = str(src && src[k], defaults[k] ?? '');
  return out;
}

export function normalizeInvoice(raw) {
  const d = createInvoice();
  if (!raw || typeof raw !== 'object') return d;
  const meta = raw.meta || {};
  const adj = raw.adjustments || {};
  const items = Array.isArray(raw.items)
    ? raw.items.filter((it) => it && typeof it === 'object').map((it) =>
        createItem({ id: str(it.id) || newId('item'), description: str(it.description), quantity: str(it.quantity), price: str(it.price), group: str(it.group) }))
    : [];
  const business = pick(raw.business, { ...emptyBusiness(), logo: '' });
  business.logo = typeof raw.business?.logo === 'string' && raw.business.logo.startsWith('data:image/') ? raw.business.logo : null;

  return {
    id: str(raw.id) || d.id,
    version: SCHEMA_VERSION,
    createdAt: str(raw.createdAt, d.createdAt),
    updatedAt: str(raw.updatedAt, d.updatedAt),
    business,
    client: pick(raw.client, d.client),
    meta: {
      number: str(meta.number, d.meta.number),
      issueDate: str(meta.issueDate, d.meta.issueDate),
      dueDate: str(meta.dueDate, d.meta.dueDate),
      terms: oneOf(meta.terms, TERMS.map((t) => t.id), 'custom'),
      currency: oneOf(meta.currency, CURRENCIES.map((c) => c[0]), 'USD'),
      paper: oneOf(meta.paper, ['letter', 'a4'], 'letter'),
      // Template ids are validated against the registry when rendering (unknown → Classic),
      // so an invoice made with a template added later still opens everywhere.
      template: typeof meta.template === 'string' && /^[a-z0-9-]{1,40}$/.test(meta.template) ? meta.template : templateForTypeface(meta.typeface),
      project: str(meta.project),
      font: typeof meta.font === 'string' && FONT_ID.test(meta.font) ? meta.font : '',
    },
    items: items.length ? items : d.items,
    adjustments: {
      taxRate: str(adj.taxRate),
      taxLabel: str(adj.taxLabel, 'Tax') || 'Tax',
      discountType: oneOf(adj.discountType, ['percent', 'amount'], 'percent'),
      discountValue: str(adj.discountValue),
      shipping: str(adj.shipping),
      shippingLabel: str(adj.shippingLabel, 'Shipping') || 'Shipping',
      paid: str(adj.paid),
    },
    notes: str(raw.notes),
    payment: str(raw.payment),
    paylink: normalizePaylink(raw.paylink),
  };
}

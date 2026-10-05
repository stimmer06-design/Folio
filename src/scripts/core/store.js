/**
 * Invoice library, persisted in localStorage. Nothing leaves the browser.
 *
 *   folio:v1 → { version, currentId, profile, invoices: [...], assets: { hash: dataURL } }
 *
 * Logos are stored once in `assets` and referenced from invoices as "asset:<hash>",
 * so a hundred invoices with the same logo cost one image.
 */
import { normalizeInvoice, createInvoice, nextInvoiceNumber, profileFrom, isPristine, newId, dueDateFor } from './model.js';
import { todayISO } from './format.js';

export const STORAGE_KEY = 'folio:v1';
const LEGACY_KEY = 'invoice-generator:v1'; // the original single-invoice app

function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + str.length.toString(36);
}

function safeStorage() {
  try {
    const k = '__folio_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return null;
  }
}

function fromLegacy(raw) {
  // Map the first app's flat shape onto the current model.
  return normalizeInvoice({
    business: raw.business,
    client: raw.customer,
    meta: { number: raw.invoice?.number, issueDate: raw.invoice?.date, dueDate: raw.invoice?.dueDate, terms: 'custom', currency: raw.settings?.currency },
    items: raw.items,
    adjustments: { taxRate: raw.taxRate, discountType: raw.discount?.type, discountValue: raw.discount?.value },
    notes: raw.notes,
  });
}

export class Library {
  constructor(storage = safeStorage()) {
    this.storage = storage;
    this.available = Boolean(storage);
    this.invoices = [];
    this.profile = null;
    this.currentId = null;
    this.load();
  }

  load() {
    let data = null;
    try {
      data = JSON.parse(this.storage?.getItem(STORAGE_KEY) || 'null');
    } catch {
      data = null;
    }
    if (data && Array.isArray(data.invoices)) {
      const assets = data.assets && typeof data.assets === 'object' ? data.assets : {};
      this.invoices = data.invoices.map((raw) => {
        const logo = raw?.business?.logo;
        const resolved = typeof logo === 'string' && logo.startsWith('asset:') ? assets[logo.slice(6)] : logo;
        return normalizeInvoice({ ...raw, business: { ...(raw?.business || {}), logo: resolved } });
      });
      this.profile = data.profile && typeof data.profile === 'object' ? data.profile : null;
      if (this.profile && typeof this.profile.business?.logo === 'string' && this.profile.business.logo.startsWith('asset:')) {
        this.profile.business.logo = assets[this.profile.business.logo.slice(6)] || null;
      }
      this.currentId = this.get(data.currentId) ? data.currentId : this.invoices[0]?.id || null;
    } else {
      // First visit: bring over an invoice from the original app if there is one.
      try {
        const legacy = JSON.parse(this.storage?.getItem(LEGACY_KEY) || 'null');
        if (legacy && typeof legacy === 'object') {
          const inv = fromLegacy(legacy);
          this.invoices = [inv];
          this.currentId = inv.id;
          this.profile = profileFrom(inv);
        }
      } catch { /* ignore */ }
    }
    return this;
  }

  /** Write everything. Returns false if storage is unavailable or full. */
  persist() {
    if (!this.storage) return false;
    const assets = {};
    const ref = (logo) => {
      if (!logo) return null;
      const h = hash(logo);
      assets[h] = logo;
      return `asset:${h}`;
    };
    const data = {
      version: 1,
      currentId: this.currentId,
      profile: this.profile ? { ...this.profile, business: { ...this.profile.business, logo: ref(this.profile.business?.logo) } } : null,
      invoices: this.invoices.map((inv) => ({ ...inv, business: { ...inv.business, logo: ref(inv.business.logo) } })),
      assets,
    };
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  /** Most recently edited first. */
  list() {
    return [...this.invoices].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  get(id) {
    return this.invoices.find((inv) => inv.id === id) || null;
  }

  current() {
    return this.get(this.currentId);
  }

  setCurrent(id) {
    if (this.get(id)) this.currentId = id;
    return this.current();
  }

  /** Store edits to an invoice (and remember its business details for next time). */
  save(inv) {
    inv.updatedAt = new Date().toISOString();
    const i = this.invoices.findIndex((x) => x.id === inv.id);
    if (i === -1) this.invoices.push(inv);
    else this.invoices[i] = inv;
    this.profile = profileFrom(inv);
    return this.persist();
  }

  nextNumber() {
    return nextInvoiceNumber(this.invoices.map((inv) => inv.meta.number));
  }

  /** A new blank invoice with the user's business details and the next number. */
  create({ now } = {}) {
    // Re-use an untouched invoice instead of piling up blanks.
    const cur = this.current();
    if (cur && isPristine(cur)) return cur;
    const p = this.profile || {};
    const inv = createInvoice({ ...p, business: p.business, number: this.nextNumber(), now });
    this.invoices.push(inv);
    this.currentId = inv.id;
    this.persist();
    return inv;
  }

  /** Copy an invoice with today's date and the next number. */
  duplicate(id, { now } = {}) {
    const src = this.get(id);
    if (!src) return null;
    const copy = normalizeInvoice(JSON.parse(JSON.stringify(src)));
    const stamp = new Date().toISOString();
    copy.id = newId('inv');
    copy.createdAt = stamp;
    copy.updatedAt = stamp;
    copy.items = copy.items.map((it) => ({ ...it, id: newId('item') }));
    copy.meta.number = this.nextNumber();
    copy.meta.issueDate = todayISO(now);
    copy.meta.dueDate = dueDateFor(copy.meta.issueDate, copy.meta.terms, src.meta.dueDate);
    copy.business.logo = src.business.logo;
    copy.paylink = null; // a payment link belongs to one invoice
    this.invoices.push(copy);
    this.currentId = copy.id;
    this.persist();
    return copy;
  }

  /** Delete an invoice. If it was open, open the most recent other one (or a fresh one). */
  remove(id) {
    this.invoices = this.invoices.filter((inv) => inv.id !== id);
    if (this.currentId === id) {
      this.currentId = this.list()[0]?.id || null;
      if (!this.currentId) {
        const p = this.profile || {};
        const inv = createInvoice({ ...p, business: p.business, number: 'INV-0001' });
        this.invoices.push(inv);
        this.currentId = inv.id;
      }
    }
    this.persist();
    return this.current();
  }

  /** Make sure there is an open invoice (first visit). */
  ensureCurrent() {
    if (!this.current()) {
      const p = this.profile || {};
      const inv = createInvoice({ ...p, business: p.business, number: this.nextNumber() });
      this.invoices.push(inv);
      this.currentId = inv.id;
    }
    return this.current();
  }
}

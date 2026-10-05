/**
 * Product-usage events for the generator, on top of core/track.js.
 *
 * Decides two things the raw events can't:
 * - when an invoice counts as created: the first time its content is edited,
 *   or it is first downloaded or printed with something on it. Opening the
 *   generator, starting a blank invoice or loading an example doesn't count.
 *   Each invoice counts once.
 * - which template an invoice is attributed to: the template page it was
 *   started from (e.g. "plumber"), while it keeps that page's layout; otherwise
 *   the page of its current layout ("contractor").
 *
 * Remembers only invoice ids and template slugs (localStorage "folio:analytics"),
 * never anything typed into an invoice.
 */
import { track } from '../core/track.js';
import { isPristine } from '../core/model.js';
import { templateById } from '../core/templates.js';

export const USAGE_KEY = 'folio:analytics';
const MAX = 500;

const local = () => { try { return window.localStorage; } catch { return null; } };

export class Usage {
  constructor(library, storage = local()) {
    this.storage = storage;
    let saved = null;
    try { saved = JSON.parse(storage?.getItem(USAGE_KEY) || 'null'); } catch { saved = null; }
    if (saved && Array.isArray(saved.counted)) {
      this.counted = new Set(saved.counted);
      this.origin = saved.origin && typeof saved.origin === 'object' ? saved.origin : {};
    } else {
      // First run: invoices that already exist were created before measurement began.
      this.counted = new Set(library.invoices.filter((inv) => !isPristine(inv)).map((inv) => inv.id));
      this.origin = {};
      this.persist();
    }
  }

  persist() {
    const counted = [...this.counted].slice(-MAX);
    const keep = new Set(counted.concat(Object.keys(this.origin).slice(-MAX)));
    const origin = Object.fromEntries(Object.entries(this.origin).filter(([id]) => keep.has(id)));
    try { this.storage?.setItem(USAGE_KEY, JSON.stringify({ v: 1, counted, origin })); } catch { /* storage full or blocked: counting still works for this visit */ }
  }

  /** The template page an invoice belongs to, as a slug. */
  templateOf(inv) {
    const o = this.origin[inv.id];
    return o && o.layout === inv.meta.template ? o.template : templateById(inv.meta.template).slug;
  }

  props(inv, extra = {}) {
    const o = this.origin[inv.id] || {};
    return { template: this.templateOf(inv), layout: inv.meta.template, via: o.via, start: o.start, ...extra };
  }

  /** A new invoice was started: blank, from a template page, an example, a tool, or a duplicate. */
  started(inv, { template, via, start }) {
    this.origin[inv.id] = { template: template || templateById(inv.meta.template).slug, layout: inv.meta.template, via, start };
    this.persist();
    track('invoice_started', this.props(inv));
  }

  /** Call after every edit: the first real edit of an invoice records invoice_created. */
  edited(inv) {
    if (this.counted.has(inv.id) || isPristine(inv)) return false;
    this.counted.add(inv.id);
    this.persist();
    track('invoice_created', this.props(inv));
    return true;
  }

  /** pdf_downloaded or print_clicked; an invoice exported before any edit still counts as created. */
  exported(inv, name) {
    this.edited(inv);
    track(name, this.props(inv));
  }
}

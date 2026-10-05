/**
 * The font picker: a small panel beside the "Font" field (a bottom sheet on
 * phones). Each option is set in its own font. "Your fonts" holds fonts from
 * this device (after "Scan device for fonts" and the browser's permission
 * prompt) and uploaded files; nothing about them leaves the browser.
 */
import { FONTS, FONT_GROUPS, fontById, fontStack } from '../core/fonts.js';
import { templateById } from '../core/templates.js';
import { FontLibrary } from './fonts.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const SAMPLE = 'The quick brown fox';

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'type' || k === 'role') n.setAttribute(k, v);
    else n[k] = v;
  }
  n.append(...children);
  return n;
}

export class FontPicker {
  /**
   * @param {HTMLDialogElement} dialog
   * @param {object} o
   * @param {FontLibrary} o.library
   * @param {() => object} o.getInvoice
   * @param {(id: string) => void} o.onPick
   * @param {(msg: string, kind?: string) => void} o.toast
   */
  constructor(dialog, { library, getInvoice, onPick, toast }) {
    this.dialog = dialog;
    this.library = library;
    this.getInvoice = getInvoice;
    this.onPick = onPick;
    this.toast = toast;
    this.list = $('[data-font-list]', dialog);
    this.scanned = null;
    this.filter = '';
    this.anchor = null;

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) return this.close();
      const opt = e.target.closest('[data-font-id]');
      if (opt) return this.pick(opt.dataset.fontId);
      const local = e.target.closest('[data-local-family]');
      if (local) return this.addLocal(local.dataset.localFamily);
      const rm = e.target.closest('[data-font-remove]');
      if (rm) return this.remove(rm.dataset.fontRemove);
      if (e.target.closest('[data-font-scan]')) return this.scan();
      if (e.target.closest('[data-action="close-fonts"]')) return this.close();
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const opts = $$('.font-opt:not([hidden])', dialog);
      const i = opts.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      opts[Math.max(0, Math.min(opts.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
    });
    $('[data-font-upload]', dialog).addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) this.upload(file);
    });
    $('[data-font-search]', dialog).addEventListener('input', (e) => {
      this.filter = e.target.value.trim().toLowerCase();
      this.renderScanned();
    });
    window.addEventListener('resize', () => this.dialog.open && this.place());
  }

  // ---------------------------------------------------------------- rendering
  option(id, name, meta, stack, { current, note = '', removable = false } = {}) {
    const sample = el('span', { class: 'font-opt__sample', text: SAMPLE, style: stack ? `font-family: ${stack}` : '' });
    const btn = el('button', { type: 'button', class: 'font-opt', 'data-font-id': id, 'aria-pressed': String(current) }, [
      el('span', { class: 'font-opt__row' }, [
        el('span', { class: 'font-opt__name', text: name, style: stack ? `font-family: ${stack}` : '' }),
        el('span', { class: 'font-opt__meta', text: meta }),
      ]),
      sample,
      ...(note ? [el('span', { class: 'font-opt__note', text: note })] : []),
    ]);
    if (!removable) return btn;
    return el('div', { class: 'font-opt-wrap' }, [btn, el('button', { type: 'button', class: 'link-btn font-opt__remove', 'data-font-remove': id, text: 'Remove', 'aria-label': `Remove ${name}` })]);
  }

  render() {
    const inv = this.getInvoice();
    const current = inv.meta.font || '';
    const t = templateById(inv.meta.template);
    const defaultName = t.face === 'sans' ? 'Hanken Grotesk' : 'EB Garamond & Hanken Grotesk';
    const defaultStack = t.face === 'sans' ? 'var(--sans)' : 'var(--serif)';
    const groups = [];
    for (const [g, label] of FONT_GROUPS) {
      const opts = FONTS.filter((f) => f.group === g).map((f) => this.option(f.id, f.name, label === 'Recommended' ? kindLabel(f.kind) : '', fontStack(f), { current: current === f.id }));
      if (g === 'recommended') opts.unshift(this.option('', 'Template default', defaultName, defaultStack, { current: current === '' }));
      groups.push(this.group(label, opts));
    }

    // Your fonts
    const yours = this.library.items.map((item) => {
      const f = fontById(item.id);
      const available = this.library.isAvailable(item.id);
      const note = !available ? 'Not available on this device' : item.embeddable === false ? 'Screen and print only · PDFs use a Folio font' : '';
      return this.option(item.id, item.name, item.source === 'local' ? 'On this device' : 'Uploaded', f ? fontStack(f) : '', { current: current === item.id, note, removable: true });
    });
    if (current && !fontById(current) && !this.library.items.some((x) => x.id === current)) {
      yours.unshift(this.option(current, 'Font not available', 'Choose another font', '', { current: true }));
    }
    const yourGroup = this.group('Your fonts', yours, $('[data-font-yours]', this.dialog));
    this.list.replaceChildren(...groups, yourGroup);
    this.renderScanned();
  }

  group(label, options, extra = null) {
    const id = `fg-${label.toLowerCase().replace(/\W+/g, '-')}`;
    const g = el('div', { class: 'font-group', role: 'group', 'aria-labelledby': id }, [el('p', { class: 'font-group__title', id, text: label }), ...options]);
    if (extra) {
      extra.hidden = false;
      g.append(extra);
    }
    return g;
  }

  renderScanned() {
    const box = $('[data-font-scanned]', this.dialog);
    const scan = $('[data-font-scan]', this.dialog);
    scan.hidden = !FontLibrary.canScan;
    $('[data-font-unsupported]', this.dialog).hidden = FontLibrary.canScan;
    if (!this.scanned) { box.hidden = true; return; }
    box.hidden = false;
    const q = this.filter;
    const list = this.scanned.filter((f) => !q || f.family.toLowerCase().includes(q));
    $('[data-font-count]', this.dialog).textContent = `${this.scanned.length} font${this.scanned.length === 1 ? '' : 's'} on this device`;
    $('[data-font-scanned-list]', this.dialog).replaceChildren(...list.slice(0, 200).map((f) =>
      el('button', { type: 'button', class: 'font-opt font-opt--local', 'data-local-family': f.family }, [
        el('span', { class: 'font-opt__name', text: f.family, style: `font-family: "${f.family.replace(/["\\]/g, '')}", var(--sans)` }),
      ])));
    if (list.length > 200) $('[data-font-scanned-list]', this.dialog).append(el('p', { class: 'font-sheet__hint', text: `Showing 200 of ${list.length}. Type to narrow the list.` }));
  }

  // ---------------------------------------------------------------- actions
  pick(id) {
    this.close();
    this.onPick(id);
  }

  async scan() {
    const btn = $('[data-font-scan]', this.dialog);
    btn.setAttribute('aria-busy', 'true');
    try {
      this.scanned = await this.library.scan();
      this.filter = '';
      $('[data-font-search]', this.dialog).value = '';
      this.renderScanned();
      const search = $('[data-font-search]', this.dialog);
      if (search) search.focus();
      if (!this.scanned.length) this.toast('No fonts were found on this device. You can upload a font instead.');
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      this.toast(denied ? 'Font access wasn’t allowed. You can upload a font file instead.' : 'Your fonts couldn’t be read. You can upload a font file instead.', 'error');
    } finally {
      btn.removeAttribute('aria-busy');
    }
  }

  async addLocal(family) {
    const entry = this.scanned && this.scanned.find((f) => f.family === family);
    if (!entry) return;
    try {
      const item = await this.library.addLocal(entry);
      this.pick(item.id);
    } catch {
      this.toast(`“${family}” couldn’t be used. Try another font, or upload it.`, 'error');
    }
  }

  async upload(file) {
    try {
      const item = await this.library.addUpload(file);
      this.pick(item.id);
    } catch (err) {
      this.toast(err.message || 'That font couldn’t be used.', 'error');
    }
  }

  async remove(id) {
    const inv = this.getInvoice();
    await this.library.remove(id);
    if (inv.meta.font === id) this.onPick('');
    this.render();
  }

  // ---------------------------------------------------------------- open / close
  /** Beside the trigger on wide screens; a bottom sheet on phones (CSS). */
  place() {
    const d = this.dialog;
    if (!this.anchor || window.matchMedia('(max-width: 47.99rem)').matches) {
      d.style.removeProperty('--fp-top');
      d.style.removeProperty('--fp-left');
      return;
    }
    const r = this.anchor.getBoundingClientRect();
    const w = d.offsetWidth || 384;
    const h = d.offsetHeight || 480;
    const left = Math.min(Math.max(16, r.left), window.innerWidth - w - 16);
    const below = r.bottom + 8;
    const top = below + h <= window.innerHeight - 16 ? below : Math.max(16, r.top - h - 8);
    d.style.setProperty('--fp-top', `${Math.round(top)}px`);
    d.style.setProperty('--fp-left', `${Math.round(left)}px`);
  }

  open(anchor) {
    this.anchor = anchor || null;
    this.filter = '';
    $('[data-font-search]', this.dialog).value = '';
    this.render();
    this.dialog.showModal();
    this.place();
    const current = $('.font-opt[aria-pressed="true"]', this.dialog) || $('.font-opt', this.dialog);
    if (current) {
      current.focus();
      current.scrollIntoView({ block: 'nearest' });
    }
  }

  close() {
    if (this.dialog.open) this.dialog.close();
    if (this.anchor) this.anchor.focus({ preventScroll: true });
  }
}

const kindLabel = (k) => ({ serif: 'Serif', sans: 'Sans', mono: 'Monospace' })[k] || '';

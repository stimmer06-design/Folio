/**
 * The editor: binds the static form in /app/ to an invoice object.
 * Knows nothing about storage, preview or export — it reports changes.
 */
import { CURRENCIES, formatMoney, formatPercent, currencySymbol, parseISODate } from '../core/format.js';
import { TERMS, dueDateFor, termsForDueDate, createItem } from '../core/model.js';
import { processLogo } from '../core/logo.js';
import { templateById } from '../core/templates.js';
import { escapeHtml as esc } from '../core/format.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

const REMOVE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';

export class Editor {
  constructor(form, { onChange, onError }) {
    this.form = form;
    this.onChange = onChange;
    this.onError = onError || (() => {});
    this.invoice = null;
    this.list = $('[data-items]', form);

    this.populateSelects();
    form.addEventListener('input', (e) => this.handleInput(e));
    form.addEventListener('change', (e) => this.handleInput(e));
    this.list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (btn) this.removeItem(btn.closest('.item').dataset.id);
    });
    this.list.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      const row = e.target.closest('.item');
      if (row === this.list.lastElementChild && e.target.dataset.key === 'price') this.addItem(true);
    });
    $('[data-action="add-item"]', form).addEventListener('click', () => this.addItem(true));
    this.bindLogo();
  }

  populateSelects() {
    const cur = $('[data-currency-select]', this.form);
    cur.replaceChildren(...CURRENCIES.map(([code, name]) => new Option(`${code} — ${name}`, code)));
    const terms = $('[data-terms-select]', this.form);
    terms.replaceChildren(...TERMS.map((t) => new Option(t.label, t.id)));
  }

  /** Show an invoice in the form. */
  load(invoice) {
    this.invoice = invoice;
    this.template = templateById(invoice.meta.template);
    this.applyTemplateLabels();
    for (const el of $$('[data-bind]', this.form)) {
      const value = getPath(invoice, el.dataset.bind);
      if (el.type === 'radio') el.checked = el.value === value;
      else el.value = value == null ? '' : value;
    }
    $$('textarea[data-bind]', this.form).forEach(autosize);
    this.renderItems();
    this.renderLogo();
    this.syncDerived();
  }

  handleInput(e) {
    const el = e.target;
    if (el.closest('.item')) return this.handleItemInput(e);
    const path = el.dataset.bind;
    if (!path) return;
    if (el.type === 'radio' && !el.checked) return;
    if (e.type === 'change' && el.type !== 'radio' && el.tagName !== 'SELECT' && el.type !== 'date') return; // already handled on input
    const m = this.invoice.meta;
    setPath(this.invoice, path, el.value);

    // Payment terms ↔ due date
    if (path === 'meta.issueDate' || path === 'meta.terms') {
      if (m.terms !== 'custom') {
        m.dueDate = dueDateFor(m.issueDate, m.terms, m.dueDate);
        $('[data-due-input]', this.form).value = m.dueDate;
      }
    } else if (path === 'meta.dueDate') {
      m.terms = termsForDueDate(m.issueDate, m.dueDate);
      $('[data-terms-select]', this.form).value = m.terms;
    }
    if (el.tagName === 'TEXTAREA') autosize(el);
    this.syncDerived();
    this.onChange();
  }

  /** UI that depends on several fields. */
  syncDerived() {
    const m = this.invoice.meta;
    $$('[data-currency-symbol]', this.form).forEach((s) => (s.textContent = currencySymbol(m.currency)));
    const issue = parseISODate(m.issueDate);
    const due = parseISODate(m.dueDate);
    const bad = Boolean(issue && due && due < issue);
    $('[data-due-warning]', this.form).hidden = !bad;
    $('[data-due-input]', this.form).setAttribute('aria-invalid', String(bad));
  }

  /**
   * Switch the presentation. Only meta.template changes: every field, item and
   * group the user entered is kept, even ones this template does not display.
   */
  setTemplate(id) {
    this.invoice.meta.template = id;
    this.template = templateById(id);
    this.applyTemplateLabels();
    this.renderItems();
    this.onChange();
  }

  /** Column headings, labels and placeholders that the template words differently. */
  applyTemplateLabels() {
    const t = this.template;
    const head = $$('.items__head span', this.form);
    head[0].textContent = t.table.desc;
    head[1].textContent = t.table.qty;
    head[2].textContent = t.table.price;
    $$('[data-tpl-label="project"]', this.form).forEach((el) => (el.textContent = t.labels.project));
    $('.items', this.form).classList.toggle('items--grouped', Boolean(t.groups));
  }

  // ---------------------------------------------------------------- items
  itemRow(item, n) {
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.id = item.id;
    const t = this.template;
    let groups = '';
    if (t.groups) {
      const opts = [...t.groups.options];
      if (item.group && !opts.includes(item.group)) opts.push(item.group); // keep groups from other templates
      groups = `<label class="item__group"><span class="item__label">${esc(t.groups.label)}</span><span class="visually-hidden">, item ${n}</span>
        <select class="fld__input" data-key="group"><option value="">${esc(t.groups.fallback)} (default)</option>${opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>`;
    }
    li.innerHTML = `
      <label class="item__desc"><span class="visually-hidden">Description, item ${n}</span>
        <textarea class="fld__input" rows="1" data-key="description" placeholder="${esc(t.editor.itemPlaceholder)}"></textarea></label>
      ${groups}
      <label class="item__qty"><span class="item__label">${esc(t.table.qty)}</span><span class="visually-hidden">, item ${n}</span>
        <input class="fld__input" type="text" inputmode="decimal" data-key="quantity" placeholder="1"></label>
      <label class="item__price"><span class="item__label">${esc(t.table.price)}</span><span class="visually-hidden">, item ${n}</span>
        <input class="fld__input" type="text" inputmode="decimal" data-key="price" placeholder="0.00"></label>
      <output class="item__amount" aria-label="Amount, item ${n}"></output>
      <button class="item__remove" type="button" data-remove aria-label="Remove item ${n}" title="Remove item">${REMOVE_ICON}</button>`;
    for (const input of $$('[data-key]', li)) input.value = item[input.dataset.key];
    return li;
  }

  renderItems() {
    this.list.replaceChildren(...this.invoice.items.map((it, i) => this.itemRow(it, i + 1)));
    $$('textarea', this.list).forEach(autosize);
    const only = this.invoice.items.length === 1;
    $$('[data-remove]', this.list).forEach((b) => (b.disabled = only));
  }

  handleItemInput(e) {
    if (e.type === 'change') return;
    const row = e.target.closest('.item');
    const item = this.invoice.items.find((it) => it.id === row.dataset.id);
    if (!item || !e.target.dataset.key) return;
    item[e.target.dataset.key] = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autosize(e.target);
    this.onChange();
  }

  addItem(focus) {
    const prev = this.invoice.items[this.invoice.items.length - 1];
    this.invoice.items.push(createItem({ group: prev ? prev.group : '' })); // a new line joins the section above it
    this.renderItems();
    this.onChange();
    if (focus) $('.item:last-child textarea', this.list).focus();
  }

  removeItem(id) {
    const items = this.invoice.items;
    const i = items.findIndex((it) => it.id === id);
    if (i === -1 || items.length === 1) return;
    items.splice(i, 1);
    this.renderItems();
    this.onChange();
    const rows = $$('.item', this.list);
    const next = rows[Math.min(i, rows.length - 1)];
    if (next) $('textarea', next).focus();
  }

  /** Per-row amounts and the running summary. */
  showTotals(t) {
    const cur = this.invoice.meta.currency;
    const money = (n) => formatMoney(n, cur);
    $$('.item__amount', this.list).forEach((out, i) => (out.textContent = money(t.lines[i] || 0)));
    const a = this.invoice.adjustments;
    const set = (k, v) => ($(`[data-sum="${k}"]`, this.form).textContent = v);
    const label = (k, v) => ($(`[data-sum-label="${k}"]`, this.form).textContent = v);
    const show = (k, on) => ($(`[data-sum-row="${k}"]`, this.form).hidden = !on);
    set('subtotal', money(t.subtotal));
    set('discount', `−${money(t.discount)}`);
    set('tax', money(t.tax));
    set('shipping', money(t.shipping));
    set('total', money(t.total));
    label('discount', t.discountRate != null ? `Discount (${formatPercent(t.discountRate)})` : 'Discount');
    label('tax', `${a.taxLabel || 'Tax'} (${formatPercent(t.taxRate)})`);
    label('shipping', a.shippingLabel || 'Shipping');
    show('discount', t.discount > 0);
    show('tax', t.taxRate > 0);
    show('shipping', t.shipping > 0);
    set('paid', `−${money(t.paid)}`);
    set('due', money(t.due));
    label('paid', this.template.labels.paid);
    label('due', this.template.labels.due);
    show('paid', t.paid > 0);
    show('due', t.paid > 0);
    $('[data-sum-currency]', this.form).textContent = cur;
  }

  // ---------------------------------------------------------------- logo
  bindLogo() {
    const input = $('[data-logo-input]', this.form);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      try {
        this.invoice.business.logo = await processLogo(file);
        this.renderLogo();
        this.onChange();
      } catch (err) {
        this.onError(err.message);
      }
    });
    $('[data-logo-remove]', this.form).addEventListener('click', () => {
      this.invoice.business.logo = null;
      this.renderLogo();
      this.onChange();
      $('[data-logo-input]', this.form).focus();
    });
  }

  renderLogo() {
    const logo = this.invoice.business.logo;
    const thumb = $('[data-logo-thumb]', this.form);
    thumb.replaceChildren();
    if (logo) {
      const img = new Image();
      img.src = logo;
      img.alt = '';
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = '<span>No logo</span>';
    }
    thumb.classList.toggle('has-logo', Boolean(logo));
    $('[data-logo-pick-label]', this.form).textContent = logo ? 'Replace' : 'Add logo';
    $('[data-logo-remove]', this.form).hidden = !logo;
  }
}

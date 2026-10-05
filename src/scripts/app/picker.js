/**
 * "Choose a template" sheet. Each card shows a live, scaled render of the
 * user's own invoice in that template (or the template's realistic sample
 * while the invoice is still empty), so the choice is made on real content.
 */
import { TEMPLATES, CATEGORIES, categoryLabel } from '../core/templates.js';
import { renderInvoice } from '../core/render.js';
import { computeTotals } from '../core/calc.js';
import { sampleInvoice } from '../core/sample.js';
import { isPristine } from '../core/model.js';
import { escapeHtml as e } from '../core/format.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Scale fixed-size .doc pages to the width of their frames. */
export function fitDocs(root) {
  for (const frame of $$('[data-doc-frame]', root)) {
    const doc = frame.querySelector('.doc');
    if (!doc || !frame.clientWidth) continue;
    doc.style.transform = `scale(${frame.clientWidth / doc.offsetWidth})`;
  }
}

/** One scaled document for a template, using the invoice or its sample. */
export function thumbnail(invoice, templateId) {
  const inv = !invoice || isPristine(invoice) ? sampleInvoice({ template: templateId }) : { ...invoice, meta: { ...invoice.meta } };
  if (invoice && isPristine(invoice) && invoice.business.name.trim()) inv.business = invoice.business;
  inv.meta.paper = invoice ? invoice.meta.paper : 'letter';
  if (invoice) inv.meta.font = invoice.meta.font || ''; // every template is shown in the invoice's font
  return renderInvoice(inv, computeTotals(inv), { template: templateId });
}

export class TemplatePicker {
  constructor(dialog, { getInvoice, onPick }) {
    this.dialog = dialog;
    this.getInvoice = getInvoice;
    this.onPick = onPick;
    this.filter = 'all';
    this.grid = $('[data-tpl-grid]', dialog);
    this.filterBar = $('[data-tpl-filter]', dialog);

    this.filterBar.innerHTML = [{ id: 'all', label: 'All' }, ...CATEGORIES]
      .map((c) => `<button type="button" class="tpl-filter__btn" data-filter="${c.id}" aria-pressed="${c.id === 'all'}">${e(c.label)}</button>`)
      .join('');
    this.filterBar.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-filter]');
      if (b) this.setFilter(b.dataset.filter);
    });
    this.grid.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-use]');
      if (!b) return;
      this.close();
      this.onPick(b.dataset.use);
    });
    dialog.addEventListener('click', (ev) => { if (ev.target === dialog) this.close(); });
    $('[data-action="close-templates"]', dialog).addEventListener('click', () => this.close());
    this.ro = new ResizeObserver(() => fitDocs(this.grid));
    this.ro.observe(this.grid);
  }

  setFilter(id) {
    this.filter = id;
    $$('[data-filter]', this.filterBar).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === id)));
    $$('.tpl-card', this.grid).forEach((c) => (c.hidden = id !== 'all' && c.dataset.category !== id));
    fitDocs(this.grid);
  }

  render() {
    const inv = this.getInvoice();
    const current = inv.meta.template;
    this.grid.innerHTML = TEMPLATES.map((t) => {
      const on = t.id === current;
      return `<li class="tpl-card${on ? ' is-current' : ''}" data-category="${t.category}">
        <div class="tpl-card__frame" data-doc-frame aria-hidden="true">${thumbnail(inv, t.id)}</div>
        <div class="tpl-card__text">
          <p class="tpl-card__cat">${e(categoryLabel(t.category))}</p>
          <h3 class="tpl-card__name">${e(t.name)}</h3>
          <p class="tpl-card__desc">${e(t.summary)}</p>
          ${on
            ? `<p class="tpl-card__current">Current template</p>`
            : `<button type="button" class="btn btn--outline btn--sm tpl-card__use" data-use="${t.id}">Use template<span class="visually-hidden">: ${e(t.name)}</span></button>`}
        </div>
      </li>`;
    }).join('');
    this.setFilter(this.filter);
  }

  open() {
    this.render();
    this.dialog.showModal();
    fitDocs(this.grid);
    requestAnimationFrame(() => fitDocs(this.grid));
    const first = $('.tpl-filter__btn[aria-pressed="true"]', this.dialog);
    if (first) first.focus();
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }
}

/**
 * "Your invoices" panel: open, duplicate and delete saved invoices,
 * plus backup and restore. Built with DOM APIs — user text is never HTML.
 */
import { computeTotals } from '../core/calc.js';
import { formatMoney } from '../core/format.js';

const $ = (sel, root = document) => root.querySelector(sel);

const when = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? `Edited today, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : `Edited ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })}`;
};

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'type') n.setAttribute(k, v);
    else n[k] = v;
  }
  n.append(...children);
  return n;
}

export class LibraryPanel {
  constructor(dialog, library, { onOpen, onDuplicate, onDelete, onNew }) {
    this.dialog = dialog;
    this.library = library;
    this.handlers = { onOpen, onDuplicate, onDelete, onNew };
    this.list = $('[data-library-list]', dialog);
    this.confirming = null;

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) this.close(); // backdrop
      const btn = e.target.closest('[data-lib]');
      if (!btn) return;
      const id = btn.closest('[data-id]')?.dataset.id;
      const act = btn.dataset.lib;
      if (act === 'open') { this.close(); onOpen(id); }
      if (act === 'duplicate') { this.close(); onDuplicate(id); }
      if (act === 'delete') { this.confirming = id; this.render(); $(`[data-id="${id}"] [data-lib="confirm"]`, dialog)?.focus(); }
      if (act === 'cancel') { this.confirming = null; this.render(); $(`[data-id="${id}"] [data-lib="delete"]`, dialog)?.focus(); }
      if (act === 'confirm') { this.confirming = null; onDelete(id); this.render(); $('[data-lib="open"]', this.list)?.focus(); }
    });
    $('[data-action="close-library"]', dialog).addEventListener('click', () => this.close());
  }

  open() {
    this.confirming = null;
    this.render();
    this.dialog.showModal();
    const current = $('.lib-item.is-current [data-lib="open"]', this.list);
    (current || $('.library__new', this.dialog)).focus();
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }

  render() {
    const items = this.library.list();
    this.list.replaceChildren(
      ...items.map((inv) => {
        const t = computeTotals(inv);
        const isCurrent = inv.id === this.library.currentId;
        const title = inv.meta.number || 'Untitled';
        const client = inv.client.name.trim() || 'No client yet';
        const confirming = this.confirming === inv.id;
        const actions = confirming
          ? el('div', { class: 'lib-item__confirm', role: 'group', 'aria-label': `Delete ${title}?` }, [
              el('span', { text: `Delete ${title}? This cannot be undone.` }),
              el('button', { class: 'link-btn link-btn--danger', type: 'button', 'data-lib': 'confirm', text: 'Delete' }),
              el('button', { class: 'link-btn', type: 'button', 'data-lib': 'cancel', text: 'Cancel' }),
            ])
          : el('div', { class: 'lib-item__actions' }, [
              el('button', { class: 'link-btn', type: 'button', 'data-lib': 'duplicate', text: 'Duplicate', 'aria-label': `Duplicate ${title}` }),
              el('button', { class: 'link-btn', type: 'button', 'data-lib': 'delete', text: 'Delete', 'aria-label': `Delete ${title}` }),
            ]);
        return el('li', { class: `lib-item${isCurrent ? ' is-current' : ''}`, 'data-id': inv.id }, [
          el('button', { class: 'lib-item__open', type: 'button', 'data-lib': 'open', 'aria-label': `Open ${title}, ${client}${isCurrent ? ' (open now)' : ''}` }, [
            el('span', { class: 'lib-item__number', text: title }),
            el('span', { class: 'lib-item__total', text: formatMoney(t.total, inv.meta.currency) }),
            el('span', { class: 'lib-item__client', text: inv.paylink && inv.paylink.status === 'paid' ? `${client} · Paid` : client }),
            el('span', { class: 'lib-item__when', text: isCurrent ? 'Open now' : when(inv.updatedAt) }),
          ]),
          actions,
        ]);
      })
    );
  }
}

/**
 * Invoice tax calculator (/tools/invoice-tax-calculator/).
 * Uses the generator's own arithmetic (core/calc.js), so the totals here are
 * exactly the totals the invoice will show, then hands the figures over.
 */
import { computeTotals } from '../core/calc.js';
import { createInvoice } from '../core/model.js';
import { CURRENCIES, formatMoney, currencySymbol } from '../core/format.js';
import { generatorLink } from '../core/tools.js';
import { track } from '../core/track.js';

const form = document.querySelector('[data-tool="invoice-tax-calculator"]');
const out = (k) => form.querySelector(`[data-out="${k}"]`);
const row = (k) => form.querySelector(`[data-row="${k}"]`);
const app = out('link').getAttribute('href');
let used = false;

const select = form.querySelector('[data-currencies]');
select.innerHTML = CURRENCIES.map(([code, name]) => `<option value="${code}">${code} — ${name}</option>`).join('');

function update(e) {
  const f = Object.fromEntries(new FormData(form));
  const inv = createInvoice({ currency: f.currency });
  inv.items = [{ id: 'x', description: f.item, quantity: f.qty || '1', price: f.price, group: '' }];
  Object.assign(inv.adjustments, { taxRate: f.tax, taxLabel: f.taxLabel || 'Tax', discountType: f.discountType, discountValue: f.discount, shipping: f.shipping, paid: f.paid });
  const t = computeTotals(inv);
  const money = (n) => formatMoney(n, f.currency);

  form.querySelectorAll('[data-symbol]').forEach((s) => (s.textContent = currencySymbol(f.currency)));
  out('subtotal').textContent = money(t.subtotal);
  row('discount').hidden = !t.discount;
  out('discountLabel').textContent = t.discountRate != null ? `Discount (${t.discountRate}%)` : 'Discount';
  out('discount').textContent = `−${money(t.discount)}`;
  out('taxLabel').textContent = `${(f.taxLabel || 'Tax').trim()}${t.taxRate ? ` (${t.taxRate}%)` : ''}`;
  out('tax').textContent = money(t.tax);
  row('shipping').hidden = !t.shipping;
  out('shipping').textContent = money(t.shipping);
  out('currency').textContent = f.currency;
  out('total').textContent = money(t.total);
  row('paid').hidden = row('due').hidden = !t.paid;
  out('paid').textContent = `−${money(t.paid)}`;
  out('due').textContent = money(t.due);

  out('link').setAttribute('href', generatorLink(app, {
    item: f.item, price: f.price, qty: f.qty !== '1' ? f.qty : '', tax: f.tax, taxLabel: f.tax ? f.taxLabel : '',
    discount: f.discount, discountType: f.discount ? f.discountType : '', shipping: f.shipping, paid: f.paid,
    currency: f.currency !== 'USD' ? f.currency : '',
  }));
  if (e && !used) {
    used = true;
    track('tool_used', { tool: 'invoice-tax-calculator' });
  }
}

form.addEventListener('input', update);
form.addEventListener('change', update);
form.addEventListener('submit', (e) => e.preventDefault());
update();

/**
 * Sales tax calculator (/tools/sales-tax-calculator/).
 * Adds tax to a price, or takes it out of a tax-inclusive one, at the rate the
 * user enters. No rates are built in: they vary by place and change.
 */
import { salesTax, generatorLink } from '../core/tools.js';
import { formatMoney } from '../core/format.js';
import { track } from '../core/track.js';

const form = document.querySelector('[data-tool="sales-tax-calculator"]');
const out = (k) => form.querySelector(`[data-out="${k}"]`);
const app = out('link').getAttribute('href');
let used = false;

function update(e) {
  const f = Object.fromEntries(new FormData(form));
  const inclusive = f.mode === 'remove';
  const r = salesTax({ amount: f.amount, rate: f.rate, inclusive });
  const money = (n) => formatMoney(n, 'USD');
  out('amountLabel').textContent = inclusive ? 'Amount including tax' : 'Amount before tax';
  out('net').textContent = money(r.net);
  out('taxLabel').textContent = r.rate ? `Sales tax (${r.rate}%)` : 'Sales tax';
  out('tax').textContent = money(r.tax);
  out('gross').textContent = money(r.gross);
  // The invoice states the price before tax and adds the tax, whichever way it was entered here.
  out('link').setAttribute('href', generatorLink(app, { price: r.net ? String(r.net) : '', tax: f.rate, taxLabel: f.rate ? 'Sales tax' : '' }));
  if (e && !used) {
    used = true;
    track('tool_used', { tool: 'sales-tax-calculator' });
  }
}

form.addEventListener('input', update);
form.addEventListener('change', update);
form.addEventListener('submit', (e) => e.preventDefault());
update();

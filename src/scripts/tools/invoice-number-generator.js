/**
 * Invoice number generator (/tools/invoice-number-generator/).
 * Builds the number from its parts and hands it to the generator as ?number=.
 */
import { formatInvoiceNumber, invoiceNumberSequence, generatorLink } from '../core/tools.js';
import { track } from '../core/track.js';

const form = document.querySelector('[data-tool="invoice-number-generator"]');
const out = (k) => form.querySelector(`[data-out="${k}"]`);
const app = out('link').getAttribute('href');
const copy = form.querySelector('[data-copy]');
let used = false;

function options() {
  const f = new FormData(form);
  const n = String(f.get('number')).replace(/\D/g, '');
  return {
    prefix: String(f.get('prefix')).replace(/[^\w-]/g, '').slice(0, 12),
    separator: f.get('separator'),
    datePart: f.get('datePart'),
    number: n === '' ? 1 : Number(n),
    digits: Number(f.get('digits')),
  };
}

function update(e) {
  const o = options();
  const number = formatInvoiceNumber(o);
  out('number').textContent = number;
  out('then').textContent = invoiceNumberSequence({ ...o, number: o.number + 1 }, 3).join(', ');
  out('link').setAttribute('href', generatorLink(app, { number }));
  out('status').textContent = '';
  if (e && !used) {
    used = true;
    track('tool_used', { tool: 'invoice-number-generator' });
  }
}

form.addEventListener('input', update);
form.addEventListener('change', update);
form.addEventListener('submit', (e) => e.preventDefault());
if (navigator.clipboard) {
  copy.hidden = false;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(out('number').textContent);
      out('status').textContent = 'Copied.';
    } catch {
      out('status').textContent = 'Could not copy; select the number instead.';
    }
  });
}
update();

/**
 * Example invoices. Each template carries its own realistic sample (templates.js);
 * a template page in src/content/templates may supply its own. This turns one
 * into a complete invoice object. Used for the marketing previews
 * (rendered at build time), the template picker and "Fill with an example".
 */
import { createInvoice, createItem, emptyBusiness } from './model.js';
import { templateById } from './templates.js';

export function sampleInvoice({ template = 'classic', typeface, sample, now = new Date(2026, 9, 1) } = {}) {
  const id = typeface === 'sans' && template === 'classic' ? 'modern' : template;
  const t = templateById(id);
  const s = sample || t.sample; // a template page may bring its own example (src/content/templates)
  const inv = createInvoice({ now, number: s.number || 'INV-0042', template: t.id, terms: s.terms || 'net30', currency: s.currency || 'USD' });
  inv.business = { ...emptyBusiness(), ...s.business };
  inv.client = { name: '', email: '', address: '', ...s.client };
  inv.meta.project = s.project || '';
  inv.items = s.items.map(([description, quantity, price, group = '']) => createItem({ description, quantity, price, group }));
  inv.adjustments = { ...inv.adjustments, ...(s.adjustments || {}) };
  inv.payment = s.payment || '';
  inv.notes = s.notes || '';
  return inv;
}

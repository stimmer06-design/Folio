/**
 * Invoice arithmetic. Pure functions — no DOM.
 *
 *   line      = quantity × unit price               (rounded to the currency's minor unit)
 *   subtotal  = Σ lines
 *   discount  = % of subtotal, or a fixed amount    (never more than the subtotal)
 *   tax       = tax rate × (subtotal − discount)
 *   shipping  = flat amount, not taxed
 *   total     = subtotal − discount + tax + shipping
 *   due       = total − deposit or amount already paid (never below zero)
 */
import { parseAmount, round, currencyDigits } from './format.js';

export function lineAmount(item, digits = 2) {
  return round(parseAmount(item.quantity) * parseAmount(item.price), digits);
}

export function computeTotals(invoice) {
  const digits = currencyDigits(invoice.meta.currency);
  const a = invoice.adjustments;

  const lines = invoice.items.map((it) => lineAmount(it, digits));
  const subtotal = round(lines.reduce((s, n) => s + n, 0), digits);

  const discountValue = parseAmount(a.discountValue);
  let discountRate = null;
  let discount;
  if (a.discountType === 'percent') {
    discountRate = Math.min(discountValue, 100);
    discount = round((subtotal * discountRate) / 100, digits);
  } else {
    discount = round(Math.min(discountValue, subtotal), digits);
  }

  const taxRate = Math.min(parseAmount(a.taxRate), 100);
  const taxable = round(subtotal - discount, digits);
  const tax = round((taxable * taxRate) / 100, digits);
  const shipping = round(parseAmount(a.shipping), digits);
  const total = round(taxable + tax + shipping, digits);
  const paid = round(Math.min(parseAmount(a.paid), total), digits);
  const due = round(total - paid, digits);

  return { lines, subtotal, discount, discountRate, taxRate, taxable, tax, shipping, total, paid, due, digits };
}

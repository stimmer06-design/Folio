/**
 * Live preview: renders the invoice document and scales the sheet to fit
 * its column, so what you see is the exact page that prints and exports.
 */
import { renderInvoice } from '../core/render.js';

export class Preview {
  constructor({ desk, fit, page }) {
    this.desk = desk;
    this.fit = fit;
    this.page = page;
    this.frame = 0;
    const ro = new ResizeObserver(() => this.scale());
    ro.observe(desk);
    ro.observe(page);
  }

  render(invoice, totals) {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.page.innerHTML = renderInvoice(invoice, totals, { placeholders: true });
      this.scale();
    });
  }

  scale() {
    const sheet = this.page.firstElementChild;
    if (!sheet) return;
    const style = getComputedStyle(this.desk);
    const available = this.desk.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const s = Math.min(1, available / sheet.offsetWidth);
    this.page.style.transform = `scale(${s})`;
    this.fit.style.width = `${sheet.offsetWidth * s}px`;
    this.fit.style.height = `${sheet.offsetHeight * s}px`;
  }
}

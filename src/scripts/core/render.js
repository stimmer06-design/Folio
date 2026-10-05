/**
 * Renders an invoice as an HTML document string. Pure (no DOM), so the same
 * function draws the live preview, the print copy, the PDF (pdf.js reads the
 * rendered page) and every sample on the marketing pages.
 *
 * The invoice supplies the content; its template (templates.js) supplies the
 * arrangement. Every composition below is assembled from the same parts, so
 * all templates share one vocabulary of labels, rules and figures.
 * Styles: src/styles/components/document.css.
 */
import { escapeHtml as e, formatMoney, formatNumber, formatPercent, formatDate, parseAmount } from './format.js';
import { termsById } from './model.js';
import { templateById } from './templates.js';
import { paylinkState, paidMatches, PAY_PROVIDERS, displayUrl } from './paylink.js';
import { docFontStyle } from './fonts.js';
import { qrSvg } from './qr.js';

// The site's button arrow; pdf.js draws its path as lines.
const PAY_ARROW = '<svg class="doc__pay-arrow" viewBox="0 0 26 10" aria-hidden="true"><path d="M0 5h24.5M20.5 1l4 4-4 4"/></svg>';

const lines = (...values) => values.map((v) => (v || '').trim()).filter(Boolean);
const block = (cls, arr) => (arr.length ? `<p class="${cls}">${arr.map(e).join('<br>')}</p>` : '');
const inline = (text) => (text || '').split('\n').map((s) => s.trim()).filter(Boolean);

export function isBlankItem(item, amount) {
  return !item.description.trim() && amount === 0;
}

// ---------------------------------------------------------------- parts
function parts(inv, totals, t, ph) {
  const cur = inv.meta.currency;
  const money = (n) => e(formatMoney(n, cur));
  const { business: b, client: c, meta: m, adjustments: a } = inv;
  const terms = termsById(m.terms);
  const L = t.labels;

  const orPh = (value, prompt, cls, tag = 'p') =>
    value && value.trim() ? `<${tag} class="${cls}">${e(value.trim())}</${tag}>` : ph ? `<${tag} class="${cls} is-ph">${e(prompt)}</${tag}>` : '';

  const contact = lines(b.email, b.phone, b.website, b.taxId && (/\b(lic|tax|vat|ein|abn|gst)\b/i.test(b.taxId) ? b.taxId.trim() : `Tax ID ${b.taxId.trim()}`));
  const issue = formatDate(m.issueDate);
  const due = formatDate(m.dueDate);
  const dueOn = m.dueDate ? (terms.id === 'receipt' ? 'Due on receipt' : `Due ${due}`) : '';
  const dueLabel = totals.paid > 0 ? L.due : 'Amount due';

  const p = {
    t, m, money, dueOn, dueLabel, terms, issue, due,
    logo: b.logo ? `<img class="doc__logo" src="${e(b.logo)}" alt="${e(b.name || 'Logo')}">` : '',
    name: (cls = '') => orPh(b.name, 'Your business name', `doc__business${cls ? ` ${cls}` : ''}`),
    address: (cls = 'doc__lines') => block(cls, lines(b.address)),
    contact: (cls = 'doc__lines') => block(cls, contact),
    /** Address and contact as one or two centered/inline lines, separated by middots. */
    contactLine: (cls = 'doc__lines') => {
      const rows = [inline(b.address).join(' · '), contact.join(' · ')].filter(Boolean);
      return rows.length ? `<p class="${cls}">${rows.map(e).join('<br>')}</p>` : '';
    },
    number: (cls = 'doc__number') => orPh(m.number, 'No number', cls),
    client: (label = L.billTo) => `
      <div class="doc__to">
        <p class="doc__label">${e(label)}</p>
        ${orPh(c.name, 'Client name', 'doc__client')}
        ${block('doc__lines', lines(c.address))}
        ${block('doc__lines', lines(c.email))}
      </div>`,
    project: (cls = 'doc__project') =>
      m.project && m.project.trim() ? `<div class="${cls}"><p class="doc__label">${e(L.project)}</p><p class="doc__project-text">${e(m.project.trim())}</p></div>` : '',
    /** [label, value] pairs for the invoice's facts. */
    facts: ({ number = false, project = false } = {}) =>
      [
        number && m.number.trim() && ['Invoice no.', m.number.trim()],
        issue && ['Issue date', issue],
        due && ['Due date', due],
        terms.id !== 'custom' && ['Terms', terms.label],
        project && m.project && m.project.trim() && [L.project, m.project.trim()],
      ].filter(Boolean),
    dl: (pairs, cls = 'doc__dates') => `<dl class="${cls}">${pairs.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>`,
    amountDue: (cls = 'doc__due') => `
      <div class="${cls}">
        <p class="doc__label">${e(dueLabel)}</p>
        <p class="doc__amount">${money(totals.due)}</p>
        ${dueOn ? `<p class="doc__due-on">${e(dueOn)}</p>` : ''}
      </div>`,
    items: () => itemsTable(inv, totals, t, ph, money),
    totals: () => totalsList(totals, a, t, cur, money),
    note: (label, text) =>
      text && text.trim() ? `<div class="doc__note"><p class="doc__label">${e(label)}</p><p class="doc__text">${e(text.trim())}</p></div>` : '',
  };
  /**
   * The payment link, when the user has added it to the invoice and it still
   * matches the invoice's amount due; a "Paid" mark once it has been paid.
   * A link for another amount is never shown (the editor asks to regenerate it).
   */
  p.payLink = () => {
    const l = inv.paylink;
    if (!l) return '';
    if (paidMatches(inv, totals)) {
      const on = l.paidAt ? formatDate(l.paidAt.slice(0, 10)) : '';
      return `<p class="doc__paid"><span class="doc__paid-mark">Paid</span>${on ? `<span class="doc__paid-on">${e(on)}</span>` : ''}</p>`;
    }
    const state = paylinkState(inv, totals);
    if (!l.onInvoice || (state !== 'unpaid' && state !== 'failed')) return '';
    return `<div class="doc__pay${l.qr ? ' doc__pay--qr' : ''}">
        <div class="doc__pay-main">
          <a class="doc__pay-btn" href="${e(l.url)}">Pay invoice ${PAY_ARROW}</a>
          <p class="doc__pay-via">${e(PAY_PROVIDERS[l.provider].via)}</p>
          <p class="doc__pay-url">${e(displayUrl(l.url))}</p>
        </div>
        ${l.qr ? qrSvg(l.url, { cls: 'doc__qr', label: 'QR code to pay this invoice online' }) : ''}
      </div>`;
  };
  p.payment = () => {
    const link = p.payLink();
    if (!link) return p.note('Payment', inv.payment);
    const text = inv.payment && inv.payment.trim();
    return `<div class="doc__note doc__note--pay"><p class="doc__label">Payment</p>${link}${text ? `<p class="doc__text">${e(text)}</p>` : ''}</div>`;
  };
  p.notes = () => p.note('Notes', inv.notes);
  p.noteBlocks = (cls = 'doc__notes') => {
    const html = p.payment() + p.notes();
    return html ? `<section class="${cls}">${html}</section>` : '';
  };
  p.foot = () => {
    const f = lines(b.name, m.number && `Invoice ${m.number}`);
    return f.length ? `<footer class="doc__foot"><span>${f.map(e).join('</span><span>')}</span></footer>` : '';
  };
  return p;
}

// ---------------------------------------------------------------- items
function itemsTable(inv, totals, t, ph, money) {
  const T = t.table;
  const rows = inv.items
    .map((it, i) => ({ it, amount: totals.lines[i], blank: isBlankItem(it, totals.lines[i]) }))
    .filter((r) => ph || !r.blank);
  const filled = rows.filter((r) => !r.blank);
  const fixedFee = T.fixedFee && filled.length > 0 && filled.every((r) => parseAmount(r.it.quantity) === 1);
  const showQty = !fixedFee;
  const cols = 1 + (T.numbered ? 1 : 0) + (showQty ? 2 : 0) + 1;

  const groupsOn = Boolean(t.groups) && filled.some((r) => (r.it.group || '').trim());
  let n = 0;
  const row = (r) => {
    n += 1;
    const desc = r.it.description.trim();
    let descHtml;
    if (!desc) descHtml = `<span class="is-muted">Item description</span>`;
    else if (T.detail && desc.includes('\n')) {
      const [first, ...rest] = desc.split('\n');
      descHtml = `<span class="doc__item-title">${e(first.trim())}</span><span class="doc__detail">${e(rest.join('\n').trim())}</span>`;
    } else descHtml = e(desc);
    return `<tr${r.blank ? ' class="is-ph"' : ''}>
        ${T.numbered ? `<td class="doc__index">${String(n).padStart(2, '0')}</td>` : ''}
        <td class="doc__desc">${descHtml}</td>
        ${showQty ? `<td class="num">${e(formatNumber(parseAmount(r.it.quantity)))}</td><td class="num">${money(parseAmount(r.it.price))}</td>` : ''}
        <td class="num doc__line">${money(r.amount)}</td>
      </tr>`;
  };

  let body;
  if (groupsOn) {
    const order = [...t.groups.options];
    const groupOf = (r) => (r.it.group || '').trim() || t.groups.fallback;
    rows.forEach((r) => { if (!order.includes(groupOf(r))) order.push(groupOf(r)); });
    body = order
      .map((g) => {
        const rs = rows.filter((r) => groupOf(r) === g);
        if (!rs.length) return '';
        const sub = rs.reduce((s, r) => s + r.amount, 0);
        return `<tbody class="doc__group">
        <tr class="doc__group-head"><th colspan="${cols}" scope="rowgroup">${e(g)}</th></tr>
        ${rs.map(row).join('')}
        ${t.groups.subtotals && rs.filter((r) => !r.blank).length > 1 ? `<tr class="doc__subtotal"><td colspan="${cols - 1}">${e(g)} subtotal</td><td class="num">${money(Math.round(sub * 100) / 100)}</td></tr>` : ''}
      </tbody>`;
      })
      .join('');
  } else {
    body = `<tbody>${rows.map(row).join('')}</tbody>`;
  }

  const head = `<thead><tr>
      ${T.numbered ? '<th scope="col" class="doc__index">No.</th>' : ''}
      <th scope="col">${e(T.desc)}</th>
      ${showQty ? `<th scope="col" class="num">${e(T.qty)}</th><th scope="col" class="num">${e(T.price)}</th>` : ''}
      <th scope="col" class="num">${e(showQty ? T.amount : T.price)}</th>
    </tr></thead>`;
  return `<table class="doc__items${groupsOn ? ' doc__items--grouped' : ''}${T.numbered ? ' doc__items--numbered' : ''}">${head}${body}</table>`;
}

// ---------------------------------------------------------------- totals
function totalsList(totals, a, t, cur, money) {
  const row = (label, value, cls = '') => `<div${cls ? ` class="${cls}"` : ''}><dt>${label}</dt><dd>${value}</dd></div>`;
  const discountLabel = totals.discountRate != null ? `Discount (${e(formatPercent(totals.discountRate))})` : 'Discount';
  const paid = totals.paid > 0;
  return `
  <dl class="doc__totals">
    ${paid && totals.total === totals.subtotal ? '' : row('Subtotal', money(totals.subtotal))}
    ${totals.discount > 0 ? row(discountLabel, `−${money(totals.discount)}`) : ''}
    ${totals.taxRate > 0 ? row(`${e(a.taxLabel || 'Tax')} (${e(formatPercent(totals.taxRate))})`, money(totals.tax)) : ''}
    ${totals.shipping > 0 ? row(e(a.shippingLabel || 'Shipping'), money(totals.shipping)) : ''}
    ${paid ? row('Total', money(totals.total), totals.total === totals.subtotal ? '' : 'doc__total') + row(e(t.labels.paid), `−${money(totals.paid)}`) : ''}
    ${row(`${paid ? e(t.labels.due) : 'Total'} <span>${e(cur)}</span>`, money(totals.due), 'doc__grand')}
  </dl>`;
}

// ---------------------------------------------------------------- compositions
const COMPOSE = {
  /** Classic / Modern: letterhead left, number right; client · dates · amount due. */
  split: (p) => `
  <header class="doc__head">
    <div class="doc__from">
      ${p.logo}
      ${p.name()}
      ${p.address()}
      ${p.contact()}
    </div>
    <div class="doc__title">
      <p class="doc__kind">${e(p.t.labels.kind)}</p>
      ${p.number()}
    </div>
  </header>
  <section class="doc__meta">
    ${p.client()}
    ${p.dl(p.facts())}
    ${p.amountDue()}
  </section>
  ${p.project('doc__project doc__project--row')}
  ${p.items()}
  ${p.totals()}
  ${p.noteBlocks()}`,

  /** Professional / Photographer: centered letterhead, facts in a ruled strip or a single line. */
  letterhead: (p) => {
    const strip = p.t.style.meta !== 'line';
    const facts = strip
      ? `<dl class="lh__strip">
          ${p.m.number.trim() ? `<div><dt>Invoice no.</dt><dd>${e(p.m.number.trim())}</dd></div>` : ''}
          ${p.facts().map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}
          <div class="lh__strip-due"><dt>${e(p.dueLabel)}</dt><dd>${p.money(p.totalsDue)}</dd></div>
        </dl>`
      : `<div class="lh__line">
          <p class="doc__kind">${e(p.t.labels.kind)}</p>
          <p class="lh__facts">${[p.m.number.trim() && `No. ${p.m.number.trim()}`, p.issue && `Issued ${p.issue}`, p.dueOn].filter(Boolean).map(e).join('<span class="lh__dot"> · </span>')}</p>
        </div>`;
    return `
  <header class="lh__head">
    ${p.logo}
    ${p.name('lh__name')}
    ${p.contactLine('doc__lines lh__contact')}
  </header>
  ${facts}
  <section class="lh__parties">
    ${p.client()}
    ${p.project('doc__project lh__project')}
    ${strip ? '' : p.amountDue('doc__due lh__due')}
  </section>
  ${p.items()}
  ${p.totals()}
  ${p.noteBlocks()}`;
  },

  /** Editorial / Freelancer: a large title, then a ruled side column beside the figures. */
  title: (p) => `
  <header class="ti__top">
    <div class="ti__brand">${p.logo}${p.name()}</div>
    ${p.contactLine('doc__lines ti__contact')}
  </header>
  <section class="ti__title">
    <div>
      <p class="ti__word">${e(p.t.labels.kind)}</p>
      ${p.m.number.trim() ? `<p class="ti__no">No. ${e(p.m.number.trim())}</p>` : p.number('ti__no')}
    </div>
    ${p.amountDue('doc__due ti__due')}
  </section>
  ${p.project('doc__project ti__project')}
  <div class="ti__body">
    <aside class="ti__side">
      ${p.client()}
      ${p.dl(p.facts())}
      ${p.payment()}
      ${p.notes()}
    </aside>
    <div class="ti__main">
      ${p.items()}
      ${p.totals()}
    </div>
  </div>`,

  /** Consultant / Design Studio: everything about the parties in a side column. */
  sidebar: (p) => `
  <div class="sb">
    <aside class="sb__side">
      ${p.logo}
      ${p.name()}
      ${p.address()}
      ${p.contact()}
      ${p.client()}
      ${p.dl(p.facts())}
      ${p.payment()}
    </aside>
    <div class="sb__main">
      <header class="sb__head">
        <p class="doc__kind">${e(p.t.labels.kind)}</p>
        ${p.number()}
      </header>
      <section class="sb__summary">
        ${p.project('doc__project sb__project')}
        ${p.amountDue('doc__due sb__due')}
      </section>
      ${p.items()}
      ${p.totals()}
      ${p.notes()}
    </div>
  </div>`,

  /** Executive / Agency: the amount due as the headline. */
  statement: (p) => `
  <header class="st__head">
    <div class="st__brand">${p.logo}${p.name(p.t.style.nameStyle === 'caps' ? 'st__name--caps' : '')}</div>
    <div class="st__contact">${p.address()}${p.contact()}</div>
  </header>
  <section class="st__hero">
    <div class="st__lead">
      <p class="doc__label">${e(p.dueLabel)}</p>
      <p class="doc__amount st__amount">${p.money(p.totalsDue)}</p>
      ${p.dueOn ? `<p class="doc__due-on">${e(p.dueOn)}</p>` : ''}
    </div>
    ${p.dl(p.facts({ number: true, project: true }), 'doc__dates st__ledger')}
  </section>
  <section class="st__parties">
    ${p.client()}
    ${p.payment()}
  </section>
  ${p.items()}
  ${p.totals()}
  ${p.notes() ? `<section class="doc__notes doc__notes--single">${p.notes()}</section>` : ''}`,

  /** Minimal / Home Services: one column, no heavy rules. */
  minimal: (p) => `
  <header class="mn__head">
    <div class="mn__from">${p.logo}${p.name()}${p.contactLine('doc__lines')}</div>
    <p class="mn__kind">${e(p.t.labels.kind)} ${p.m.number.trim() ? `<span>${e(p.m.number.trim())}</span>` : ''}</p>
  </header>
  <section class="mn__facts">
    ${p.client()}
    ${p.dl(p.facts())}
    ${p.amountDue()}
  </section>
  ${p.project('doc__project mn__project')}
  ${p.items()}
  ${p.totals()}
  ${p.noteBlocks('doc__notes doc__notes--stacked')}`,

  /** Contractor / Construction: ruled boxes and sections, like a job ledger. */
  ledger: (p) => `
  <header class="lg__head">
    <div class="lg__from">${p.logo}${p.name()}${p.address()}${p.contact()}</div>
    <div class="lg__box">
      <p class="lg__kind">${e(p.t.labels.kind)}</p>
      ${p.dl(p.facts({ number: true }), 'doc__dates lg__facts')}
    </div>
  </header>
  <section class="lg__info">
    ${p.client()}
    ${p.project('doc__project lg__project') || '<div class="doc__project lg__project"></div>'}
    ${p.amountDue('doc__due lg__due')}
  </section>
  ${p.items()}
  ${p.totals()}
  ${p.noteBlocks('doc__notes lg__notes')}`,
};

/**
 * @param {object} inv     invoice (see model.js)
 * @param {object} totals  computeTotals(inv)
 * @param {object} [opt]
 * @param {boolean} [opt.placeholders]  show muted prompts for empty fields (screen only)
 * @param {string}  [opt.template]      render with this template instead of the invoice's own
 */
export function renderInvoice(inv, totals, opt = {}) {
  const t = templateById(opt.template || inv.meta.template);
  const p = parts(inv, totals, t, Boolean(opt.placeholders));
  p.totalsDue = totals.due;
  const m = inv.meta;
  const cls = [
    'doc',
    `doc--${t.face}`,
    `doc--${m.paper === 'a4' ? 'a4' : 'letter'}`,
    `doc--c-${t.composition}`,
    `doc--t-${t.id}`,
    t.density !== 'regular' && `doc--d-${t.density}`,
    t.style.grid && 'doc--grid',
    t.style.nameStyle && `doc--name-${t.style.nameStyle}`,
  ].filter(Boolean).join(' ');
  // The invoice's own font, if it has one that is available here (core/fonts.js).
  const font = docFontStyle(m.font, t.face);
  return `<article class="${cls}${font ? ' doc--font' : ''}"${font ? ` style="${e(font)}"` : ''} data-template="${t.id}" aria-label="Invoice ${e(m.number)}">
  ${COMPOSE[t.composition](p)}
  ${p.foot()}
</article>`;
}

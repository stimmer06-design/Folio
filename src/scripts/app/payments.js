/**
 * Payment links in the editor ("Payment & notes").
 *
 * The first time, the user connects the account that should receive the money:
 * Stripe (Stripe's own onboarding pages) or PayPal (their PayPal email). After
 * that one click creates a link for the open invoice. The server
 * (server/payments) computes the amount from the invoice's figures; this code
 * never sends an amount, only checks that the server's equals the invoice's.
 *
 * The link is stored on the invoice (invoice.paylink, core/paylink.js) and
 * shown on it only after "Add to invoice". If the amount due, currency or
 * number changes, the link is taken off the invoice until it is regenerated.
 * Its status comes from the server, which hears it from Stripe or PayPal.
 *
 * In this browser: localStorage "folio:payments" keeps the connection keys
 * (one per provider; the server only has their hashes) and which links have
 * already been reported to analytics.
 */
import { amountDue, paylinkState, PAY_PROVIDERS, displayUrl } from '../core/paylink.js';
import { formatMoney, formatDate, currencyDigits } from '../core/format.js';
import { track } from '../core/track.js';

export const PAY_KEY = 'folio:payments';
const API = '/api/payments';
const POLL_MS = 60 * 1000;
const RESUME_KEY = 'folio:payments:resume';
const NAMES = { stripe: 'Stripe', paypal: 'PayPal' };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const local = () => { try { return window.localStorage; } catch { return null; } };
const session = () => { try { return window.sessionStorage; } catch { return null; } };

class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || `Request failed (${status})`);
    this.status = status;
    this.code = body && body.code;
  }
}

export class Payments {
  /**
   * @param {HTMLElement} root  the [data-paylink] block
   * @param {object} o
   * @param {() => object} o.getInvoice
   * @param {() => object} o.getTotals
   * @param {(fn: (inv) => void) => void} o.update   change the invoice, then refresh and save
   * @param {(msg: string, kind?: string) => void} o.toast
   * @param {(inv) => object} o.eventProps            analytics properties for an invoice (template, layout)
   */
  constructor(root, { getInvoice, getTotals, update, toast, eventProps, storage = local() }) {
    this.root = root;
    this.getInvoice = getInvoice;
    this.getTotals = getTotals;
    this.update = update;
    this.toast = toast;
    this.eventProps = eventProps;
    this.storage = storage;
    this.config = null;
    this.busy = false;
    this.connecting = null;
    this.justCreated = null;
    this.confirming = null;
    this.timer = 0;
    let saved = null;
    try { saved = JSON.parse(storage?.getItem(PAY_KEY) || 'null'); } catch { saved = null; }
    this.state = {
      provider: saved && NAMES[saved.provider] ? saved.provider : 'stripe',
      connections: saved && saved.connections && typeof saved.connections === 'object' ? saved.connections : {},
      reported: saved && saved.reported && typeof saved.reported === 'object' ? saved.reported : {},
    };

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-paylink]');
      if (btn) this.action(btn.dataset.paylink, btn, e);
    });
    root.addEventListener('change', (e) => {
      if (e.target.name === 'paylink-provider') {
        this.state.provider = e.target.value;
        this.connecting = null;
        this.persist();
        this.render();
      }
      if (e.target.matches('[data-paylink-qr]')) this.update((inv) => { if (inv.paylink) inv.paylink.qr = e.target.checked; });
    });
    $('[data-paylink-payee]', root).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.action('connect-paypal'); }
    });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.sync());
  }

  persist() {
    try { this.storage?.setItem(PAY_KEY, JSON.stringify({ v: 1, ...this.state })); } catch { /* blocked storage: works for this visit */ }
  }

  /** For the backup file: the connection keys, so a restored backup can still manage its links. */
  backup() {
    const c = this.state.connections;
    return Object.keys(c).length ? { connections: JSON.parse(JSON.stringify(c)) } : undefined;
  }

  /** From a backup file: adopt connections this browser doesn't have. Returns how many. */
  restore(data) {
    const c = data && data.connections;
    if (!c || typeof c !== 'object') return 0;
    let n = 0;
    for (const p of Object.keys(NAMES)) {
      const v = c[p];
      if (!v || typeof v.key !== 'string' || !/^fpc_[A-Za-z0-9_.-]{40,200}$/.test(v.key) || this.state.connections[p]) continue;
      this.state.connections[p] = { key: v.key, id: String(v.id || '').slice(0, 64), status: String(v.status || '').slice(0, 20), ready: v.ready === true, label: String(v.label || '').slice(0, 120), at: String(v.at || '').slice(0, 40) };
      n += 1;
    }
    if (n) {
      this.persist();
      this.render();
      this.sync();
    }
    return n;
  }

  get enabled() {
    return Boolean(this.config && (this.config.providers.stripe || this.config.providers.paypal));
  }

  providers() {
    return this.config ? ['stripe', 'paypal'].filter((p) => this.config.providers[p]) : [];
  }

  // ---------------------------------------------------------------- server
  async api(method, path, { body, provider } = {}) {
    const headers = { Accept: 'application/json' };
    const conn = provider && this.state.connections[provider];
    if (conn && conn.key) headers.Authorization = `Bearer ${conn.key}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  /** Is the payment service there, and which providers does it offer? (cached for the tab) */
  async init({ returned } = {}) {
    const cache = session();
    try {
      const hit = JSON.parse(cache?.getItem('folio:payments:config') || 'null');
      if (hit && Date.now() - hit.at < 10 * 60 * 1000) this.config = hit.config;
    } catch { /* ignore */ }
    if (!this.config) {
      try {
        this.config = await this.api('GET', '/config');
        try { cache?.setItem('folio:payments:config', JSON.stringify({ at: Date.now(), config: this.config })); } catch { /* ignore */ }
      } catch {
        this.config = null;
      }
    }
    if (this.enabled && !this.providers().includes(this.state.provider)) this.state.provider = this.providers()[0];
    this.render();
    if (!this.enabled) return;
    if (returned === 'stripe') await this.returnedFromStripe();
    this.sync();
    clearInterval(this.timer);
    this.timer = setInterval(() => document.visibilityState === 'visible' && this.sync(), POLL_MS);
  }

  /** Back from Stripe's onboarding: if it's finished, make the link the user asked for. */
  async returnedFromStripe() {
    const store = session();
    let resume = null;
    try { resume = JSON.parse(store?.getItem(RESUME_KEY) || 'null'); } catch { resume = null; }
    try { store?.removeItem(RESUME_KEY); } catch { /* ignore */ }
    const conn = await this.refreshConnection('stripe');
    if (!conn) return;
    if (!conn.ready) {
      this.connecting = 'stripe-unfinished';
      this.render();
      this.toast('Your Stripe account isn’t ready to take payments yet. Finish setting it up to create the link.');
      return;
    }
    const inv = this.getInvoice();
    if (resume && resume.invoiceId === inv.id && !inv.paylink) {
      this.state.provider = 'stripe';
      this.persist();
      await this.create('stripe', { connectedNow: true });
    } else {
      this.toast('Stripe is connected. You can now create payment links.', 'success');
    }
  }

  async refreshConnection(provider) {
    if (!this.state.connections[provider]) return null;
    try {
      const { connection } = await this.api('GET', '/connections/current', { provider });
      Object.assign(this.state.connections[provider], { status: connection.status, ready: connection.ready, label: connection.label || this.state.connections[provider].label || '' });
      this.persist();
      this.render();
      return this.state.connections[provider];
    } catch (err) {
      if (err.status === 401) this.forget(provider);
      else this.showError(err.message);
      return null;
    }
  }

  /** The connection is gone on the server (or was never valid): drop it here too. */
  forget(provider) {
    delete this.state.connections[provider];
    this.persist();
    this.render();
  }

  // ---------------------------------------------------------------- links
  figures(inv) {
    return {
      id: inv.id,
      number: inv.meta.number.trim(),
      currency: inv.meta.currency,
      project: (inv.meta.project || '').trim(),
      business: inv.business.name.trim(),
      items: inv.items.map((it) => ({ quantity: it.quantity, price: it.price })),
      adjustments: {
        taxRate: inv.adjustments.taxRate,
        discountType: inv.adjustments.discountType,
        discountValue: inv.adjustments.discountValue,
        shipping: inv.adjustments.shipping,
        paid: inv.adjustments.paid,
      },
    };
  }

  async create(provider, { connectedNow = false } = {}) {
    const inv = this.getInvoice();
    const totals = this.getTotals();
    const amount = amountDue(totals, inv.meta.currency);
    if (!(amount > 0)) return this.showError('Add the amounts first: there is nothing due on this invoice yet.');
    if ((this.config.unsupported[provider] || []).includes(inv.meta.currency)) {
      return this.showError(`${NAMES[provider]} doesn’t accept payments in ${inv.meta.currency}. Use ${provider === 'paypal' ? 'Stripe' : 'PayPal'}, or change the currency.`);
    }
    const previous = inv.paylink;
    this.setBusy(true);
    try {
      const { link } = await this.api('POST', '/links', { provider, body: { invoice: this.figures(inv) } });
      // The server's amount must be the one on the invoice; otherwise don't use the link.
      if (link.amount !== amount || link.currency !== inv.meta.currency) {
        await this.api('DELETE', `/links/${link.id}`, { provider }).catch(() => {});
        throw new Error('The payment service calculated a different amount, so the link wasn’t created. Please try again.');
      }
      this.justCreated = link.id;
      this.update((cur) => {
        cur.paylink = {
          id: link.id,
          url: link.url,
          provider,
          amount: link.amount,
          currency: link.currency,
          number: inv.meta.number.trim(),
          status: link.status,
          createdAt: link.createdAt,
          paidAt: '',
          onInvoice: previous ? previous.onInvoice : false,
          qr: previous ? previous.qr : false,
        };
      });
      this.clearError();
      track('payment_link_created', { ...this.eventProps(this.getInvoice()), provider });
      this.toast(previous ? 'New payment link created. The old one no longer works.' : connectedNow ? `${NAMES[provider]} is connected. Payment link created.` : 'Payment link created.', 'success');
    } catch (err) {
      if (err.status === 401) {
        this.forget(provider);
        this.connecting = provider;
        this.render();
        this.showError(`Connect ${NAMES[provider]} again to create links from this browser.`);
      } else if (err.code === 'onboarding' || err.code === 'revoked') {
        this.connecting = 'stripe-unfinished';
        this.render();
        this.showError(err.message);
      } else {
        this.showError(err.message);
      }
    } finally {
      this.setBusy(false);
    }
  }

  /** Ask the server for the open invoice's link status, and record changes. */
  async sync() {
    const inv = this.getInvoice();
    const l = inv && inv.paylink;
    if (!this.enabled || !l || !['unpaid', 'pending', 'failed'].includes(l.status) || !this.state.connections[l.provider]) return;
    let link;
    try {
      ({ link } = await this.api('GET', `/links/${l.id}`, { provider: l.provider }));
    } catch (err) {
      if (err.status === 404) this.update((cur) => { if (cur.paylink && cur.paylink.id === l.id) cur.paylink.status = 'cancelled'; });
      if (err.status === 401) this.forget(l.provider);
      return;
    }
    const cur = this.getInvoice();
    if (!cur.paylink || cur.paylink.id !== link.id) return;
    const changed = cur.paylink.status !== link.status || (link.paidAt || '') !== cur.paylink.paidAt;
    if (changed) {
      this.update((x) => {
        x.paylink.status = link.status;
        x.paylink.paidAt = link.paidAt || '';
      });
      if (link.status === 'paid') this.toast(`Invoice ${cur.meta.number} has been paid.`, 'success');
    }
    // Analytics: each link's first click and its payment, once (no payer is ever tracked).
    const props = { ...this.eventProps(cur), provider: link.provider };
    if (link.opens > 0 && this.once('clicked', link.id)) track('payment_link_clicked', props);
    if (link.status === 'paid' && this.once('paid', link.id)) track('invoice_payment_completed', props);
  }

  once(kind, id) {
    const list = (this.state.reported[kind] = this.state.reported[kind] || []);
    if (list.includes(id)) return false;
    list.push(id);
    if (list.length > 300) list.splice(0, list.length - 300);
    this.persist();
    return true;
  }

  // ---------------------------------------------------------------- actions
  async action(name, btn) {
    const inv = this.getInvoice();
    const l = inv.paylink;
    const provider = this.state.provider;
    if (this.busy && name !== 'copy') return;
    this.clearError();
    switch (name) {
      case 'create':
      case 'regenerate': {
        const p = name === 'regenerate' && l ? l.provider : provider;
        const conn = this.state.connections[p];
        if (!conn) {
          this.connecting = p;
          this.render();
          const focus = p === 'paypal' ? $('[data-paylink-payee]', this.root) : $('[data-paylink="connect-stripe"]', this.root);
          if (focus) focus.focus();
          return;
        }
        if (p === 'stripe' && !conn.ready) {
          const fresh = await this.refreshConnection('stripe');
          if (!fresh || !fresh.ready) {
            this.connecting = 'stripe-unfinished';
            this.render();
            return;
          }
        }
        await this.create(p);
        return;
      }
      case 'connect-stripe':
        return this.connectStripe();
      case 'continue-stripe':
        return this.continueStripe();
      case 'connect-paypal':
        return this.connectPayPal();
      case 'cancel-connect':
        this.connecting = null;
        this.render();
        return;
      case 'copy':
        return this.copy();
      case 'toggle':
        this.update((cur) => { if (cur.paylink) cur.paylink.onInvoice = !cur.paylink.onInvoice; });
        this.toast(this.getInvoice().paylink.onInvoice ? 'The payment link is on the invoice.' : 'The payment link is off the invoice. It still works.');
        return;
      case 'remove':
        if (this.confirming !== 'remove') return this.confirm('remove', btn, 'Remove and cancel link');
        this.confirming = null;
        return this.remove();
      case 'disconnect':
        if (this.confirming !== 'disconnect') return this.confirm('disconnect', btn, `Disconnect and cancel its links`);
        this.confirming = null;
        return this.disconnect(btn.dataset.provider);
      default:
    }
  }

  /** Two-step buttons for actions that break links already sent. */
  confirm(kind, btn, text) {
    this.confirming = kind;
    const original = btn.textContent;
    btn.textContent = text;
    btn.classList.add('link-btn--danger');
    setTimeout(() => {
      if (this.confirming === kind) this.confirming = null;
      btn.textContent = original;
      btn.classList.remove('link-btn--danger');
    }, 5000);
  }

  async connectStripe() {
    const inv = this.getInvoice();
    this.setBusy(true);
    try {
      const data = await this.api('POST', '/connections', { body: { provider: 'stripe' } });
      this.state.connections.stripe = { key: data.key, id: data.connection.id, status: data.connection.status, ready: false, label: '', at: new Date().toISOString() };
      this.state.provider = 'stripe';
      this.persist();
      try { session()?.setItem(RESUME_KEY, JSON.stringify({ invoiceId: inv.id, provider: 'stripe', at: Date.now() })); } catch { /* ignore */ }
      window.location.assign(data.onboardingUrl);
    } catch (err) {
      this.showError(err.message);
      this.setBusy(false);
    }
  }

  async continueStripe() {
    this.setBusy(true);
    try {
      const { onboardingUrl } = await this.api('POST', '/connections/current/onboarding', { provider: 'stripe' });
      try { session()?.setItem(RESUME_KEY, JSON.stringify({ invoiceId: this.getInvoice().id, provider: 'stripe', at: Date.now() })); } catch { /* ignore */ }
      window.location.assign(onboardingUrl);
    } catch (err) {
      if (err.status === 401) this.forget('stripe');
      this.showError(err.message);
      this.setBusy(false);
    }
  }

  async connectPayPal() {
    const input = $('[data-paylink-payee]', this.root);
    const payee = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payee) && !/^[A-Z0-9]{13}$/.test(payee)) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return this.showError('Enter the email address of the PayPal account that should receive payments.');
    }
    input.removeAttribute('aria-invalid');
    this.setBusy(true);
    try {
      const data = await this.api('POST', '/connections', { body: { provider: 'paypal', payee } });
      this.state.connections.paypal = { key: data.key, id: data.connection.id, status: data.connection.status, ready: true, label: data.connection.label, at: new Date().toISOString() };
      this.state.provider = 'paypal';
      this.connecting = null;
      this.persist();
      this.setBusy(false);
      await this.create('paypal', { connectedNow: true });
    } catch (err) {
      this.showError(err.message);
      this.setBusy(false);
    }
  }

  async copy() {
    const l = this.getInvoice().paylink;
    if (!l) return;
    try {
      await navigator.clipboard.writeText(l.url);
      this.toast('Payment link copied.', 'success');
    } catch {
      const a = $('[data-paylink-url]', this.root);
      const range = document.createRange();
      range.selectNodeContents(a);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      this.toast('Press Ctrl+C (⌘C) to copy the selected link.');
    }
  }

  async remove() {
    const l = this.getInvoice().paylink;
    if (!l) return;
    this.setBusy(true);
    try {
      if (this.state.connections[l.provider] && ['unpaid', 'failed', 'pending'].includes(l.status)) {
        await this.api('DELETE', `/links/${l.id}`, { provider: l.provider }).catch((err) => { if (err.status !== 404 && err.status !== 401) throw err; });
      }
      this.update((cur) => { cur.paylink = null; });
      this.toast('Payment link removed. It no longer works.');
    } catch (err) {
      this.showError(err.message);
    } finally {
      this.setBusy(false);
    }
  }

  async disconnect(provider) {
    if (!this.state.connections[provider]) return;
    this.setBusy(true);
    try {
      await this.api('DELETE', '/connections/current', { provider }).catch((err) => { if (err.status !== 401) throw err; });
      this.forget(provider);
      this.update((cur) => { if (cur.paylink && cur.paylink.provider === provider && cur.paylink.status !== 'paid') cur.paylink.status = 'cancelled'; });
      this.toast(`${NAMES[provider]} disconnected. Its payment links no longer work.`);
    } catch (err) {
      this.showError(err.message);
    } finally {
      this.setBusy(false);
    }
  }

  // ---------------------------------------------------------------- view
  setBusy(on) {
    this.busy = on;
    $$('[data-paylink="create"], [data-paylink="regenerate"], [data-paylink="connect-stripe"], [data-paylink="connect-paypal"], [data-paylink="continue-stripe"]', this.root)
      .forEach((b) => (on ? b.setAttribute('aria-busy', 'true') : b.removeAttribute('aria-busy')));
  }

  showError(msg) {
    const p = $('[data-paylink-error]', this.root);
    p.textContent = msg;
    p.hidden = !msg;
  }

  clearError() {
    this.showError('');
  }

  render() {
    const root = this.root;
    root.hidden = !this.enabled;
    if (!this.enabled) return;
    const inv = this.getInvoice();
    const totals = this.getTotals();
    if (!inv || !totals) return;
    const l = inv.paylink;
    const state = paylinkState(inv, totals);
    const providers = this.providers();
    const provider = this.state.provider;

    // Provider choice (only when both are offered).
    const seg = $('[data-paylink-providers]', root);
    seg.hidden = providers.length < 2;
    $$('input[name="paylink-provider"]', root).forEach((r) => {
      r.checked = r.value === provider;
      r.closest('label').hidden = !providers.includes(r.value);
    });
    $('[data-paylink-create-label]', root).textContent = `Create ${NAMES[provider]} payment link`;
    $('[data-paylink-test]', root).hidden = !(this.config.test && this.config.test[provider]);

    // New link, or connecting first.
    const fresh = !l || state === 'expired' || state === 'cancelled';
    $('[data-paylink-new]', root).hidden = !fresh;
    const connect = $('[data-paylink-connect]', root);
    const connecting = this.connecting;
    connect.hidden = !fresh || !connecting;
    $('[data-connect="stripe"]', root).hidden = connecting !== 'stripe';
    $('[data-connect="stripe-unfinished"]', root).hidden = connecting !== 'stripe-unfinished';
    $('[data-connect="paypal"]', root).hidden = connecting !== 'paypal';
    $('[data-paylink="create"]', root).hidden = Boolean(connecting) && fresh;
    $('[data-paylink-ended]', root).hidden = !(l && fresh);
    if (l && fresh) $('[data-paylink-ended]', root).textContent = state === 'expired' ? 'The last payment link for this invoice expired.' : 'The last payment link for this invoice was cancelled.';

    // The current link.
    const current = $('[data-paylink-current]', root);
    current.hidden = fresh;
    const status = $('[data-paylink-status]', root);
    const STATUS = { unpaid: 'Unpaid', pending: 'Processing', paid: 'Paid', failed: 'Payment failed', changed: 'Needs regenerating', renumbered: 'Needs regenerating' };
    status.textContent = !fresh && STATUS[state] ? STATUS[state] : '';
    status.dataset.state = fresh ? '' : state;
    if (!fresh) {
      const money = formatMoney(l.amount / 10 ** currencyDigits(l.currency), l.currency);
      const when = (iso) => formatDate((iso || '').slice(0, 10));
      const live0 = state === 'unpaid' || state === 'failed';
      $('[data-paylink-created]', root).textContent = l.status === 'paid'
        ? `Paid ${money}${l.paidAt ? ` on ${when(l.paidAt)}` : ''} via ${NAMES[l.provider]}`
        : this.justCreated === l.id && live0
          ? 'Payment link created'
          : `${NAMES[l.provider]} · ${money}${l.createdAt ? ` · created ${when(l.createdAt)}` : ''}`;
      const a = $('[data-paylink-url]', root);
      a.href = l.url;
      a.textContent = displayUrl(l.url);
      $('[data-paylink="open"]', root).href = `${l.url}?preview`;
      const live = state === 'unpaid' || state === 'failed';
      const toggle = $('[data-paylink="toggle"]', root);
      toggle.hidden = !live;
      toggle.textContent = l.onInvoice ? 'Remove from invoice' : 'Add to invoice';
      toggle.setAttribute('aria-pressed', String(l.onInvoice));
      $('[data-paylink="copy"]', root).hidden = !live;
      $('[data-paylink="open"]', root).hidden = !live;
      $('[data-paylink="remove"]', root).hidden = state === 'paid';
      const qrRow = $('[data-paylink-qr-row]', root);
      qrRow.hidden = !live || !l.onInvoice;
      $('[data-paylink-qr]', root).checked = l.qr;
      const warn = $('[data-paylink-warn]', root);
      warn.hidden = !(state === 'changed' || state === 'renumbered');
      $('[data-paylink-warn-text]', root).textContent = state === 'renumbered'
        ? 'Invoice number changed — payment link needs to be regenerated.'
        : 'Invoice total changed — payment link needs to be regenerated.';
    }

    // Accounts.
    const accounts = providers.filter((p) => this.state.connections[p]).map((p) => {
      const c = this.state.connections[p];
      const label = c.label ? `${NAMES[p]}: ${c.label}` : `${NAMES[p]} connected`;
      return `${label}${c.ready === false ? ' (setup not finished)' : ''}`;
    });
    const acc = $('[data-paylink-account]', root);
    acc.hidden = !accounts.length;
    $('[data-paylink-account-text]', root).textContent = accounts.join(' · ');
    const dis = $('[data-paylink="disconnect"]', root);
    const connectedHere = l && !fresh ? l.provider : providers.find((p) => this.state.connections[p] && p === provider) || providers.find((p) => this.state.connections[p]);
    dis.hidden = !connectedHere;
    if (connectedHere && this.confirming !== 'disconnect') {
      dis.dataset.provider = connectedHere;
      dis.textContent = `Disconnect ${NAMES[connectedHere]}`;
    }
  }
}

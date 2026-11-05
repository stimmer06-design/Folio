import { PARTS, CAT_LABEL, RANKS, UPGRADES, THEMES, RGB_COLORS, PERIPHERALS, rankFor } from './catalog.js';
import { fmtTime, fmtMoney } from './util.js';
import { audio } from './audio.js';
import { logoCanvas, drawGalaxy, canvas } from './textures.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(game) {
    this.g = game;
    this.logoURL = logoCanvas(1024, 256).toDataURL();
    const [mc, mctx] = canvas(128, 128);
    drawGalaxy(mctx, 64, 64, 60, { dots: 400 });
    this.markURL = mc.toDataURL();
    $('loadlogo').src = this.logoURL;
    this.modal = $('modal');
    this.lastPrompt = null;
    $('hb-pause').onclick = () => {
      audio.play('ui');
      this.g.pause();
    };
    $('hb-hint').onclick = () => {
      audio.play('ui');
      this.g.hint();
    };
    // ui click sounds everywhere
    document.addEventListener('pointerover', (e) => {
      if (e.target.closest && e.target.closest('.btn,.theme,#rgbpick button')) audio.play('hover');
    });
  }

  hideLoading() {
    const l = $('loading');
    l.style.opacity = '0';
    setTimeout(() => l.remove(), 650);
  }

  setTheme(theme) {
    document.documentElement.style.setProperty('--a', theme.a);
    document.documentElement.style.setProperty('--b', theme.b);
  }

  // ------------------------------------------------------------------ title
  showTitle(save) {
    const t = $('title');
    const has = save.started;
    const rank = rankFor(save.xp);
    t.innerHTML = `
      <div class="inner">
        <img class="logo" src="${this.logoURL}" alt="Andromeda Insights">
        <div class="eyebrow">The PC Builder's Workshop</div>
        <h1>Andromeda<br>Assembly</h1>
        <p class="tag">Build it. Test it. Box it. Ship it.</p>
        <div class="menu">
          ${has ? `<button class="btn primary big" data-a="continue"><span>Continue — Day ${save.day}</span><span>▸</span></button>` : `<button class="btn primary big" data-a="new"><span>Start your first shift</span><span>▸</span></button>`}
          <button class="btn" data-a="workshop"><span>Workshop & upgrades</span><span>🛠</span></button>
          <button class="btn" data-a="howto"><span>How to play</span><span>?</span></button>
          <button class="btn" data-a="settings"><span>Settings</span><span>⚙</span></button>
          <button class="btn" data-a="credits"><span>Credits</span><span>★</span></button>
        </div>
        ${has ? `<div class="stats">Rank <b>${rank} · ${RANKS[rank - 1].name}</b><br>Wallet <b>${fmtMoney(save.money)}</b> · PCs shipped <b>${save.stats.orders}</b> · Perfect builds <b>${save.stats.perfect}</b></div>` : ''}
      </div>
      <div class="foot">© Andromeda Insights · Thank you for choosing a hand-built machine.</div>`;
    t.classList.remove('hidden');
    t.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      audio.init();
      audio.play('ui');
      this.g.menuAction(b.dataset.a);
    }));
  }
  hideTitle() {
    $('title').classList.add('hidden');
  }

  // ------------------------------------------------------------------ HUD
  showHud(on) {
    $('hud').classList.toggle('hidden', !on);
    $('flow').classList.toggle('hidden', !on);
    if (!on) {
      $('prompt').classList.add('hidden');
      $('ticket').classList.add('hidden');
      this.tooltip(null);
    }
  }
  hud({ day, order, orders, time, par, money, xp }) {
    $('dayval').textContent = 'Day ' + day;
    $('ordval').textContent = `${order}/${orders}`;
    $('timeval').textContent = fmtTime(time);
    $('parval').textContent = par ? 'PAR ' + fmtTime(par) : 'TRAINING';
    $('timer').classList.toggle('over', !!par && time > par);
    $('moneyval').textContent = fmtMoney(money);
    const r = rankFor(xp);
    $('ranklvl').textContent = 'Rank ' + r;
    $('rankname').textContent = RANKS[r - 1].name;
    const cur = RANKS[r - 1].xp, next = RANKS[r] ? RANKS[r].xp : cur + 1;
    $('xpfill').style.width = (r >= RANKS.length ? 100 : ((xp - cur) / (next - cur)) * 100) + '%';
  }
  flow(n, frac) {
    const f = $('flow');
    const el = $('flown');
    const txt = '×' + n;
    if (el.textContent !== txt) {
      el.textContent = txt;
      f.classList.remove('bump');
      void f.offsetWidth;
      f.classList.add('bump');
    }
    f.style.opacity = n > 1 ? 1 : 0.35;
    $('flowm').style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
  }

  // ------------------------------------------------------------------ ticket
  showTicket(order, par) {
    const t = $('ticket');
    const rows = ['mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu']
      .filter((c) => order.parts[c])
      .map((c) => `<tr data-cat="${c}"><td class="k">${CAT_LABEL[c]}</td><td class="v">${esc(PARTS[order.parts[c]].name)}</td><td class="s">·</td></tr>`)
      .join('');
    const rgb = order.rgb ? RGB_COLORS.find((x) => x.id === order.rgb) : null;
    const extras = ['Accessory kit', ...order.peripherals.map((p) => PERIPHERALS[p].name)];
    t.innerHTML = `
      <div class="hd"><img src="${this.markURL}" alt=""><b>ANDROMEDA INSIGHTS</b></div>
      <div class="spread"><span class="no">WORK ORDER ${order.no}</span></div>
      <div><span class="tier" style="background:${order.tierColor}">${order.tierName.toUpperCase()}</span>${order.rush ? '<span class="tier" style="background:#ef4444">RUSH ×1.5</span>' : ''}${order.vip ? '<span class="tier" style="background:#b45309">VIP</span>' : ''}${order.tutorial ? '<span class="tier" style="background:#64748b">TRAINING</span>' : ''}</div>
      <div style="margin-top:6px"><b>${esc(order.customerFull)}</b> · ${esc(order.city)}</div>
      <div class="note">“${esc(order.note)}”</div>
      <div class="sep"></div>
      <table>${rows}</table>
      <div class="sep"></div>
      <div class="extra">Chassis: <b>${esc(order.caseVariant.name)}</b><br>
      ${rgb ? `RGB: <b><span class="swatch" style="background:${rgb.hex || 'linear-gradient(90deg,#f43f5e,#facc15,#22d3ee,#8b5cf6)'}"></span>${rgb.name}</b><br>` : ''}
      In the box: <b>${extras.join(', ')}</b></div>
      <div class="sep"></div>
      <div class="foot"><span>${par ? 'PAR ' + fmtTime(par) : 'NO TIMER'}</span><span>PAY ${fmtMoney(order.pay)}${order.rush ? ' ×1.5' : ''}</span></div>`;
    t.classList.remove('hidden', 'collapsed');
    t.style.animation = 'none';
    void t.offsetWidth;
    t.style.animation = '';
  }
  ticketCollapse(on) {
    $('ticket').classList.toggle('collapsed', on);
  }
  ticketStatus(status) {
    const t = $('ticket');
    for (const [cat, st] of Object.entries(status)) {
      const tr = t.querySelector(`tr[data-cat="${cat}"]`);
      if (!tr) continue;
      const prev = tr.dataset.st;
      tr.className = st === 'ok' ? 'ok' : st === 'bad' ? 'bad' : '';
      tr.querySelector('.s').textContent = st === 'ok' ? '✓' : st === 'bad' ? '✗' : '·';
      if (prev !== st && st !== 'none') {
        tr.classList.add('flash');
        setTimeout(() => tr.classList.remove('flash'), 500);
      }
      tr.dataset.st = st;
    }
  }

  // ------------------------------------------------------------------ prompt, toast, tooltip
  prompt(text, warn) {
    const p = $('prompt');
    if (!text) {
      if (this.lastPrompt !== null) p.classList.add('hidden');
      this.lastPrompt = null;
      return;
    }
    const key = text + (warn ? '!' : '');
    if (key === this.lastPrompt) return;
    this.lastPrompt = key;
    p.classList.remove('hidden');
    p.classList.toggle('warn', !!warn);
    $('prompttxt').innerHTML = esc(text) + ' <span class="kbd">H</span>';
  }
  toast(msg, kind = '') {
    const box = $('toasts');
    // avoid stacking duplicates
    for (const el of box.children) if (el.textContent === msg) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2600);
  }
  tooltip(d, x, y) {
    const t = $('tooltip');
    if (!d) {
      t.classList.add('hidden');
      return;
    }
    t.innerHTML = `<div class="c" style="color:${d.color}">${esc(d.cat)}</div><div class="t">${esc(d.title)}</div><div class="s">${esc(d.sub)}</div>`;
    t.classList.remove('hidden');
    const w = t.offsetWidth, h = t.offsetHeight;
    let lx = x + 18, ly = y + 18;
    if (lx + w > innerWidth - 8) lx = x - w - 14;
    if (ly + h > innerHeight - 8) ly = y - h - 14;
    t.style.left = lx + 'px';
    t.style.top = ly + 'px';
  }

  // ------------------------------------------------------------------ RGB picker
  pickRgb(want, onPick) {
    return new Promise((resolve) => {
      const p = $('rgbpick');
      p.innerHTML = `<div class="ttl">Customer asked for <b style="color:${want.hex || '#fff'}">${want.name}</b> lighting — pick the RGB profile</div><div class="sw">${RGB_COLORS.map((c) => `<button data-id="${c.id}" style="background:${c.hex || 'linear-gradient(135deg,#f43f5e,#facc15,#22d3ee,#8b5cf6)'}"><span>${c.name}</span></button>`).join('')}</div><div style="height:16px"></div>`;
      p.classList.remove('hidden');
      p.querySelectorAll('button').forEach((b) => (b.onclick = () => {
        const c = RGB_COLORS.find((x) => x.id === b.dataset.id);
        onPick(c);
        if (c.id === want.id) {
          p.classList.add('hidden');
          resolve(true);
        } else {
          audio.play('error');
          this.toast(`That's ${c.name} — the ticket says ${want.name}`, 'warn');
          p.classList.remove('wrong');
          void p.offsetWidth;
          p.classList.add('wrong');
        }
      }));
    });
  }

  // ------------------------------------------------------------------ modals
  open(html, cls = '') {
    this.modal.innerHTML = `<div class="overlay ${cls}"><div class="card">${html}</div></div>`;
    const root = this.modal.firstChild;
    root.querySelectorAll('.btn').forEach((b) => b.addEventListener('click', () => audio.play('ui')));
    return root;
  }
  close() {
    this.modal.innerHTML = '';
    this.onKey = null;
  }
  get isOpen() {
    return !!this.modal.firstChild;
  }

  results(r) {
    return new Promise((resolve) => {
      const rows = r.rows.map((x) => `<tr class="${x.cls || ''}"><td>${esc(x.label)}</td><td>${esc(x.value)}</td></tr>`).join('');
      const root = this.open(`
        <div class="eyebrow">Order ${esc(r.no)} shipped to ${esc(r.city)}</div>
        <h2>${esc(r.headline)}</h2>
        <div class="stars"><span>★</span><span>★</span><span>★</span></div>
        <p class="sub" style="text-align:center">Build time <b>${fmtTime(r.time)}</b>${r.par ? ` · par ${fmtTime(r.par)}` : ''} · best flow <b>×${r.maxCombo}</b></p>
        <table class="breakdown">${rows}</table>
        <div class="total"><span class="eyebrow">Payout</span><span class="amt" id="payamt">$0</span></div>
        <div class="xpline">+${r.xp} XP  ·  ${esc(r.rankName)}<div class="xpbar" style="margin-top:6px"><i id="resxp" style="width:${r.xpFrom}%"></i></div></div>
        <div class="row" style="justify-content:flex-end;margin-top:20px"><button class="btn primary big" id="resnext">${esc(r.nextLabel)} <span class="kbd" style="margin-left:8px">Space</span></button></div>`, 'clear');
      const stars = root.querySelectorAll('.stars span');
      const trs = root.querySelectorAll('.breakdown tr');
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.close();
        resolve();
      };
      root.querySelector('#resnext').onclick = finish;
      this.onKey = (e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          finish();
        }
      };
      // staged reveal
      let t = 250;
      for (let i = 0; i < r.stars; i++) {
        setTimeout(() => {
          stars[i].classList.add('on');
          audio.play('star', { i });
        }, t);
        t += 280;
      }
      trs.forEach((tr, i) => setTimeout(() => {
        tr.classList.add('in');
        audio.play('tick', { pitch: 1 + i * 0.05 });
      }, t + i * 110));
      t += trs.length * 110 + 100;
      setTimeout(() => {
        const el = root.querySelector('#payamt');
        if (!el) return;
        const start = performance.now(), dur = 900;
        const step = () => {
          const k = Math.min(1, (performance.now() - start) / dur);
          const e = 1 - Math.pow(1 - k, 3);
          el.textContent = fmtMoney(r.total * e);
          if (Math.random() < 0.5 && k < 1) audio.play('coin', { pitch: 0.8 + k * 0.6 });
          if (k < 1 && document.body.contains(el)) requestAnimationFrame(step);
          else audio.play('cash');
        };
        step();
        const xp = root.querySelector('#resxp');
        if (xp) setTimeout(() => (xp.style.width = r.xpTo + '%'), 50);
      }, t);
    });
  }

  dayEnd(s) {
    return new Promise((resolve) => {
      const root = this.open(`
        <div class="eyebrow">Shift complete</div>
        <h2>Day ${s.day} — ${esc(s.headline)}</h2>
        <p class="sub">The trucks are loaded and the workshop lights dim. Here's how your shift went.</p>
        <div class="statgrid">
          <div><b>${s.orders}</b><span>PCs shipped</span></div>
          <div><b>${s.stars}<small style="font-size:14px;color:var(--muted)">/${s.orders * 3}</small></b><span>Stars</span></div>
          <div><b style="color:var(--gold)">${fmtMoney(s.earned)}</b><span>Earned</span></div>
          <div><b>${s.best ? fmtTime(s.best) : '—'}</b><span>Best build</span></div>
        </div>
        <p class="sub">Wallet: <b style="color:var(--gold)">${fmtMoney(s.money)}</b> — spend it on upgrades in the workshop to build faster and earn more.</p>
        <div class="row" style="justify-content:flex-end">
          <button class="btn" data-a="menu">Main menu</button>
          <button class="btn" data-a="workshop">🛠 Workshop</button>
          <button class="btn primary big" data-a="next">Start Day ${s.day + 1} ▸</button>
        </div>`);
      root.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
        this.close();
        resolve(b.dataset.a);
      }));
    });
  }

  workshop(save, onBuy, onTheme) {
    return new Promise((resolve) => {
      const render = () => {
        const ups = UPGRADES.map((u) => {
          const own = !!save.upgrades[u.id];
          return `<div class="item ${own ? 'owned' : ''}"><div class="ic">${u.icon}</div><div class="nm">${esc(u.name)}</div><div class="ds">${esc(u.desc)}</div>
            ${own ? '<button class="btn small" disabled>Owned ✓</button>' : `<button class="btn small ${save.money >= u.price ? 'primary' : ''}" data-buy="${u.id}" ${save.money >= u.price ? '' : 'disabled'}>Buy · ${fmtMoney(u.price)}</button>`}</div>`;
        }).join('');
        const th = THEMES.map((t) => {
          const own = !!save.themes[t.id];
          return `<button class="theme ${save.theme === t.id ? 'sel' : ''}" data-theme="${t.id}"><i style="background:linear-gradient(135deg,${t.a},${t.b})"></i>${esc(t.name)} ${own ? '' : `<small>${fmtMoney(t.price)}</small>`}</button>`;
        }).join('');
        const root = this.open(`
          <div class="spread"><div><div class="eyebrow">Workshop</div><h2>Upgrades & style</h2></div><div style="text-align:right"><div class="eyebrow" style="color:var(--muted)">Wallet</div><div style="font-size:28px;font-weight:850;color:var(--gold)">${fmtMoney(save.money)}</div></div></div>
          <p class="sub">Tools make every build faster — faster builds beat par, and beating par pays.</p>
          <div class="shopgrid">${ups}</div>
          <div class="eyebrow" style="margin:6px 0 10px">Workshop lighting</div>
          <div class="themes">${th}</div>
          <div class="row" style="justify-content:flex-end;margin-top:20px"><button class="btn primary" data-close>Back to work ▸</button></div>`, 'shop');
        root.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => {
          if (onBuy(b.dataset.buy)) render();
        }));
        root.querySelectorAll('[data-theme]').forEach((b) => (b.onclick = () => {
          audio.play('ui');
          if (onTheme(b.dataset.theme)) render();
        }));
        root.querySelector('[data-close]').onclick = () => {
          this.close();
          resolve();
        };
      };
      render();
    });
  }

  settings(save, onChange, onReset) {
    return new Promise((resolve) => {
      const s = save.settings;
      const root = this.open(`
        <div class="eyebrow">Settings</div><h2>Make it yours</h2>
        <div class="set"><label>Master volume</label><input type="range" min="0" max="1" step="0.01" data-k="master" value="${s.master}"><span>${Math.round(s.master * 100)}</span></div>
        <div class="set"><label>Music</label><input type="range" min="0" max="1" step="0.01" data-k="music" value="${s.music}"><span>${Math.round(s.music * 100)}</span></div>
        <div class="set"><label>Sound effects</label><input type="range" min="0" max="1" step="0.01" data-k="sfx" value="${s.sfx}"><span>${Math.round(s.sfx * 100)}</span></div>
        <div class="set"><label>Graphics</label><select data-k="quality"><option value="high">High — bloom, soft shadows</option><option value="medium">Medium — shadows</option><option value="low">Low — fastest</option></select><span></span></div>
        <div class="set"><label>Hint arrows</label><input type="checkbox" class="toggle" data-k="hints" ${s.hints ? 'checked' : ''}><span></span></div>
        <div class="set"><label>Display</label><button class="btn small" data-fs>Toggle fullscreen <span class="kbd">F</span></button><span></span></div>
        <div class="row" style="justify-content:space-between;margin-top:22px"><button class="btn small" data-reset style="color:#fca5a5">Reset all progress…</button><button class="btn primary" data-close>Done</button></div>`);
      root.querySelector('select').value = s.quality;
      root.querySelectorAll('[data-k]').forEach((el) => {
        el.oninput = el.onchange = () => {
          const k = el.dataset.k;
          let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
          s[k] = v;
          if (el.type === 'range') el.nextElementSibling.textContent = Math.round(v * 100);
          onChange(k, v);
        };
      });
      root.querySelector('[data-fs]').onclick = () => this.g.toggleFullscreen();
      root.querySelector('[data-reset]').onclick = async () => {
        if (await this.confirm('Reset everything?', 'Your rank, money, upgrades and stats will be wiped. This cannot be undone.')) {
          onReset();
          resolve();
        } else this.settings(save, onChange, onReset).then(resolve);
      };
      root.querySelector('[data-close]').onclick = () => {
        this.close();
        resolve();
      };
    });
  }

  confirm(title, text) {
    return new Promise((resolve) => {
      const root = this.open(`<h2>${esc(title)}</h2><p class="sub">${esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-n>Cancel</button><button class="btn primary" data-y>Yes, do it</button></div>`);
      root.querySelector('[data-n]').onclick = () => {
        this.close();
        resolve(false);
      };
      root.querySelector('[data-y]').onclick = () => {
        this.close();
        resolve(true);
      };
    });
  }

  howto() {
    return new Promise((resolve) => {
      const root = this.open(`
        <div class="eyebrow">How to play</div><h2>A day at the bench</h2>
        <div class="howto"><ol>
          <li><b>Read the work order</b> on the left. It lists exactly which parts the customer paid for — the rack also holds look-alikes, so check names!</li>
          <li><b>Drag parts</b> from the rack into the glowing outlines in the case. Prefer clicking? Click a part to pick it up and click again to drop it.</li>
          <li><b>Click</b> the glowing markers: screws, the CPU socket lever and the power-cable ports.</li>
          <li><b>Close the glass panel</b> and press the <b>power button</b>. QA checks every part against the ticket — wrong parts mean opening the case again.</li>
          <li><b>Pack it:</b> drag the PC into the box, add the foam and accessories, fold the flaps, drag the tape along the seam, stick on the label and hit <b>SHIP</b>.</li>
          <li><b>Chain actions quickly</b> to build up <b>Flow</b>, beat par time for bonuses, earn stars, rank up and buy upgrades in the workshop.</li>
        </ol>
        <div class="keys"><span class="kbd">H</span><span>Show a hint arrow for the next step</span><span class="kbd">Esc</span><span>Pause</span><span class="kbd">M</span><span>Mute / unmute</span><span class="kbd">F</span><span>Fullscreen</span><span class="kbd">Right-drag</span><span>Look around · mouse wheel to zoom</span></div></div>
        <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn primary" data-close>Got it</button></div>`);
      root.querySelector('[data-close]').onclick = () => {
        this.close();
        resolve();
      };
    });
  }

  pauseMenu() {
    return new Promise((resolve) => {
      const root = this.open(`<div class="eyebrow">Paused</div><h2>Coffee break ☕</h2><p class="sub">The timer is stopped. Take your time.</p>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:280px">
          <button class="btn primary" data-a="resume">Resume <span class="kbd">Esc</span></button>
          <button class="btn" data-a="howto">How to play</button>
          <button class="btn" data-a="settings">Settings</button>
          <button class="btn" data-a="menu">Quit to menu <span style="color:var(--muted);font-weight:500">(this order restarts)</span></button>
        </div>`);
      root.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
        this.close();
        resolve(b.dataset.a);
      }));
      this.onKey = (e) => {
        if (e.code === 'Escape') {
          e.preventDefault();
          this.close();
          resolve('resume');
        }
      };
    });
  }

  rankUp(rank) {
    return new Promise((resolve) => {
      const r = RANKS[rank - 1];
      const root = this.open(`<div style="text-align:center"><div class="eyebrow">Promotion</div>
        <img src="${this.markURL}" style="width:120px;height:120px;margin:10px auto;display:block;filter:drop-shadow(0 0 30px var(--a))" alt="">
        <h2>Rank ${rank}: ${esc(r.name)}</h2><p class="sub">Unlocked: <b style="color:var(--text)">${esc(r.unlock)}</b></p>
        <button class="btn primary big" data-close>Let's go!</button></div>`);
      root.querySelector('[data-close]').onclick = () => {
        this.close();
        resolve();
      };
    });
  }

  certificate(save) {
    return new Promise((resolve) => {
      const root = this.open(`<div class="cert">
        <img src="${this.logoURL}" style="width:300px" alt="Andromeda Insights">
        <div class="eyebrow" style="color:#fde68a;margin-top:10px">Certificate of Mastery</div>
        <h3>Galactic Master Builder</h3>
        <p class="sub" style="color:#ddd6fe">For ${save.stats.orders} hand-built machines, ${save.stats.perfect} perfect builds and countless satisfying clicks.<br>The whole Andromeda Insights crew salutes you.</p>
        <p style="font-family:Georgia,serif;font-style:italic;color:#c4b5fd">— The Workshop</p></div>
        <p class="sub" style="text-align:center;margin-top:16px">Your career is complete, but the orders keep coming. Endless shifts await!</p>
        <div class="row" style="justify-content:center"><button class="btn" data-c>Roll credits</button><button class="btn primary" data-close>Keep building ▸</button></div>`);
      root.querySelector('[data-close]').onclick = () => {
        this.close();
        resolve();
      };
      root.querySelector('[data-c]').onclick = () => this.credits().then(resolve);
    });
  }

  credits() {
    return new Promise((resolve) => {
      const root = this.open(`<div class="credits" style="text-align:center">
        <img src="${this.logoURL}" style="width:320px" alt="Andromeda Insights">
        <h2 style="margin-top:10px">Andromeda Assembly</h2>
        <p>A little game about the care that goes into every machine.<br>Bundled with your Andromeda Insights PC.</p>
        <p class="sub">Every model, texture, sound effect and song in this game is generated live by your new computer — no downloads, no internet, just your hardware flexing.</p>
        <p><b>Thank you for choosing Andromeda Insights.</b><br>Somewhere, a builder clicked your RAM into place with the same satisfaction you just felt.</p>
        <button class="btn primary" data-close>Close</button></div>`);
      root.querySelector('[data-close]').onclick = () => {
        this.close();
        resolve();
      };
    });
  }
}

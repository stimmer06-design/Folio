import { PARTS, CAT_LABEL, RANKS, UPGRADES, THEMES, RGB_COLORS, PERIPHERALS, DECOR, RARITY, OVERDRIVE, rankFor } from './catalog.js';
import { CHARACTERS, CODEX, chapterFor } from './story.js';
import { fmtTime } from './util.js';
import { audio } from './audio.js';
import { logoCanvas, drawGalaxy, canvas } from './textures.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const cr = (n) => '◈ ' + Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------- portraits
function portrait(who) {
  const ch = CHARACTERS[who];
  const [c, ctx] = canvas(160, 160);
  const g = ctx.createLinearGradient(0, 0, 160, 160);
  g.addColorStop(0, '#0b1020');
  g.addColorStop(1, '#05060c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 160, 160);
  const col = ch.color;
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  if (ch.glyph === 'eye') {
    ctx.lineWidth = 2;
    for (let r = 64; r > 20; r -= 14) {
      ctx.globalAlpha = 0.25 + (64 - r) / 90;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        ctx.lineTo(80 + Math.cos(a) * r, 80 + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const rg = ctx.createRadialGradient(80, 80, 0, 80, 80, 26);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.3, col);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(80, 80, 26, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#05060c';
    ctx.beginPath();
    ctx.arc(80, 80, 6, 0, 7);
    ctx.fill();
  } else if (ch.glyph === 'signal') {
    drawGalaxy(ctx, 80, 80, 70, { colA: '#fde68a', colB: '#f59e0b', dots: 500, tilt: 0.5 });
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < 160; x += 2) ctx.lineTo(x, 130 + Math.sin(x * 0.2) * 8 * Math.sin(x * 0.03));
    ctx.stroke();
  } else {
    // stylised bust
    const grd = ctx.createLinearGradient(0, 30, 0, 160);
    grd.addColorStop(0, col);
    grd.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = grd;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(80, 68, 26, 32, 0, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26, 160);
    ctx.quadraticCurveTo(30, 108, 80, 104);
    ctx.quadraticCurveTo(130, 108, 134, 160);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(5,6,12,0.55)';
    ctx.fillRect(58, 62, 44, 6); // visor
    if (ch.glyph === 'face2') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(80, 66, 34, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(112, 74);
      ctx.quadraticCurveTo(110, 96, 92, 98);
      ctx.stroke();
    }
    if (ch.glyph === 'archive') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let y = 0; y < 160; y += 4) ctx.fillRect(0, y, 160, 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(20 + Math.random() * 40, 40, 70, 3);
      ctx.globalAlpha = 1;
    }
  }
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 157, 157);
  return c.toDataURL();
}

export class UI {
  constructor(game) {
    this.g = game;
    this.logoURL = logoCanvas(1024, 256).toDataURL();
    const [mc, mctx] = canvas(128, 128);
    drawGalaxy(mctx, 64, 64, 60, { dots: 400 });
    this.markURL = mc.toDataURL();
    this.portraits = {};
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
    document.addEventListener('pointerover', (e) => {
      if (e.target.closest && e.target.closest('.btn,.theme,#rgbpick button,.ent')) audio.play('hover');
    });
  }
  portrait(who) {
    if (!this.portraits[who]) this.portraits[who] = portrait(who);
    return this.portraits[who];
  }

  hideLoading() {
    const l = $('loading');
    if (!l) return;
    l.style.opacity = '0';
    setTimeout(() => l.remove(), 750);
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
    const ch = chapterFor(rank);
    t.innerHTML = `
      <div class="inner">
        <img class="logo" src="${this.logoURL}" alt="Andromeda Insights">
        <h1>Andromeda<br>Assembly</h1>
        ${has ? `<div class="chap">CHAPTER ${ch.n} · ${esc(ch.title.toUpperCase())}</div>` : ''}
        <p class="tag">Year 2291. Aboard <b>Forge-7</b>, high above Titan, every machine is still built by hand. Build it. Test it. Launch it. <b>Something out there is listening.</b></p>
        <div class="menu">
          ${has ? `<button class="btn primary big" data-a="continue"><span>Continue · Day ${save.day}</span><span>▸</span></button>` : `<button class="btn primary big" data-a="new"><span>Begin your first shift</span><span>▸</span></button>`}
          <button class="btn" data-a="workshop"><span>Workshop</span><span>⚙</span></button>
          <button class="btn" data-a="codex"><span>Codex</span><span>❖</span></button>
          <button class="btn" data-a="howto"><span>How to play</span><span>?</span></button>
          <button class="btn" data-a="settings"><span>Settings</span><span>≡</span></button>
          <button class="btn" data-a="credits"><span>Credits</span><span>★</span></button>
        </div>
        ${has ? `<div class="stats"><div><b>${rank}</b>Rank</div><div><b>${cr(save.money)}</b>Credits</div><div><b>${save.stats.orders}</b>Shipped</div><div><b>${Math.floor(save.signal || 0)}%</b>Signal</div></div>` : ''}
      </div>
      <div class="foot">ANDROMEDA INSIGHTS · FORGE-7 ORBITAL FOUNDRY · THANK YOU FOR CHOOSING A HAND-BUILT MACHINE</div>`;
    t.classList.remove('hidden');
    t.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      audio.init();
      audio.play('ui');
      this.g.menuAction(b.dataset.a);
    }));
  }
  // first-launch splash: the click unlocks audio so the soundtrack starts with the title
  splash() {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.id = 'splash';
      el.innerHTML = `<img src="${this.logoURL}" alt="Andromeda Insights"><div class="sp-t">FORGE-7 · TITAN ORBIT · 2291</div><div class="sp-c">Click anywhere to dock</div>`;
      document.getElementById('ui').appendChild(el);
      const go = () => {
        el.removeEventListener('pointerdown', go);
        removeEventListener('keydown', go);
        audio.init();
        audio.play('transmission');
        audio.play('whoosh');
        el.classList.add('out');
        setTimeout(() => el.remove(), 900);
        resolve();
      };
      el.addEventListener('pointerdown', go);
      addEventListener('keydown', go);
    });
  }
  hideTitle() {
    $('title').classList.add('hidden');
  }

  // ------------------------------------------------------------------ HUD
  showHud(on) {
    for (const id of ['hud', 'od', 'contracts']) $(id).classList.toggle('hidden', !on);
    if (!on) {
      $('prompt').classList.add('hidden');
      $('ticket').classList.add('hidden');
      this.gauge(null);
      this.tooltip(null);
    }
  }
  hud({ day, order, orders, time, par, money, xp, signal, chapter }) {
    $('chaplbl').textContent = 'Chapter ' + chapter.n;
    $('chapval').textContent = chapter.title;
    $('dayval').textContent = 'Day ' + day;
    $('ordval').textContent = `${order}/${orders}`;
    $('timeval').textContent = fmtTime(time);
    $('parval').textContent = par ? 'PAR ' + fmtTime(par) : 'TRAINING';
    $('parfill').style.width = par ? Math.min(100, (time / par) * 100) + '%' : '0%';
    $('timer').classList.toggle('over', !!par && time > par);
    $('moneyval').textContent = cr(money);
    const r = rankFor(xp);
    $('ranklvl').textContent = 'Rank ' + r;
    $('rankname').textContent = RANKS[r - 1].name;
    const cur = RANKS[r - 1].xp, next = RANKS[r] ? RANKS[r].xp : cur + 1;
    $('xpfill').style.width = (r >= RANKS.length ? 100 : ((xp - cur) / (next - cur)) * 100) + '%';
    const showSig = r >= 3 || signal > 0;
    $('sigbar').classList.toggle('hidden', !showSig);
    if (showSig) {
      $('siglbl').textContent = `Signal decoded ${signal.toFixed(1)}%`;
      $('sigfill').style.width = signal + '%';
    }
  }
  overdrive(combo, tier, frac, win) {
    const od = $('od');
    const el = $('odn');
    const txt = '×' + combo;
    if (el.textContent !== txt) {
      el.textContent = txt;
      od.classList.remove('bump');
      void od.offsetWidth;
      od.classList.add('bump');
    }
    const t = OVERDRIVE[tier];
    od.style.setProperty('--odc', t.color || 'var(--b)');
    $('odtier').textContent = t.name || '';
    $('odm').style.width = Math.min(1, frac) * 100 + '%';
    $('odwin').style.width = Math.max(0, Math.min(1, win)) * 100 + '%';
    od.style.opacity = combo > 0 ? 1 : 0.45;
  }
  odBanner(tier) {
    const b = $('odbanner');
    const t = OVERDRIVE[tier];
    b.textContent = t.name;
    b.style.setProperty('--odc', t.color);
    b.classList.remove('go');
    void b.offsetWidth;
    b.classList.add('go');
  }
  contracts(list) {
    const el = $('contracts');
    if (!list || !list.length) {
      el.classList.add('hidden');
      return;
    }
    el.innerHTML = `<div class="hd">DAILY CONTRACTS</div>` + list.map((c) => `<div class="c ${c.done ? 'done' : ''}"><span class="pr">${c.done ? '✓' : `${c.progress}/${c.n}`}</span>${esc(c.text)}<div class="bar"><i style="width:${(c.progress / c.n) * 100}%"></i></div></div>`).join('');
  }

  // ------------------------------------------------------------------ work order
  showTicket(order, par) {
    const t = $('ticket');
    const rows = ['mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu']
      .filter((c) => order.parts[c])
      .map((c) => `<tr data-cat="${c}"><td class="k">${CAT_LABEL[c]}</td><td class="v">${esc(PARTS[order.parts[c]].name)}</td><td class="s">·</td></tr>`)
      .join('');
    const rgb = order.rgb ? RGB_COLORS.find((x) => x.id === order.rgb) : null;
    const extras = ['Accessory kit', ...order.peripherals.map((p) => PERIPHERALS[p].name)];
    t.innerHTML = `
      <div class="hd"><img src="${this.markURL}" alt=""><b>WORK ORDER</b></div>
      <div class="no">${order.no}</div>
      <div><span class="tier" style="background:${order.tierColor}">${order.tierName.toUpperCase()}</span>${order.rush ? '<span class="tier" style="background:#f87171">RUSH ×1.5</span>' : ''}${order.vip ? '<span class="tier" style="background:#f59e0b">VIP</span>' : ''}${order.tutorial ? '<span class="tier" style="background:#94a3b8">TRAINING</span>' : ''}</div>
      <div class="who"><b>${esc(order.customerFull)}</b><br><span style="color:var(--muted)">${esc(order.city)}</span></div>
      <div class="note">“${esc(order.note)}”</div>
      <table>${rows}</table>
      <div class="sep"></div>
      <div class="extra">Chassis <b>${esc(order.caseVariant.name)}</b><br>
      ${rgb ? `RGB <b><span class="swatch" style="background:${rgb.hex || 'linear-gradient(90deg,#f43f5e,#facc15,#22d3ee,#8b5cf6)'}"></span>${rgb.name}</b><br>` : ''}
      In the box <b>${extras.join(', ')}</b></div>
      <div class="sep"></div>
      <div class="foot"><span>${par ? 'PAR ' + fmtTime(par) : 'NO TIMER'}</span><span class="pay">${cr(order.pay)}${order.rush ? ' ×1.5' : ''}</span></div>`;
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

  // ------------------------------------------------------------------ prompt, toast, tooltip, gauge
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
    for (const el of box.children) if (el.textContent === msg) return;
    const el = document.createElement('div');
    el.className = 'toast panel ' + kind;
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3000);
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
  gauge(d) {
    const el = $('gauge');
    if (!d) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.style.left = d.x + 'px';
    el.style.top = d.y + 'px';
    const R = 54, C = 2 * Math.PI * R, SPAN = 0.75; // 270° arc
    const arc = (a, b, col, w) => `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${col}" stroke-width="${w}" stroke-dasharray="${(b - a) * C * SPAN} ${C}" stroke-dashoffset="${-a * C * SPAN}" transform="rotate(135 70 70)"/>`;
    const v = Math.min(1.25, d.v);
    const vv = Math.min(1, v);
    const z = d.zones;
    const ang = (135 + vv * 270) * (Math.PI / 180);
    const nx = 70 + Math.cos(ang) * (R + 2), ny = 70 + Math.sin(ang) * (R + 2);
    const over = v > z.green[1];
    el.innerHTML = `<svg width="140" height="140" viewBox="0 0 140 140" style="filter:drop-shadow(0 0 8px rgba(0,0,0,.8))">
      ${arc(0, 1, 'rgba(255,255,255,0.12)', 10)}
      ${arc(z.green[0], z.green[1], 'rgba(74,222,128,0.65)', 10)}
      ${arc(z.perfect[0], z.perfect[1], '#facc15', 12)}
      ${arc(0, vv, over ? '#f87171' : '#a5f3fc', 4)}
      <circle cx="${nx}" cy="${ny}" r="7" fill="#fff" stroke="${over ? '#f87171' : '#22d3ee'}" stroke-width="3"/>
      </svg><div class="lb">${esc(d.label)}</div>`;
  }

  // ------------------------------------------------------------------ RGB picker
  pickRgb(want, onPick) {
    return new Promise((resolve) => {
      const p = $('rgbpick');
      p.innerHTML = `<div class="ttl">Customer requested <b style="color:${want.hex || '#fff'}">${want.name}</b> lighting — set the RGB profile</div><div class="sw">${RGB_COLORS.map((c) => `<button data-id="${c.id}" title="${c.name}" style="background:${c.hex || 'linear-gradient(135deg,#f43f5e,#facc15,#22d3ee,#8b5cf6)'}"></button>`).join('')}</div>`;
      p.classList.remove('hidden');
      p.querySelectorAll('button').forEach((b) => (b.onclick = () => {
        const c = RGB_COLORS.find((x) => x.id === b.dataset.id);
        onPick(c);
        if (c.id === want.id) {
          p.classList.add('hidden');
          resolve(true);
        } else {
          audio.play('error');
          this.toast(`That's ${c.name} — the order says ${want.name}`, 'warn');
          p.classList.remove('wrong');
          void p.offsetWidth;
          p.classList.add('wrong');
        }
      }));
    });
  }

  // ------------------------------------------------------------------ transmissions
  transmission(lines) {
    return new Promise((resolve) => {
      const box = $('tx'), dim = $('txdim');
      box.classList.remove('hidden', 'bark');
      dim.classList.remove('hidden');
      let i = 0, typing = null, full = '';
      const finish = () => {
        box.classList.add('hidden');
        dim.classList.add('hidden');
        this.txKey = null;
        resolve();
      };
      const show = () => {
        const L = lines[i];
        const ch = CHARACTERS[L.who];
        full = L.text;
        box.innerHTML = `<img src="${this.portrait(L.who)}" alt=""><div style="flex:1"><div class="nm" style="color:${ch.color}">${esc(ch.name)}</div><div class="rl">${esc(ch.role)}</div><div class="msg"></div></div><div class="more">${i < lines.length - 1 ? 'CLICK ▸' : 'CLICK ✓'}</div>`;
        const msg = box.querySelector('.msg');
        audio.play(L.who === 'whisper' ? 'whisper' : 'transmission');
        let n = 0;
        clearInterval(typing);
        typing = setInterval(() => {
          n += L.who === 'whisper' ? 1 : 2;
          msg.textContent = full.slice(0, n);
          if (n % 4 === 0) audio.play('blip', { f: L.who === 'orin' ? 1200 : L.who === 'whisper' ? 300 : 800 });
          if (n >= full.length) clearInterval(typing);
        }, L.who === 'whisper' ? 55 : 18);
      };
      const next = () => {
        const msg = box.querySelector('.msg');
        if (msg && msg.textContent.length < full.length) {
          clearInterval(typing);
          msg.textContent = full;
          return;
        }
        i++;
        if (i >= lines.length) {
          clearInterval(typing);
          finish();
        } else show();
      };
      box.onclick = next;
      dim.onclick = next;
      this.txKey = (e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          next();
        } else if (e.code === 'Escape') {
          clearInterval(typing);
          finish();
        }
      };
      show();
    });
  }
  bark(who, text) {
    const box = $('tx');
    if (!box.classList.contains('hidden') && !box.classList.contains('bark')) return; // a cinematic is playing
    const ch = CHARACTERS[who];
    box.classList.remove('hidden');
    box.classList.add('bark');
    box.innerHTML = `<img src="${this.portrait(who)}" alt=""><div style="flex:1"><div class="nm" style="color:${ch.color}">${esc(ch.name)}</div><div class="msg">${esc(text)}</div></div>`;
    audio.play('blip', { f: 1000 });
    clearTimeout(this.barkT);
    this.barkT = setTimeout(() => {
      if (box.classList.contains('bark')) box.classList.add('hidden');
    }, 3600);
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
        <div class="eyebrow">Order ${esc(r.no)} · launched to ${esc(r.city)}</div>
        <div class="res" style="margin-top:12px">
          <div><div class="grade" id="gradeL" style="color:${r.grade.color};text-shadow:0 0 50px ${r.grade.color}">${r.grade.id}</div><div class="gname" style="color:${r.grade.color}">${esc(r.grade.name.toUpperCase())}</div>
            <div class="miniStats" style="justify-content:center;margin-top:16px;flex-direction:column;gap:4px;text-align:center">
              <span><b>${Math.round(r.quality * 100)}%</b> QUALITY</span><span><b>${r.perfects}</b> PERFECTS</span><span><b>×${r.maxCombo}</b> BEST FLOW</span></div></div>
          <div>
            <div class="miniStats"><span>TIME <b>${fmtTime(r.time)}</b></span>${r.par ? `<span>PAR <b>${fmtTime(r.par)}</b></span>` : ''}${r.bench ? `<span>ANDROMARK <b>${r.bench.toLocaleString('en-US')}</b></span>` : ''}</div>
            <table class="breakdown">${rows}</table>
            <div class="total"><span class="eyebrow">Payout</span><span class="amt" id="payamt">◈ 0</span></div>
            <div class="meters"><div>+${r.xp} XP${r.xpBoost ? ' (2× chip)' : ''} · ${esc(r.rankName)}<div class="xpbar"><i id="resxp" style="width:${r.xpFrom}%"></i></div></div>
              ${r.signalGain ? `<div class="sig">Signal decoded +${r.signalGain.toFixed(1)}% → ${r.signal.toFixed(1)}%<div class="xpbar"><i id="ressig" style="width:${r.signal - r.signalGain}%"></i></div></div>` : '<div></div>'}</div>
            <div class="review" id="review"><span class="st">${'★'.repeat(r.reviewStars)}${'☆'.repeat(5 - r.reviewStars)}</span> &nbsp;“${esc(r.review)}” <span style="color:var(--muted)">— ${esc(r.customer)}</span></div>
          </div>
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn primary big" id="resnext">Open supply crate ▸ <span class="kbd" style="margin-left:6px">Space</span></button></div>`, 'clear');
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
      setTimeout(() => {
        const gl = root.querySelector('#gradeL');
        if (!gl) return;
        gl.classList.add('slam');
        audio.play('grade', { g: r.grade.id });
        this.g.fx.shake(0.15);
        this.g.post.pulse(r.grade.color, 0.25);
      }, 250);
      let t = 750;
      trs.forEach((tr, i) => setTimeout(() => {
        tr.classList.add('in');
        audio.play('tick', { pitch: 1 + i * 0.06 });
      }, t + i * 120));
      t += trs.length * 120 + 100;
      setTimeout(() => {
        const el = root.querySelector('#payamt');
        if (!el) return;
        const start = performance.now(), dur = 1000;
        const step = () => {
          const k = Math.min(1, (performance.now() - start) / dur);
          const e = 1 - Math.pow(1 - k, 3);
          el.textContent = cr(r.total * e);
          if (Math.random() < 0.5 && k < 1) audio.play('coin', { pitch: 0.8 + k * 0.6 });
          if (k < 1 && document.body.contains(el)) requestAnimationFrame(step);
          else audio.play('cash');
        };
        step();
        const xp = root.querySelector('#resxp');
        if (xp) setTimeout(() => (xp.style.width = r.xpTo + '%'), 50);
        const sg = root.querySelector('#ressig');
        if (sg) setTimeout(() => (sg.style.width = r.signal + '%'), 300);
        setTimeout(() => {
          const rv = root.querySelector('#review');
          if (rv) rv.classList.add('in');
        }, 900);
      }, t);
    });
  }

  crate(rarity, reward) {
    return new Promise((resolve) => {
      const R = RARITY[rarity];
      const root = this.open(`<div class="crateWrap" style="--rc:${R.color}"><div class="eyebrow" style="color:${R.color}">${R.name} supply crate</div>
        <div style="position:relative"><div class="rays" id="rays"></div><div class="crate shake" id="crate"><div class="box"></div></div></div>
        <div id="lootSlot" style="min-height:40px;color:var(--muted)">Click the crate to open it</div>
        <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary" id="cnext" style="visibility:hidden">Continue ▸</button></div></div>`, 'clear');
      const crateEl = root.querySelector('#crate');
      let opened = false, done = false;
      audio.play('crate');
      const shakeT = setInterval(() => audio.play('crate'), 520);
      const open = () => {
        if (opened) return;
        opened = true;
        clearInterval(shakeT);
        crateEl.classList.remove('shake');
        crateEl.classList.add('open');
        root.querySelector('#rays').classList.add('on');
        audio.play('reveal', { r: rarity });
        this.g.post.pulse(R.color, rarity === 'legendary' ? 0.5 : 0.25);
        if (rarity === 'epic' || rarity === 'legendary') this.g.fx.confetti(this.g.camLook.clone().setY(this.g.camLook.y + 3), 160);
        const icon = { money: '◈', decor: '✦', theme: '◐', lore: '❖', xpboost: '⚡' }[reward.kind] || '◈';
        setTimeout(() => {
          root.querySelector('#lootSlot').innerHTML = `<div class="loot"><div class="ic" style="color:${R.color}">${icon}</div><div class="r">${R.name.toUpperCase()} · ${esc({ money: 'Credits', decor: 'Workshop decor', theme: 'Lighting theme', lore: 'Codex entry', xpboost: 'Booster' }[reward.kind])}</div><div class="nm">${esc(reward.name)}</div><div class="ds">${esc(reward.desc)}</div></div>`;
          root.querySelector('#cnext').style.visibility = 'visible';
        }, 380);
      };
      const finish = () => {
        if (!opened) return open();
        if (done) return;
        done = true;
        clearInterval(shakeT);
        this.close();
        resolve();
      };
      crateEl.onclick = open;
      root.querySelector('#cnext').onclick = finish;
      this.onKey = (e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          finish();
        }
      };
    });
  }

  dayEnd(s) {
    return new Promise((resolve) => {
      const cs = (s.contracts || []).map((c) => `<div style="margin:4px 0;color:${c.done ? 'var(--good)' : 'var(--muted)'}">${c.done ? '✓' : '✗'} ${esc(c.text)}</div>`).join('');
      const root = this.open(`
        <div class="eyebrow">Shift complete</div>
        <h2>Day ${s.day} · ${esc(s.headline)}</h2>
        <p class="sub">The last pod clears the airlock. Saturn turns below. Here's your shift report.</p>
        <div class="statgrid">
          <div><b>${s.orders}</b><span>Launched</span></div>
          <div><b style="color:var(--gold)">${esc(s.bestGrade || '—')}</b><span>Best grade</span></div>
          <div><b style="color:var(--gold)">${cr(s.earned)}</b><span>Earned</span></div>
          <div><b>${s.best ? fmtTime(s.best) : '—'}</b><span>Best build</span></div>
        </div>
        ${cs ? `<div class="eyebrow" style="margin-top:4px">Contracts</div>${cs}` : ''}
        <p class="sub">Wallet <b style="color:var(--gold)">${cr(s.money)}</b> — invest in tools at the workshop to build faster, chain longer and earn more.</p>
        <div class="row" style="justify-content:flex-end">
          <button class="btn" data-a="menu">Main menu</button>
          <button class="btn" data-a="workshop">Workshop</button>
          <button class="btn primary big" data-a="next">Start Day ${s.day + 1} ▸</button>
        </div>`);
      root.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
        this.close();
        resolve(b.dataset.a);
      }));
    });
  }

  workshop(save, onBuy, onTheme, tab = 'tools') {
    return new Promise((resolve) => {
      const render = (tab) => {
        let body = '';
        if (tab === 'tools') {
          body = `<div class="shopgrid">${UPGRADES.map((u) => {
            const own = !!save.upgrades[u.id];
            return `<div class="item ${own ? 'owned' : ''}"><div class="ic">${u.icon}</div><div class="nm">${esc(u.name)}</div><div class="ds">${esc(u.desc)}</div>
              ${own ? '<button class="btn small" disabled>Installed ✓</button>' : `<button class="btn small ${save.money >= u.price ? 'primary' : ''}" data-buy="${u.id}" ${save.money >= u.price ? '' : 'disabled'}>${cr(u.price)}</button>`}</div>`;
          }).join('')}</div>`;
        } else if (tab === 'lighting') {
          body = `<p class="sub">Paint the whole workshop. Some themes can only be found in supply crates.</p><div class="themes">${THEMES.map((t) => {
            const own = !!save.themes[t.id];
            const lock = !own && t.crate;
            return `<button class="theme ${save.theme === t.id ? 'sel' : ''} ${lock ? 'lock' : ''}" data-theme="${t.id}" ${lock ? 'disabled' : ''}><i style="background:linear-gradient(135deg,${t.a},${t.b})"></i>${esc(t.name)} ${own ? '' : t.crate ? '<small>CRATE ONLY</small>' : `<small>${cr(t.price)}</small>`}</button>`;
          }).join('')}</div>`;
        } else {
          const owned = DECOR.filter((d) => save.collection && save.collection.decor[d.id]).length;
          body = `<p class="sub">Decor found in supply crates appears around your bench. Collected <b>${owned}/${DECOR.length}</b>.</p><div class="shopgrid">${DECOR.map((d) => {
            const own = save.collection && save.collection.decor[d.id];
            const R = RARITY[d.rarity];
            return `<div class="item ${own ? 'owned' : 'locked'}"><div class="rar" style="color:${R.color}">${R.name.toUpperCase()}</div><div class="nm">${own ? esc(d.name) : '???'}</div><div class="ds">${own ? esc(d.desc) : 'Find it in a supply crate.'}</div></div>`;
          }).join('')}</div>`;
        }
        const root = this.open(`
          <div class="spread"><div><div class="eyebrow">Forge-7 workshop</div><h2>Upgrades & style</h2></div><div style="text-align:right"><div class="eyebrow" style="color:var(--muted)">Credits</div><div class="disp" style="font-size:32px;color:var(--gold)">${cr(save.money)}</div></div></div>
          <div class="tabs"><button class="btn ${tab === 'tools' ? 'on' : ''}" data-tab="tools">Tools</button><button class="btn ${tab === 'lighting' ? 'on' : ''}" data-tab="lighting">Lighting</button><button class="btn ${tab === 'decor' ? 'on' : ''}" data-tab="decor">Collection</button></div>
          ${body}
          <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn primary" data-close>Back to the bench ▸</button></div>`, 'shop');
        root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => render(b.dataset.tab)));
        root.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => {
          if (onBuy(b.dataset.buy)) render(tab);
        }));
        root.querySelectorAll('[data-theme]').forEach((b) => (b.onclick = () => {
          audio.play('ui');
          if (onTheme(b.dataset.theme)) render(tab);
        }));
        root.querySelector('[data-close]').onclick = () => {
          this.close();
          resolve();
        };
      };
      render(tab);
    });
  }

  codex(save) {
    return new Promise((resolve) => {
      const unlocked = (e) => (save.seen && save.seen[e.unlock]) || (save.collection && save.collection.codex[e.id]);
      const cats = ['Station', 'People', 'Signal', 'Archive'];
      let sel = CODEX.find(unlocked);
      const render = () => {
        const list = cats.map((c) => `<div class="cat">${c.toUpperCase()}</div>` + CODEX.filter((e) => e.cat === c).map((e) => {
          const u = unlocked(e);
          return `<div class="ent ${u ? '' : 'lk'} ${sel === e ? 'on' : ''}" data-id="${e.id}">${u ? esc(e.title) : '▒▒▒▒▒▒▒'}</div>`;
        }).join('')).join('');
        const n = CODEX.filter(unlocked).length;
        const root = this.open(`<div class="spread"><div><div class="eyebrow">Codex · ${n}/${CODEX.length} entries</div><h2>Archive</h2></div></div>
          <div class="codex"><div class="list">${list}</div><div class="body">${sel ? `<div class="eyebrow">${sel.cat}</div><h3>${esc(sel.title)}</h3><p>${esc(sel.text)}</p>` : '<p class="sub">No entries yet. Start your first shift.</p>'}</div></div>
          <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" data-close>Close</button></div>`, 'codex');
        root.querySelectorAll('.ent').forEach((el) => (el.onclick = () => {
          const e = CODEX.find((x) => x.id === el.dataset.id);
          if (!unlocked(e)) return;
          sel = e;
          audio.play('ui');
          render();
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
        <div class="eyebrow">Settings</div><h2>Configure</h2>
        <div class="set"><label>Master</label><input type="range" min="0" max="1" step="0.01" data-k="master" value="${s.master}"><span>${Math.round(s.master * 100)}</span></div>
        <div class="set"><label>Music</label><input type="range" min="0" max="1" step="0.01" data-k="music" value="${s.music}"><span>${Math.round(s.music * 100)}</span></div>
        <div class="set"><label>Effects</label><input type="range" min="0" max="1" step="0.01" data-k="sfx" value="${s.sfx}"><span>${Math.round(s.sfx * 100)}</span></div>
        <div class="set"><label>Graphics</label><select data-k="quality"><option value="ultra">Ultra — ambient occlusion, bloom, grain</option><option value="high">High — bloom, soft shadows</option><option value="medium">Medium — bloom, shadows</option><option value="low">Low — fastest</option></select><span></span></div>
        <div class="set"><label>Hint arrows</label><input type="checkbox" class="toggle" data-k="hints" ${s.hints ? 'checked' : ''}><span></span></div>
        <div class="set"><label>Screen shake</label><input type="checkbox" class="toggle" data-k="shake" ${s.shake !== false ? 'checked' : ''}><span></span></div>
        <div class="set"><label>Display</label><button class="btn small" data-fs>Toggle fullscreen <span class="kbd">F</span></button><span></span></div>
        <div class="row" style="justify-content:space-between;margin-top:22px"><button class="btn small" data-reset style="color:#fca5a5">Reset all progress…</button><button class="btn primary" data-close>Done</button></div>`);
      root.querySelector('select').value = s.quality;
      root.querySelectorAll('[data-k]').forEach((el) => {
        el.oninput = el.onchange = () => {
          const k = el.dataset.k;
          const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
          s[k] = v;
          if (el.type === 'range') el.nextElementSibling.textContent = Math.round(v * 100);
          onChange(k, v);
        };
      });
      root.querySelector('[data-fs]').onclick = () => this.g.toggleFullscreen();
      root.querySelector('[data-reset]').onclick = async () => {
        if (await this.confirm('Reset everything?', 'Your rank, credits, upgrades, collection and story progress will be wiped. This cannot be undone.')) {
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
      const root = this.open(`<h2>${esc(title)}</h2><p class="sub">${esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-n>Cancel</button><button class="btn primary" data-y>Confirm</button></div>`);
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
        <div class="eyebrow">Field manual</div><h2>A shift at the bench</h2>
        <div class="howto"><ol>
          <li><b>Read the work order.</b> The pads also hold look-alike parts. Install the wrong one and QA will fail.</li>
          <li><b>Drag parts into their hologram outline.</b> Line them up with the gold ring for a <b>PERFECT</b>. Prefer clicking? Click a part to pick it up and click again to drop it.</li>
          <li><b>Screws:</b> HOLD on a screw and release when the needle hits the gold zone. <b>Thermal paste:</b> HOLD on the CPU until the blob fills the gold ring.</li>
          <li><b>Cables:</b> drag each connector from its grommet to the glowing port. Close the glass panel and press <b>power</b> for QA and the stress test.</li>
          <li><b>Pack it:</b> drop in the PC, foam and accessories, then speed-fold the flaps. Tape the seam in <b>one straight line</b>, stamp the label when the rings meet, and hit <b>SHIP</b>.</li>
          <li><b>Chain actions</b> without long pauses to build <b>Flow</b> and reach <b>Overdrive</b> for payout multipliers. Every build earns a grade, a supply crate, XP and progress on decoding the signal.</li>
        </ol>
        <div class="keys"><span class="kbd">H</span><span>Hint arrow for the next step</span><span class="kbd">Esc</span><span>Pause</span><span class="kbd">M</span><span>Mute</span><span class="kbd">F</span><span>Fullscreen</span><span class="kbd">Right-drag</span><span>Look around · wheel to zoom</span></div></div>
        <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn primary" data-close>Got it</button></div>`);
      root.querySelector('[data-close]').onclick = () => {
        this.close();
        resolve();
      };
    });
  }

  pauseMenu() {
    return new Promise((resolve) => {
      const root = this.open(`<div class="eyebrow">Paused</div><h2>Coffee break</h2><p class="sub">The timer is stopped. ORIN is pretending not to notice.</p>
        <div style="display:flex;flex-direction:column;gap:8px;min-width:300px">
          <button class="btn primary" data-a="resume">Resume <span class="kbd">Esc</span></button>
          <button class="btn" data-a="codex">Codex</button>
          <button class="btn" data-a="howto">Field manual</button>
          <button class="btn" data-a="settings">Settings</button>
          <button class="btn" data-a="menu">Quit to menu <span style="color:var(--muted);font-weight:500;text-transform:none;letter-spacing:0">(this order restarts)</span></button>
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
      const ch = chapterFor(rank);
      const newChapter = ch.ranks[0] === rank;
      const root = this.open(`<div style="text-align:center"><div class="eyebrow">${newChapter ? `Chapter ${ch.n} unlocked` : 'Promotion'}</div>
        <img src="${this.markURL}" style="width:130px;height:130px;margin:10px auto;display:block;filter:drop-shadow(0 0 30px var(--a))" alt="">
        <h2>Rank ${rank} · ${esc(r.name)}</h2>${newChapter ? `<div class="disp" style="color:var(--gold);font-size:22px;margin:6px 0">${esc(ch.title)}</div>` : ''}<p class="sub">Unlocked: <b style="color:var(--text)">${esc(r.unlock)}</b></p>
        <button class="btn primary big" data-close>Continue</button></div>`);
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
        <div class="eyebrow" style="color:#fde68a;margin-top:10px">The Lighthouse Protocol · complete</div>
        <h3>Lighthouse Keeper</h3>
        <p class="sub" style="color:#ddd6fe">${save.stats.orders} hand-built machines. ${save.stats.perfects || 0} perfect actions. One message answered across two and a half million light-years.</p>
        <p style="font-family:var(--disp);letter-spacing:.2em;color:#c4b5fd">— THE CREW OF FORGE-7</p></div>
        <p class="sub" style="text-align:center;margin-top:16px">Your story is complete — but the galaxy keeps ordering. Endless shifts await.</p>
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
        <p>A game about the care that goes into every machine.<br>Bundled with your Andromeda Insights PC.</p>
        <p class="sub">Every model, texture, sound effect and note of music in this game is generated live by your new computer — no downloads, no internet, just your hardware flexing. Fonts: Rajdhani &amp; Inter (SIL Open Font License).</p>
        <p><b>Thank you for choosing Andromeda Insights.</b><br>Somewhere, a builder clicked your RAM into place and felt exactly what you just felt.</p>
        <button class="btn primary" data-close>Close</button></div>`);
      root.querySelector('[data-close]').onclick = () => {
        this.close();
        resolve();
      };
    });
  }
}

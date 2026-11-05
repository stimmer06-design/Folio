// Automated playtest: launches the release build in Chromium and plays real orders with the mouse,
// including the skill mechanics (precision drops, torque holds, paste, cable drags, tape, stamp timing).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const OUT = process.env.SHOTS || 'tests/output';
const ORDERS = +(process.env.ORDERS || 1);
mkdirSync(OUT, { recursive: true });
const file = 'file://' + path.resolve('release/AndromedaAssembly.html');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 960), height: +(process.env.H || 540) } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const Q = process.env.Q || 'low';
await page.addInitScript((q) => {
  const k = 'andromeda-assembly-save-v2';
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.settings = { ...(s.settings || {}), quality: q, autoChecked: true };
  localStorage.setItem(k, JSON.stringify(s));
}, Q);
const sleep = (ms) => page.waitForTimeout(ms);
await page.goto(file);
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 90000 });
await sleep(9000);
await page.screenshot({ path: `${OUT}/01-title.png` });
if (process.env.PRESET) await page.evaluate((p) => { const g = window.__game; const o = JSON.parse(p); for (const k in o) g.save[k] = typeof o[k] === 'object' && !Array.isArray(o[k]) && g.save[k] ? { ...g.save[k], ...o[k] } : o[k]; }, process.env.PRESET);
if (process.env.FAST) await page.evaluate(() => (window.__fast = true));
if (process.env.QAFAIL) await page.evaluate(() => (window.__qafail = true));
await page.click('#title [data-a]', { timeout: 120000 });

let shotN = 2;
const shot = async (name) => page.screenshot({ path: `${OUT}/${String(shotN++).padStart(2, '0')}-${name}.png` });

async function settle() {
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(() => { const g = window.__game; return { tw: g.tweens.list.length, c: g.camera.position.toArray() }; });
    await sleep(120);
    const c2 = await page.evaluate(() => window.__game.camera.position.toArray());
    if (s.tw === 0 && Math.hypot(c2[0] - s.c[0], c2[1] - s.c[1], c2[2] - s.c[2]) < 0.01) return;
  }
}

async function nextAction() {
  await settle();
  return page.evaluate(() => {
    const g = window.__game;
    const V = (v) => { const p = v.clone().project(g.camera); return [Math.round((p.x + 1) / 2 * innerWidth), Math.round((1 - p.y) / 2 * innerHeight)]; };
    const tx = document.getElementById('tx');
    if (tx && !tx.classList.contains('hidden') && !tx.classList.contains('bark')) return { type: 'tx' };
    if (g.ui.isOpen) return { type: 'modal' };
    if (!document.getElementById('rgbpick').classList.contains('hidden')) return { type: 'rgb', id: g.order.rgb };
    if (g.state === 'assemble') {
      const a = g.assembly;
      if (window.__qafail && !a.order.__qa) {
        a.order.__qa = true;
        const wrong = a.parts.find((p) => p.cat === 'cpu' && p.spec.id !== a.order.parts.cpu);
        a.install(a.trayPartFor('mb'), true);
        a.install(wrong, true);
        a.debugComplete();
        a.closePanel().then(() => setTimeout(() => a.runTest(), 300));
        return { type: 'wait' };
      }
      if (window.__fast && !a.order.__dbg) { a.order.__dbg = true; a.debugComplete(); return { type: 'wait' }; }
      if (a.held || a.gauge) return { type: 'wait' };
      const st = a.currentStep();
      if (!st) return { type: 'wait' };
      const cats = ['mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'];
      if (cats.includes(st.id)) {
        const part = st.wrong ? a.slot[st.id] : a.trayPartFor(st.id);
        if (!part || part.state === 'anim') return { type: 'wait' };
        const from = V(a.partWorldCenter(part));
        if (st.wrong) return { type: 'drag', from, to: [from[0] + 400, from[1] - 200], id: st.id };
        if (g.hasUpgrade('gloves')) return { type: 'click', at: from, id: st.id + '-glove' };
        return { type: 'drag', from, to: V(a.slotWorld(st.id).add(part.center)), id: st.id };
      }
      if (/Screw/.test(st.id) || st.id === 'paste') return { type: 'hold', at: V(st.target()), id: st.id, until: 0.77 };
      if (['c24', 'c8', 'cgpu'].includes(st.id)) {
        if (!a.stubs[st.id]) return { type: 'wait' };
        return { type: 'drag', from: V(a.stubs[st.id].plug.getWorldPosition(new a.tmpV.constructor())), to: V(a.portWorld(st.id)), id: st.id, steps: 18 };
      }
      return { type: 'click', at: V(st.target()), id: st.id };
    }
    if (g.state === 'pack') {
      const p = g.packing;
      if (p.held || p.busy) return { type: 'wait' };
      const s = p.stage;
      const BT = -2.2 + 6.0;
      const W3 = (x, y, z) => new p.box.position.constructor(x, y, z);
      if (s === 'pc') {
        const t = p.targetFor({ kind: 'pc' }); t.y = BT + 0.35;
        return { type: 'drag', from: V(p.pc.localToWorld(W3(0, 3.0, 1.0))), to: V(t), id: 'pc' };
      }
      if (s === 'foam' || s === 'acc') {
        const it = s === 'foam' ? p.foam : p.items.find((i) => i.required && i.state === 'table' && i.kind !== 'foam');
        if (!it) return { type: 'wait' };
        const t = p.targetFor(it); t.y = BT + 0.6;
        return { type: 'drag', from: V(it.obj.localToWorld(W3(0, 0.2, 0))), to: V(t), id: it.kind };
      }
      if (s === 'flaps' && p.card.state === 'table' && !p.flaps.some((f) => f.done)) {
        const t = p.targetFor(p.card); t.y = BT + 0.6;
        return { type: 'drag', from: V(p.card.obj.localToWorld(W3(0, 0.05, 0))), to: V(t), id: 'card' };
      }
      if (s === 'tape') return { type: 'drag', from: V(p.box.localToWorld(W3(-2.5, 6.07, 0))), to: V(p.box.localToWorld(W3(2.55, 6.07, 0))), id: 'tape', steps: 30 };
      if (s === 'stamp') return { type: 'stamp' };
      const st = p.currentStep();
      if (!st) return { type: 'wait' };
      return { type: 'click', at: V(st.target()), id: s };
    }
    return { type: 'wait', state: g.state };
  });
}

let done = 0, guard = 0, lastKey = '', same = 0;
const judged = { perfect: 0, great: 0, good: 0, sloppy: 0 };
const t0 = Date.now();
while (done < ORDERS && guard++ < 600) {
  const a = await nextAction();
  if (a.type === 'tx') {
    if (shotN < 4) await shot('transmission');
    await page.keyboard.press('Escape');
    await sleep(300);
    continue;
  }
  if (a.type === 'rgb') {
    await page.click(`#rgbpick button[data-id="${a.id}"]`);
    await sleep(300);
    continue;
  }
  if (a.type === 'modal') {
    const kind = await page.evaluate(() => (document.querySelector('#payamt') ? 'results' : document.querySelector('#crate') ? 'crate' : document.querySelector('#modal h2')?.textContent || 'modal'));
    console.log('modal:', kind);
    if (kind === 'results') {
      await sleep(4200);
      await shot('results');
      done++;
      await page.click('#resnext');
    } else if (kind === 'crate') {
      await page.click('#crate');
      await sleep(1800);
      if (shotN < 12) await shot('crate');
      await page.click('#cnext');
    } else {
      await sleep(1200);
      await shot('modal');
      const btn = (await page.$('#modal [data-a="next"]')) || (await page.$('#modal [data-close]'));
      if (btn) await btn.click(); else await page.keyboard.press('Space');
    }
    await sleep(500);
    continue;
  }
  if (a.type === 'wait') { await sleep(250); continue; }
  const key = a.type + a.id;
  same = key === lastKey ? same + 1 : 0;
  lastKey = key;
  if (same > 5) { console.log('STUCK on', JSON.stringify(a)); break; }
  if (a.type === 'drag') {
    await page.mouse.move(a.from[0], a.from[1]);
    await page.mouse.down();
    const steps = a.steps || 14;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(a.from[0] + (a.to[0] - a.from[0]) * i / steps, a.from[1] + (a.to[1] - a.from[1]) * i / steps);
      await sleep(25);
    }
    await sleep(500);
    if ((a.id === 'gpu' || a.id === 'mb') && shotN < 6) await shot('holding');
    if (a.id === 'c8' && shotN < 9) await shot('cable');
    await page.mouse.up();
    await sleep(400);
  } else if (a.type === 'hold') {
    await page.mouse.move(a.at[0], a.at[1]);
    await page.mouse.down();
    let shotTaken = false;
    for (let i = 0; i < 3000; i++) {
      const v = await page.evaluate(() => (window.__game.assembly.gauge ? window.__game.assembly.gauge.v : -1));
      if (v >= a.until || v === -1) break;
      if (v > 0.5 && a.id === 'mbScrews' && shotN < 7 && !shotTaken) {
        shotTaken = true;
        await shot('gauge');
      }
      await sleep(20);
    }
    await page.mouse.up();
    await sleep(350);
  } else if (a.type === 'stamp') {
    for (let i = 0; i < 3000; i++) {
      const e = await page.evaluate(() => { const s = window.__game.packing.stampScale(); return s < 1.12 && s > 0.92 ? 0 : 1; });
      if (e === 0) break;
      await sleep(10);
    }
    await page.mouse.click(400, 300);
    await sleep(400);
  } else if (a.type === 'click') {
    await page.mouse.click(a.at[0], a.at[1]);
    await sleep(a.id === 'power' ? 600 : 400);
    if (a.id === 'power') { await sleep(2500); await shot('qa'); }
  }
  const st = await page.evaluate(() => window.__game.state + ':' + (window.__game.packing.stage || ''));
  if (st === 'pack:flaps' && shotN < 12) await shot('pack');
}
const final = await page.evaluate(() => ({ state: window.__game.state, save: window.__game.save }));
await shot('end');
console.log('orders done:', done, 'secs', ((Date.now() - t0) / 1000).toFixed(0), 'state', final.state, 'credits', final.save.money, 'xp', final.save.xp, 'perfects', final.save.stats.perfects, 'signal', (final.save.signal || 0).toFixed(1), 'crates', final.save.stats.crates, 'qaFails', final.save.stats.qaFails);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
process.exit(errors.length || done < ORDERS ? 1 : 0);

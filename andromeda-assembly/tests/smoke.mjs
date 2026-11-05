// Automated playtest: launches the release build in Chromium and plays real orders with the mouse.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.SHOTS || 'tests/output';
const ORDERS = +(process.env.ORDERS || 2);
mkdirSync(OUT, { recursive: true });
const file = 'file://' + path.resolve('release/AndromedaAssembly.html');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sleep0 = 0;
const page = await browser.newPage({ viewport: { width: +(process.env.W || 960), height: +(process.env.H || 540) } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const sleep = (ms) => page.waitForTimeout(ms);
await page.goto(file);
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 60000 });
await page.evaluate((q) => { const g = window.__game; g.save.settings.quality = q; g.save.settings.autoChecked = true; g.applyQuality(); }, process.env.Q || 'low');
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/01-title.png` });
if (process.env.PRESET) await page.evaluate((p) => { Object.assign(window.__game.save, JSON.parse(p)); }, process.env.PRESET);

if (process.env.FAST) await page.evaluate(() => (window.__fast = true));
if (process.env.QAFAIL) await page.evaluate(() => (window.__qafail = true));
await page.click('#title [data-a]');

async function settle() {
  for (let i = 0; i < 80; i++) {
    const s = await page.evaluate(() => { const g = window.__game; return { tw: g.tweens.list.filter((t) => !t.key || !t.key.endsWith(':xf') || true).length, c: g.camera.position.toArray() }; });
    await sleep(150);
    const c2 = await page.evaluate(() => window.__game.camera.position.toArray());
    const moved = Math.hypot(c2[0] - s.c[0], c2[1] - s.c[1], c2[2] - s.c[2]);
    if (s.tw === 0 && moved < 0.01) return;
  }
}
async function nextAction() {
  await settle();
  return page.evaluate(() => {
    const g = window.__game;
    const V = (v) => { const p = v.clone().project(g.camera); return [Math.round((p.x + 1) / 2 * innerWidth), Math.round((1 - p.y) / 2 * innerHeight)]; };
    if (g.ui.isOpen) return { type: 'modal' };
    if (g.state === 'assemble') {
      const a = g.assembly;
      if (window.__qafail && !a.order.__qa) {
        // force a wrong CPU in, finish the build and power on: QA must fail
        a.order.__qa = true;
        const wrong = a.parts.find((p) => p.cat === 'cpu' && p.spec.id !== a.order.parts.cpu);
        a.install(a.trayPartFor('mb'), true);
        a.install(wrong, true);
        a.debugComplete();
        a.closePanel().then(() => setTimeout(() => a.runTest(), 300));
        window.__qaStarted = true;
        return { type: 'wait' };
      }
      if (window.__fast && !a.order.__dbg) { a.order.__dbg = true; a.debugComplete(); return { type: 'wait' }; }
      if (a.held) return { type: 'wait' };
      const st = a.currentStep();
      if (!st) return { type: 'wait' };
      const cats = ['mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'];
      if (cats.includes(st.id)) {
        const part = st.wrong ? a.slot[st.id] : a.trayPartFor(st.id);
        if (!part || part.state === 'anim') return { type: 'wait' };
        const from = V(a.partWorldCenter(part));
        if (!st.wrong && g.hasUpgrade('gloves')) return { type: 'click', at: from, id: st.id + '-glove' };
        if (st.wrong) return { type: 'drag', from, to: [from[0] + 400, from[1] - 200], id: st.id };
        const sw = a.slotWorld(st.id).add(part.center);
        return { type: 'drag', from, to: V(sw), id: st.id };
      }
      return { type: 'click', at: V(st.target().clone().setY(st.target().y)), id: st.id, avail: st.avail };
    }
    if (g.state === 'pack') {
      const p = g.packing;
      if (p.held || p.busy) return { type: 'wait' };
      const s = p.stage;
      const BT = -2.2 + 6.0;
      if (s === 'pc') {
        const from = V(p.pc.localToWorld(new p.pc.position.constructor(0, 3.0, 1.0)));
        const t = p.targetFor({ kind: 'pc' }); t.y = BT + 0.35;
        return { type: 'drag', from, to: V(t), id: 'pc' };
      }
      if (s === 'foam' || s === 'acc') {
        const it = s === 'foam' ? p.foam : p.items.find((i) => i.required && i.state === 'table' && i.kind !== 'foam') ;
        if (!it) return { type: 'wait' };
        const c = it.obj.localToWorld(new it.obj.position.constructor(0, 0.2, 0));
        const t = p.targetFor(it); t.y = BT + 0.6;
        return { type: 'drag', from: V(c), to: V(t), id: it.kind };
      }
      if (s === 'flaps' && p.card.state === 'table' && !p.flaps.some((f) => f.done)) {
        const c = p.card.obj.localToWorld(new p.card.obj.position.constructor(0, 0.05, 0));
        const t = p.targetFor(p.card); t.y = BT + 0.6;
        return { type: 'drag', from: V(c), to: V(t), id: 'card' };
      }
      if (s === 'tape') {
        const a = p.box.localToWorld(new p.box.position.constructor(-2.4, 6.07, 0));
        const b = p.box.localToWorld(new p.box.position.constructor(2.5, 6.07, 0));
        return { type: 'drag', from: V(a), to: V(b), id: 'tape', steps: 30 };
      }
      const st = p.currentStep();
      if (!st) return { type: 'wait' };
      return { type: 'click', at: V(st.target()), id: s };
    }
    return { type: 'wait', state: g.state };
  });
}

let shots = 2, done = 0, guard = 0, lastId = '', same = 0;
const t0 = Date.now();
while (done < ORDERS && guard++ < 400) {
  const a = await nextAction();
  if (a.type === 'modal') {
    const which = await page.evaluate(() => (document.querySelector('#payamt') ? 'RESULTS ' : '') + (document.querySelector('#modal .card h2')?.textContent || ''));
    console.log('modal:', which);
    await sleep(2600);
    await page.screenshot({ path: `${OUT}/${String(shots++).padStart(2, '0')}-modal.png` });
    if (which.startsWith('RESULTS')) done++;
    const btn = await page.$('#modal #resnext') || await page.$('#modal [data-a="next"]') || await page.$('#modal [data-close]');
    if (btn) await btn.click(); else await page.keyboard.press('Space');
    await sleep(600);
    continue;
  }
  if (a.type === 'wait') { await sleep(250); continue; }
  const key = a.type + a.id;
  same = key === lastId ? same + 1 : 0;
  lastId = key;
  if (same > 4) { console.log('STUCK on', JSON.stringify(a)); break; }
  if (a.type === 'drag') {
    await page.mouse.move(a.from[0], a.from[1]);
    await page.mouse.down();
    const steps = a.steps || 14;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(a.from[0] + (a.to[0] - a.from[0]) * i / steps, a.from[1] + (a.to[1] - a.from[1]) * i / steps);
      await sleep(25);
    }
    await sleep(450);
    if (a.id === 'gpu' && shots < 6) await page.screenshot({ path: `${OUT}/${String(shots++).padStart(2, '0')}-holding.png` });
    await page.mouse.up();
    await sleep(500);
  } else if (a.type === 'click') {
    await page.mouse.click(a.at[0], a.at[1]);
    await sleep(a.id === 'power' ? 600 : 450);
    if (a.id === 'power') { await sleep(2200); await page.screenshot({ path: `${OUT}/${String(shots++).padStart(2, '0')}-qa.png` }); }
  }
  const st = await page.evaluate(() => window.__game.state + ':' + (window.__game.packing.stage || ''));
  if (st.startsWith('pack:acc') && shots < 9) { await page.screenshot({ path: `${OUT}/${String(shots++).padStart(2, '0')}-pack.png` }); }
  // RGB picker: choose the requested colour
  const rgb = await page.$('#rgbpick:not(.hidden) button');
  if (rgb) {
    const want = await page.evaluate(() => window.__game.order.rgb);
    await page.click(`#rgbpick button[data-id="${want}"]`);
  }
}
const final = await page.evaluate(() => ({ state: window.__game.state, save: window.__game.save }));
console.log('qaFails total:', final.save.stats.qaFails, 'day', final.save.day, 'rank xp', final.save.xp, 'upgrades', Object.keys(final.save.upgrades).join(','));
await page.screenshot({ path: `${OUT}/${String(shots++).padStart(2, '0')}-end.png` });
console.log('orders done:', done, 'secs', ((Date.now() - t0) / 1000).toFixed(0), 'state', final.state, 'money', final.save.money, 'xp', final.save.xp, 'orders', final.save.stats.orders);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
process.exit(errors.length || done < ORDERS ? 1 : 0);

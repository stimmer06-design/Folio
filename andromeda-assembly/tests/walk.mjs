// Walk-mode test: boots into the station, tours every room, and exercises the interactions.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.env.SHOTS || 'tests/output/walk';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const Q = process.env.Q || 'low';
await page.addInitScript((q) => localStorage.setItem('andromeda-assembly-save-v2', JSON.stringify({
  started: true, money: 2000, xp: 800, signal: 30, day: 3, seen: { intro: true, firstShip: true, rank2: true, rank3: true, rank4: true, tip_walk: true },
  stats: { orders: 12, perfects: 90, earned: 3000 }, collection: { decor: { duck: true, globe: true, trophy: true }, codex: {} },
  history: [{ no: 'A-1011', grade: 'S', customer: 'Priya Nair', city: 'Titan Haven' }], shipments: { saturn: 4, mars: 3, earth: 5 },
  settings: { quality: q, autoChecked: true },
})), Q);
await page.goto('file://' + path.resolve('release/AndromedaAssembly.html'));
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 120000 });
await page.waitForTimeout(8000);
for (let i = 0; i < 5 && (await page.$('#splash')); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(1500); }
await page.click('[data-a="continue"]');
await page.waitForFunction(() => window.__game.state === 'walk', null, { timeout: 120000 });
const advance = async (secs) => {
  const t0 = await page.evaluate(() => window.__game.time);
  for (let i = 0; i < 600; i++) { if ((await page.evaluate(() => window.__game.time)) - t0 > secs) return; await page.waitForTimeout(100); }
};
const shot = async (name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 });
const tp = (x, z, yaw, pitch = -0.08) => page.evaluate(([x, z, yaw, pitch]) => { const w = window.__game.walk; w.teleport(x, z, yaw); w.pitch = pitch; }, [x, z, yaw, pitch]);
const PI = Math.PI;
const tour = [
  ['bay', 2.4, 9, 0.35], ['corridor', 15.5, 8, -PI / 2], ['shop', 21.5, 2.5, 0], ['shop-items', 21.5, -4, PI / 2 - 0.2],
  ['observatory', 36.5, 2, 0.05, 0.05], ['lounge', 23.5, 15, PI * 0.78], ['arcade', 20.5, 22, PI / 2], ['core', 36.5, 14.5, PI], ['hangar', 46.5, 8, -PI / 2 - 0.25],
];
for (const [name, x, z, yaw, pitch] of tour) {
  await tp(x, z, yaw, pitch);
  await advance(1.2);
  await shot(name);
  console.log('room', name, await page.evaluate(() => (window.__game.walk.room || {}).id), 'target:', await page.evaluate(() => (window.__game.walk.target || {}).id || '-'));
}
// interactions
const I = (id) => page.evaluate((id) => { const g = window.__game; const it = g.deck.interact.find((q) => q.id === id) || g.walk.extra.find((q) => q.id === id); g.walkInteract(it); }, id);
await tp(21.5, 2.5, 0);
await I('buy-optics');
await page.waitForSelector('#modal .overlay');
await shot('purchase');
await page.click('#modal [data-a="yes"]');
await page.waitForTimeout(500);
if (!(await page.evaluate(() => window.__game.save.upgrades.optics))) errors.push('shop purchase failed');
await I('pip');
await page.waitForSelector('#tx:not(.hidden)');
await advance(0.5);
await shot('talk-pip');
for (let i = 0; i < 6 && (await page.isVisible('#tx:not(.bark)')); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
await I('arcade');
await page.waitForSelector('#overlay2 canvas');
await page.keyboard.press('Space');
for (let i = 0; i < 20; i++) { await page.keyboard.down(i % 2 ? 'KeyW' : 'KeyS'); await page.waitForTimeout(150); await page.keyboard.up(i % 2 ? 'KeyW' : 'KeyS'); }
await shot('arcade-play');
await page.keyboard.press('Escape');
await page.waitForSelector('#overlay2', { state: 'hidden' });
await I('jukebox');
await page.waitForTimeout(300);
if ((await page.evaluate(() => window.__game.save.musicStyle)) !== 'synth') errors.push('jukebox failed');
await I('telescope');
await page.waitForSelector('#tuner');
await advance(1.0);
await shot('telescope');
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
await I('solmap');
await page.waitForSelector('#modal .overlay');
await shot('solmap');
await page.click('#modal [data-close]');
await I('trophies');
await page.waitForSelector('#modal .overlay');
await shot('trophies');
await page.click('#modal [data-close]');
// walk with the keyboard and check collisions keep us inside
await tp(2.4, 9, 0);
await page.keyboard.down('KeyW');
await advance(2.5);
await page.keyboard.up('KeyW');
const z = await page.evaluate(() => window.__game.walk.pos.z);
if (z < 2.4 + 0.9 - 0.01) errors.push('collision failed: walked into the bench, z=' + z);
console.log('walked to z', z.toFixed(2));
// back to the bench starts an order
await I('bench');
await page.waitForFunction(() => window.__game.state === 'assemble', null, { timeout: 180000 });
console.log('achievements', await page.evaluate(() => Object.keys(window.__game.save.achievements).join(',')));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'walk ok, no errors');
await browser.close();
process.exit(errors.length ? 1 : 0);

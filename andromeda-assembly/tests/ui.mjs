// Opens every menu/modal, exercises the workshop, codex, crates and transmissions, and checks for errors.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.env.SHOTS || 'tests/output/ui';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(() => localStorage.setItem('andromeda-assembly-save-v2', JSON.stringify({ started: true, money: 1000, xp: 400, seen: { intro: true, firstShip: true, rank3: true }, settings: { quality: 'low', autoChecked: true } })));
await page.goto('file://' + path.resolve('release/AndromedaAssembly.html'));
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 90000 });
page.setDefaultTimeout(120000);
await page.waitForTimeout(8000);
for (let i = 0; i < 5 && (await page.$('#splash')); i++) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(1200);
const shot = async (n) => { await page.waitForTimeout(700); await page.screenshot({ timeout: 120000, path: `${OUT}/${n}.png` }); };
const fail = (m) => errors.push(m);
await shot('title');

await page.click('[data-a="workshop"]');
await shot('workshop');
await page.click('[data-buy="driver"]');
await page.waitForTimeout(300);
if (!(await page.evaluate(() => window.__game.save.upgrades.driver === true && window.__game.save.money === 800))) fail('workshop purchase failed');
await page.click('[data-tab="lighting"]');
await page.click('[data-theme="amber"]');
await page.waitForTimeout(300);
if ((await page.evaluate(() => window.__game.save.theme)) !== 'amber') fail('theme purchase failed');
await shot('workshop-lighting');
await page.click('[data-tab="decor"]');
await shot('workshop-collection');
await page.click('[data-close]');
await page.waitForSelector('#title:not(.hidden)');

await page.click('[data-a="codex"]');
await shot('codex');
await page.click('.ent:not(.lk) >> nth=1');
await page.click('[data-close]');

await page.click('[data-a="settings"]');
await page.selectOption('#modal select', 'medium');
if ((await page.evaluate(() => window.__game.save.settings.quality)) !== 'medium') fail('quality setting failed');
await page.click('[data-close]');
await page.click('[data-a="howto"]');
await shot('howto');
await page.click('[data-close]');
await page.click('[data-a="credits"]');
await page.click('[data-close]');

// in-game: pause, transmission, crate, rank-up, day end, certificate
await page.click('[data-a="continue"]');
await page.waitForFunction(() => window.__game.state === 'assemble', null, { timeout: 120000 });
await shot('hud');
await page.keyboard.press('Escape');
await page.waitForSelector('#modal .overlay');
if (!(await page.evaluate(() => window.__game.paused))) fail('pause failed');
await shot('pause');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
if (await page.evaluate(() => window.__game.paused)) fail('resume failed');

const t = page.evaluate(() => window.__game.ui.transmission([{ who: 'orin', text: 'Test transmission, Builder.' }, { who: 'whisper', text: 'HELLO.' }]));
await page.waitForTimeout(1500);
await shot('transmission');
for (let i = 0; i < 8 && (await page.isVisible('#tx')); i++) {
  await page.click('#tx');
  await page.waitForTimeout(400);
}
await t;

const c = page.evaluate(() => { const g = window.__game; return g.ui.crate('legendary', { kind: 'decor', id: 'trophy', name: 'Golden Wrench', desc: 'Awarded to builders whose hands never shake.', rarity: 'legendary' }); });
await page.waitForTimeout(500);
await page.click('#crate');
await shot('crate');
await page.click('#cnext');
await c;
const r = page.evaluate(() => window.__game.ui.rankUp(5));
await shot('rankup');
await page.click('[data-close]');
await r;
const p = page.evaluate(() => window.__game.ui.dayEnd({ day: 4, orders: 5, earned: 1234, best: 71, money: 2300, bestGrade: 'S', headline: 'Legendary shift', contracts: window.__game.save.contracts }));
await shot('dayend');
await page.click('[data-a="next"]');
await p;
const cert = page.evaluate(() => window.__game.ui.certificate(window.__game.save));
await shot('certificate');
await page.click('[data-close]');
await cert;
await page.keyboard.press('Escape');
await page.waitForSelector('[data-a="menu"]');
await page.click('[data-a="menu"]');
await page.waitForFunction(() => window.__game.state === 'title');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'ui ok, no errors');
await browser.close();
process.exit(errors.length ? 1 : 0);

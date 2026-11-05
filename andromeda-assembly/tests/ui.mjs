// Opens every menu/modal, exercises buying in the workshop, and checks for errors.
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
await page.goto('file://' + path.resolve('release/AndromedaAssembly.html'));
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 60000 });
await page.evaluate(() => { const g = window.__game; g.save.settings.quality = 'low'; g.applyQuality(); g.save.money = 1000; g.save.started = true; g.ui.showTitle(g.save); });
const shot = async (n) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${n}.png` }); };
const fail = (m) => { errors.push(m); };

await page.click('[data-a="workshop"]');
await shot('workshop');
await page.click('[data-buy="driver"]');
await page.waitForTimeout(300);
const owned = await page.evaluate(() => window.__game.save.upgrades.driver === true && window.__game.save.money === 820);
if (!owned) fail('workshop purchase failed');
await page.click('[data-theme="amber"]');
await page.waitForTimeout(300);
const th = await page.evaluate(() => window.__game.save.theme);
if (th !== 'amber') fail('theme purchase failed: ' + th);
await shot('workshop-bought');
await page.click('[data-close]');
await page.waitForSelector('#title:not(.hidden)');

await page.click('[data-a="settings"]');
await shot('settings');
await page.selectOption('#modal select', 'medium');
const q = await page.evaluate(() => window.__game.save.settings.quality);
if (q !== 'medium') fail('quality setting failed');
await page.click('[data-close]');

await page.click('[data-a="howto"]');
await shot('howto');
await page.click('[data-close]');
await page.click('[data-a="credits"]');
await shot('credits');
await page.click('[data-close]');

// in-game: pause menu
await page.click('[data-a="continue"]');
await page.waitForFunction(() => window.__game.state === 'assemble', null, { timeout: 120000 });
await page.keyboard.press('Escape');
await page.waitForSelector('#modal .overlay');
const paused = await page.evaluate(() => window.__game.paused);
if (!paused) fail('pause failed');
await shot('pause');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
if (await page.evaluate(() => window.__game.paused)) fail('resume failed');

// day end + certificate screens
const p = page.evaluate(() => window.__game.ui.dayEnd({ day: 4, orders: 5, stars: 14, earned: 1234, best: 71, money: 2300, headline: 'Great shift!' }));
await shot('dayend');
await page.click('[data-a="next"]');
await p;
const c = page.evaluate(() => window.__game.ui.certificate(window.__game.save));
await shot('certificate');
await page.click('[data-close]');
await c;
// quit to title from pause
await page.keyboard.press('Escape');
await page.waitForSelector('[data-a="menu"]');
await page.click('[data-a="menu"]');
await page.waitForFunction(() => window.__game.state === 'title');
await shot('back-to-title');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'ui ok, no errors');
await browser.close();
process.exit(errors.length ? 1 : 0);

// Bundles the game into ONE self-contained HTML file (no network, no server needed).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome100', 'firefox100', 'safari15', 'edge100'],
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// Embed the UI fonts (SIL Open Font License) so the game works fully offline
const fonts = [
  ['Rajdhani', 500, 'node_modules/@fontsource/rajdhani/files/rajdhani-latin-500-normal.woff2'],
  ['Rajdhani', 600, 'node_modules/@fontsource/rajdhani/files/rajdhani-latin-600-normal.woff2'],
  ['Rajdhani', 700, 'node_modules/@fontsource/rajdhani/files/rajdhani-latin-700-normal.woff2'],
  ['Inter', 400, 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2'],
  ['Inter', 600, 'node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2'],
];
const fontCss = fonts
  .map(([fam, w, f]) => `@font-face{font-family:"${fam}";font-style:normal;font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${readFileSync(f).toString('base64')}) format("woff2")}`)
  .join('\n');

const html = readFileSync('src/template.html', 'utf8')
  .replace('/*FONTS*/', () => fontCss)
  .replace('<!--SCRIPT-->', () => `<script>${js}</script>`);
mkdirSync('release', { recursive: true });
writeFileSync('release/AndromedaAssembly.html', html);
console.log(`release/AndromedaAssembly.html  ${(html.length / 1024).toFixed(0)} KB`);

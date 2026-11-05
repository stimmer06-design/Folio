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
let js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('src/template.html', 'utf8').replace('<!--SCRIPT-->', () => `<script>${js}</script>`);
mkdirSync('release', { recursive: true });
writeFileSync('release/AndromedaAssembly.html', html);
console.log(`release/AndromedaAssembly.html  ${(html.length / 1024).toFixed(0)} KB`);

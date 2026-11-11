// Packs the game into ONE self-contained HTML file: dist/bhai_phota.html
// (house model + layout are embedded, so it opens with a double-click; three.js loads from a CDN)
//
//   node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, p));

const glb = read('assets/house_exterior.glb').toString('base64');
const layout = read('assets/layout.json').toString('utf8');
const game = read('src/game.js').toString('utf8');
if (game.includes('</script')) throw new Error('game.js must not contain a closing script tag');

const html = read('src/index.html').toString('utf8')
  .replace('/*__LAYOUT__*/', () => `window.LAYOUT = ${layout};`)
  .replace('/*__GLB__*/', () => `window.HOUSE_GLB_B64 = "${glb}";`)
  .replace('/*__GAME__*/', () => game);

fs.mkdirSync(path.join(here, 'dist'), { recursive: true });
const out = path.join(here, 'dist', 'bhai_phota.html');
fs.writeFileSync(out, html);
console.log(`built ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

// Empaqueta el build de Vite en un único HTML autocontenido (JS y CSS en línea).
// Útil para itch.io, para compartir un solo archivo o para publicarlo como página.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const outDir = new URL('../dist-single/', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');

const assets = readdirSync(join(dist, 'assets'));
const read = (name) => readFileSync(join(dist, 'assets', name), 'utf8');
// Las fuentes (woff2) que pide el CSS van como data URI: el CSS en línea ya no está junto a ellas.
const inlineFonts = (css) =>
  css.replace(/url\(\.\/([^)]+\.woff2)\)/g, (_, file) => {
    const data = readFileSync(join(dist, 'assets', file)).toString('base64');
    return `url(data:font/woff2;base64,${data})`;
  });

html = html.replace(
  /<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+\.css)"[^>]*>/g,
  (_, file) => `<style>${inlineFonts(read(file))}</style>`,
);
html = html.replace(/<script type="module"[^>]*src="\.\/assets\/([^"]+\.js)"[^>]*><\/script>/g, (_, file) => {
  const code = read(file).replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${code}</script>`;
});
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');

const leftovers = html.match(/\.\/assets\/[^"')\s]+|url\(\.\/[^)]+\)/g);
if (leftovers) {
  console.error('Quedaron referencias a archivos externos:', leftovers);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
console.log(
  `dist-single/index.html (${(html.length / 1024 / 1024).toFixed(2)} MB, ${assets.length} archivos en línea)`,
);

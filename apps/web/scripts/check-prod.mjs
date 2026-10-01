// Comprueba un despliegue en producción. Uso: pnpm check:prod [url]; por defecto, https://ventisca.wpena.dev.
// Revisa el DNS sin el proxy de Cloudflare (D-58), el certificado (válido y con margen), las cabeceras, la
// redirección de HTTP a HTTPS, la salud, el commit desplegado (el último de main), el 404 y un turno jugado
// en Chromium sin pedir nada a otros dominios.
// Sale con código 1 si algo falla. Necesita Chromium de Playwright
// (pnpm --filter @ventisca/web exec playwright install chromium).
import { execFileSync } from 'node:child_process';
import { resolveCname } from 'node:dns/promises';
import { connect } from 'node:tls';
import { chromium } from '@playwright/test';
import { retry } from './retry.mjs';

const base = new URL(process.argv[2] ?? process.env.DEPLOY_URL ?? 'https://ventisca.wpena.dev');
const host = base.hostname;
const results = [];

async function check(name, fn) {
  try {
    results.push({ ok: true, name, detail: await fn() });
  } catch (err) {
    results.push({ ok: false, name, detail: err instanceof Error ? err.message : String(err) });
  }
}

function fail(message) {
  throw new Error(message);
}

/** El último commit de main en origin. El repositorio es público: se lee sin credenciales. */
function mainCommit() {
  try {
    const out = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], {
      encoding: 'utf8',
      // El error de git se captura para mostrarlo entero; si no, sale suelto por la terminal.
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    const commit = out.split(/\s/)[0];
    if (!commit) throw new Error('git ls-remote no devolvió ningún commit');
    return commit;
  } catch (err) {
    const stderr = String(/** @type {any} */ (err).stderr ?? '').trim();
    throw new Error(`no se pudo leer el commit de main: ${stderr || /** @type {Error} */ (err).message}`);
  }
}

const viaCloudflare = (headers) => {
  const found = ['cf-ray', 'cf-cache-status', 'nel'].filter((h) => headers.has(h));
  if (/cloudflare/i.test(headers.get('server') ?? '')) found.unshift(`server: ${headers.get('server')}`);
  if (/cloudflare/i.test(headers.get('report-to') ?? '')) found.push('report-to hacia Cloudflare');
  return found;
};

await check('DNS: CNAME hacia Railway, sin el proxy de Cloudflare (D-58)', async () => {
  const cnames = await resolveCname(host).catch(() => []);
  const target = cnames.find((c) => c.endsWith('.up.railway.app'));
  if (!target)
    fail(`no hay CNAME a *.up.railway.app (respuesta: ${cnames.join(', ') || 'ninguna'}); ¿el proxy sigue activo?`);
  return target;
});

// Se exige un certificado válido con margen de vigencia; el emisor es solo un dato. No sirve para
// detectar el proxy (Cloudflare también emite con Let's Encrypt): de eso se encargan el DNS y las cabeceras.
const MIN_DAYS_LEFT = 14;

await check(
  `Certificado válido para el dominio, con más de ${MIN_DAYS_LEFT} días de vigencia`,
  () =>
    new Promise((resolve, reject) => {
      const socket = connect({ host, port: 443, servername: host }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!socket.authorized) return reject(new Error(`no es válido: ${socket.authorizationError}`));
        const issuer = `${cert.issuer?.O ?? '?'} ${cert.issuer?.CN ?? ''}`.trim();
        const days = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000);
        if (days <= MIN_DAYS_LEFT) return reject(new Error(`vence en ${days} días (emisor: ${issuer})`));
        resolve(`vence en ${days} días (emisor: ${issuer})`);
      });
      socket.setTimeout(20_000, () => socket.destroy(new Error('sin respuesta en 20 s')));
      socket.on('error', reject);
    }),
);

await check('Cabeceras sin Cloudflare (server, cf-ray, nel)', async () => {
  const res = await fetch(base);
  const found = viaCloudflare(res.headers);
  if (found.length) fail(found.join(', '));
  if (!res.ok) fail(`estado ${res.status}`);
  return `${res.status}, server: ${res.headers.get('server') ?? '(sin cabecera)'}`;
});

await check('HTTP redirige a HTTPS desde Railway', async () => {
  const http = new URL(base);
  http.protocol = 'http:';
  const res = await fetch(http, { redirect: 'manual' });
  const location = res.headers.get('location') ?? '';
  if (![301, 302, 307, 308].includes(res.status) || !location.startsWith(`https://${host}`)) {
    fail(`estado ${res.status}, location: ${location || '(ninguna)'}`);
  }
  const found = viaCloudflare(res.headers);
  if (found.length) fail(`la redirección pasa por Cloudflare: ${found.join(', ')}`);
  return `${res.status} → ${location}`;
});

let health = null;
await check('Salud con la base de datos conectada', async () => {
  const res = await fetch(new URL('/api/health', base));
  health = await res.json().catch(() => null);
  if (res.status !== 200 || health?.ok !== true || health?.db !== 'ok') fail(`${res.status} ${JSON.stringify(health)}`);
  return JSON.stringify(health);
});

await check('Corre el último commit de main', async () => {
  // Leer origin falla a veces sin que el despliegue tenga nada que ver: se reintenta antes de fallar.
  const main = await retry(mainCommit);
  const deployed = health?.commit ?? null;
  if (!deployed) fail(`la salud no informa el commit (último de main: ${main?.slice(0, 7)})`);
  if (deployed !== main) {
    fail(`corre ${deployed.slice(0, 7)} y main va en ${main?.slice(0, 7)}: ¿Railway todavía no despliega?`);
  }
  return deployed.slice(0, 7);
});

await check('Una ruta inexistente da 404 con su código', async () => {
  const res = await fetch(new URL('/api/no-existe', base));
  const body = await res.json().catch(() => null);
  if (res.status !== 404 || body?.error?.code !== 'not_found') fail(`${res.status} ${JSON.stringify(body)}`);
  return `404 ${JSON.stringify(body)}`;
});

await check('Un turno jugado en Chromium, sin errores ni peticiones a otros dominios', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    const foreign = new Set();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      const url = r.url();
      if (!/^(data|blob):/.test(url) && new URL(url).host !== base.host) foreign.add(new URL(url).origin);
    });
    await page.goto(new URL('/?speed=0.3', base).toString());
    // "Jugar" hasta el PR 7; desde entonces, "Jugar sin cuenta".
    await page.getByRole('button', { name: /^Jugar( sin cuenta)?$/ }).click();
    await page.getByRole('heading', { name: 'Tu equipo' }).waitFor();
    await page.getByRole('button', { name: 'Comenzar partida' }).click();
    await page.getByRole('button', { name: /Confirmar turno/ }).waitFor({ timeout: 60_000 });
    // El turno terminó cuando "Confirmar turno" desaparece al resolverse y vuelve en el siguiente.
    await page.evaluate(() => {
      const w = /** @type {Window & { __turnDone?: boolean }} */ (window);
      let gone = false;
      new MutationObserver(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => /Confirmar turno/.test(b.textContent ?? ''));
        if (!btn || btn.disabled) gone = true;
        else if (gone) w.__turnDone = true;
      }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    for (let i = 0; i < 3; i++) await page.keyboard.press('s');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => /** @type {any} */ (window).__turnDone === true, null, { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    if (errors.length) fail(`errores en la página: ${errors.join(' | ')}`);
    if (foreign.size) fail(`pidió a otros dominios: ${[...foreign].join(', ')}`);
    return 'turno 1 resuelto; todo desde el propio dominio';
  } finally {
    await browser.close();
  }
});

console.log(`Despliegue en ${base.origin}\n`);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}\n    ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} comprobaciones fallaron.` : '\nTodo en orden.');
process.exit(failed ? 1 : 0);

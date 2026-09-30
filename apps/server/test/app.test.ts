import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { apiErrorSchema, healthSchema, type PublicConfig, publicConfigSchema } from '@ventisca/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, privateLogger } from '../src/app';
import { loadConfig, publicConfigFrom } from '../src/config';

const apps: ReturnType<typeof buildApp>[] = [];
const make = (opts: Partial<Parameters<typeof buildApp>[0]> = {}) => {
  const app = buildApp({ ping: async () => {}, webDist: null, logger: false, ...opts });
  apps.push(app);
  return app;
};
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('Servidor: API', () => {
  it('GET /api/health responde que el servidor y la base de datos están bien', async () => {
    const res = await make().inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(healthSchema.parse(res.json())).toEqual({ ok: true, db: 'ok', commit: null });
  });

  it('la salud informa el commit desplegado, para que check:prod lo compare con main', async () => {
    const res = await make({ commit: 'abc1234' }).inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ ok: true, db: 'ok', commit: 'abc1234' });
  });

  it('si la base de datos no responde, la salud da 503 con su código', async () => {
    const app = make({
      ping: async () => {
        throw new Error('conexión rechazada');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(apiErrorSchema.parse(res.json())).toEqual({ error: { code: 'db_unavailable' } });
  });

  it('una ruta que no existe da 404 con su código', async () => {
    const res = await make().inject({ method: 'GET', url: '/api/nada' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found' } });
  });
});

describe('Servidor: cliente', () => {
  it('sirve el juego desde el build del cliente', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'ventisca-web-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Ventisca</title>');
    const res = await make({ webDist: dist }).inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('<title>Ventisca</title>');
  });
});

describe('Servidor: registros', () => {
  it('no guardan la IP de quien pide, ni la directa ni la que llega por el proxy', async () => {
    const stream = new PassThrough();
    let logs = '';
    stream.on('data', (chunk) => {
      logs += chunk.toString();
    });
    const app = make({ logger: privateLogger('info', stream) });
    await app.inject({
      method: 'GET',
      url: '/api/health',
      remoteAddress: '203.0.113.7',
      headers: { 'x-forwarded-for': '198.51.100.23' },
    });
    expect(logs).toContain('/api/health');
    expect(logs).not.toContain('203.0.113.7');
    expect(logs).not.toContain('198.51.100.23');
  });
});

describe('Servidor: configuración pública (GET /api/config)', () => {
  const secrets = {
    SESSION_SECRET: 'sesion-secreta-de-prueba-que-no-debe-salir-nunca',
    RESEND_API_KEY: 're_clave_de_resend_de_prueba',
    TURNSTILE_SECRET_KEY: '0x4AAAAAAA-secreta-de-turnstile-de-prueba',
    DATABASE_URL: 'postgres://ventisca:contrasena-de-la-base@db.internal:5432/ventisca',
  };

  it('solo entrega valores públicos: ni el nombre ni el valor de ninguna variable secreta', async () => {
    const config = loadConfig({
      ...secrets,
      NODE_ENV: 'production',
      APP_URL: 'https://ventisca.wpena.dev',
      TURNSTILE_SITE_KEY: '0x4AAAAAAFKgYxJudSXyBb7U',
    });
    const res = await make({ publicConfig: publicConfigFrom(config) }).inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    expect(publicConfigSchema.parse(res.json())).toEqual({ turnstileSiteKey: '0x4AAAAAAFKgYxJudSXyBb7U' });
    expect(Object.keys(res.json())).toEqual(['turnstileSiteKey']);
    for (const [name, value] of Object.entries(secrets)) {
      expect(res.body).not.toContain(name);
      expect(res.body).not.toContain(value);
    }
    expect(res.body).not.toContain('contrasena-de-la-base');
  });

  it('aunque le llegue un objeto con más campos, responde campo por campo solo los públicos', async () => {
    const leaky = { turnstileSiteKey: 'publica', sessionSecret: secrets.SESSION_SECRET } as PublicConfig;
    const res = await make({ publicConfig: leaky }).inject({ method: 'GET', url: '/api/config' });
    expect(res.json()).toEqual({ turnstileSiteKey: 'publica' });
    expect(res.body).not.toContain(secrets.SESSION_SECRET);
  });

  it('sin captcha configurado, la clave del sitio es null', async () => {
    const res = await make().inject({ method: 'GET', url: '/api/config' });
    expect(res.json()).toEqual({ turnstileSiteKey: null });
  });
});

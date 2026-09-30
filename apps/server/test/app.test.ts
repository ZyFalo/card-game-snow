import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { apiErrorSchema, healthSchema } from '@ventisca/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, privateLogger } from '../src/app';

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
    expect(healthSchema.parse(res.json())).toEqual({ ok: true, db: 'ok' });
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

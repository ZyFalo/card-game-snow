import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/ventisca',
  SESSION_SECRET: 'x'.repeat(48),
  APP_URL: 'https://ventisca.wpena.dev',
};

describe('Configuración del servidor', () => {
  it('con lo obligatorio usa el puerto, el host y el nivel de registro por defecto', () => {
    expect(loadConfig(base)).toEqual({
      production: false,
      databaseUrl: base.DATABASE_URL,
      sessionSecret: base.SESSION_SECRET,
      appUrl: base.APP_URL,
      devOrigin: null,
      resendApiKey: null,
      mailOutboxDir: null,
      turnstileSecretKey: null,
      turnstileSiteKey: null,
      commit: null,
      port: 3000,
      host: '0.0.0.0',
      logLevel: 'info',
    });
  });

  it('toma el puerto que da Railway en PORT y reconoce producción', () => {
    const config = loadConfig({ ...base, PORT: '8080', NODE_ENV: 'production' });
    expect(config.port).toBe(8080);
    expect(config.production).toBe(true);
  });

  it('sin DATABASE_URL, SESSION_SECRET o APP_URL no arranca y dice cuál falta', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, SESSION_SECRET: undefined })).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ ...base, APP_URL: undefined })).toThrow(/APP_URL/);
  });

  it('el commit desplegado sale de Railway en ejecución o, si no, del que horneó el Dockerfile', () => {
    expect(loadConfig({ ...base, RAILWAY_GIT_COMMIT_SHA: 'aaa', APP_COMMIT: 'bbb' }).commit).toBe('aaa');
    expect(loadConfig({ ...base, APP_COMMIT: 'bbb' }).commit).toBe('bbb');
    // El ARG sin valor deja APP_COMMIT vacío: eso es "sin commit".
    expect(loadConfig({ ...base, APP_COMMIT: '' }).commit).toBeNull();
  });

  it('las claves vacías cuentan como ausentes', () => {
    const config = loadConfig({ ...base, RESEND_API_KEY: '', TURNSTILE_SECRET_KEY: '', TURNSTILE_SITE_KEY: '' });
    expect([config.resendApiKey, config.turnstileSecretKey, config.turnstileSiteKey]).toEqual([null, null, null]);
  });

  it('la carpeta de correos de las e2e no se acepta en producción', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', MAIL_OUTBOX_DIR: '/tmp/correos' })).toThrow(
      /MAIL_OUTBOX_DIR/,
    );
    expect(loadConfig({ ...base, MAIL_OUTBOX_DIR: '/tmp/correos' }).mailOutboxDir).toBe('/tmp/correos');
  });

  it('D-65: el origen de desarrollo no se acepta en producción', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', DEV_ORIGIN: 'http://localhost:5173' })).toThrow(
      /DEV_ORIGIN/,
    );
    expect(loadConfig({ ...base, DEV_ORIGIN: 'http://localhost:5173' }).devOrigin).toBe('http://localhost:5173');
    expect(() => loadConfig({ ...base, DEV_ORIGIN: 'http://localhost:5173/' })).toThrow(/DEV_ORIGIN/);
  });

  it('SESSION_SECRET necesita al menos 32 caracteres', () => {
    expect(() => loadConfig({ ...base, SESSION_SECRET: 'corto' })).toThrow(/SESSION_SECRET: debe tener al menos 32/);
  });

  it('APP_URL va sin barra final ni ruta', () => {
    expect(() => loadConfig({ ...base, APP_URL: 'https://ventisca.wpena.dev/' })).toThrow(/APP_URL/);
    expect(() => loadConfig({ ...base, APP_URL: 'ventisca.wpena.dev' })).toThrow(/APP_URL/);
  });

  it('el error nombra la variable pero nunca muestra su valor, que puede traer la contraseña', () => {
    let message = '';
    try {
      loadConfig({
        ...base,
        DATABASE_URL: 'mysql://root:secreto@db/ventisca',
        SESSION_SECRET: 'clave-corta',
        PORT: 'x',
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/SESSION_SECRET/);
    expect(message).toMatch(/PORT/);
    expect(message).not.toMatch(/secreto|clave-corta/);
  });
});

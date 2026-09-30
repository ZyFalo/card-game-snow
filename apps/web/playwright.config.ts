import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

/*
 * Pruebas en Chromium, contra el cliente de Vite y el servidor de verdad (con Postgres). En equipos sin
 * GPU se puede forzar el render por software con PW_SWIFTSHADER=1; PW_CHROMIUM_PATH permite usar un
 * Chromium ya instalado.
 *
 * El servidor arranca con una base propia, `ventisca_e2e`, que recrea en cada corrida en el Postgres de
 * DATABASE_URL_TEST (el del .env local con docker compose up -d db, o el de la CI): la base de desarrollo
 * no se toca. Los correos no se envían: se guardan en E2E_OUTBOX, donde las pruebas leen los códigos.
 */
const swiftshader = process.env.PW_SWIFTSHADER === '1';
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  /* sin .env: la CI da DATABASE_URL_TEST */
}
export const E2E_OUTBOX = fileURLToPath(new URL('./.e2e-outbox', import.meta.url));
const API_PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: swiftshader
        ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
        : [],
    },
  },
  webServer: [
    {
      command: 'node ./node_modules/vite/bin/vite.js --port 5174 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: true,
      timeout: 60_000,
      env: { VENTISCA_API: `http://127.0.0.1:${API_PORT}` },
    },
    {
      command: '../server/node_modules/.bin/tsx ../server/test/support/e2e-server.ts',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        DATABASE_URL_TEST: process.env.DATABASE_URL_TEST ?? '',
        SESSION_SECRET: 'solo-para-las-pruebas-e2e-no-es-un-secreto',
        APP_URL: 'http://127.0.0.1:5174',
        MAIL_OUTBOX_DIR: E2E_OUTBOX,
        // Vacías a propósito, aunque el .env las traiga: las pruebas no envían correos reales ni llaman a
        // Cloudflare. Sin clave secreta, el servidor de pruebas no verifica el captcha.
        RESEND_API_KEY: '',
        TURNSTILE_SECRET_KEY: '',
        // La clave del sitio de prueba de Cloudflare; las pruebas reemplazan su script por uno falso.
        TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
        LOG_LEVEL: 'warn',
      },
    },
  ],
});

import { rmSync } from 'node:fs';
import pg from 'pg';
import { E2E_DATABASE, e2eDatabaseUrl } from './e2e-database';

/*
 * El servidor de las pruebas e2e (lo arranca apps/web/playwright.config.ts). Antes de arrancar, recrea la
 * base de las e2e en el Postgres de DATABASE_URL_TEST y vacía la carpeta de correos: cada corrida
 * empieza limpia y la base de desarrollo no se toca.
 */
const adminUrl = process.env.DATABASE_URL_TEST;
if (!adminUrl) {
  throw new Error('Las e2e necesitan DATABASE_URL_TEST: corre docker compose up -d db y revisa el .env.');
}
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
await admin.query(`drop database if exists "${E2E_DATABASE}" with (force)`);
await admin.query(`create database "${E2E_DATABASE}"`);
await admin.end();

process.env.DATABASE_URL = e2eDatabaseUrl(adminUrl);
if (process.env.MAIL_OUTBOX_DIR) rmSync(process.env.MAIL_OUTBOX_DIR, { recursive: true, force: true });

await import('../../src/main');

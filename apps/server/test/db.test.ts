import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, type Database } from '../src/db';

/*
 * Migraciones contra un Postgres de verdad. DATABASE_URL_TEST apunta a un servidor donde se puedan
 * crear bases: cada corrida crea la suya, temporal, y la borra al terminar. Sin la variable, se salta
 * (la CI siempre la define).
 */
const adminUrl = process.env.DATABASE_URL_TEST;
const name = `ventisca_test_${process.pid}_${Date.now()}`;

describe.skipIf(!adminUrl)('Base de datos (DATABASE_URL_TEST)', () => {
  let admin: pg.Client;
  let testUrl: string;
  let database: Database;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`create database "${name}"`);
    const url = new URL(adminUrl as string);
    url.pathname = `/${name}`;
    testUrl = url.toString();
    database = connect(testUrl);
  });

  afterAll(async () => {
    await database?.close();
    await admin?.query(`drop database if exists "${name}"`);
    await admin?.end();
  });

  it('responde a la comprobación de salud', async () => {
    await expect(database.ping()).resolves.toBeUndefined();
  });

  it('aplica las migraciones del repositorio y deja registro de cada una', async () => {
    await database.migrate();
    const client = new pg.Client({ connectionString: testUrl });
    await client.connect();
    const table = await client.query(`select to_regclass('drizzle.__drizzle_migrations') as t`);
    await client.end();
    expect(table.rows[0].t).toBe('drizzle.__drizzle_migrations');
  });

  it('volver a migrar no hace nada: las migraciones aplicadas se saltan', async () => {
    await expect(database.migrate()).resolves.toBeUndefined();
  });
});

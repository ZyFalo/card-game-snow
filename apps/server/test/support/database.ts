import pg from 'pg';
import { afterAll, beforeAll } from 'vitest';
import { connect, type Database } from '../../src/db';

/*
 * Base temporal para las pruebas que usan Postgres. DATABASE_URL_TEST apunta a un servidor donde se
 * puedan crear bases: cada archivo de pruebas crea la suya, le aplica las migraciones y la borra al
 * terminar. Sin la variable, esas pruebas se saltan (la CI siempre la define).
 */
export const adminUrl = process.env.DATABASE_URL_TEST;

export function useTempDatabase(opts: { migrate?: boolean } = {}) {
  const name = `ventisca_test_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const ctx = {} as { url: string; database: Database };
  let admin: pg.Client | undefined;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`create database "${name}"`);
    const url = new URL(adminUrl as string);
    url.pathname = `/${name}`;
    ctx.url = url.toString();
    ctx.database = connect(ctx.url);
    if (opts.migrate) await ctx.database.migrate();
  });

  afterAll(async () => {
    await ctx.database?.close();
    await admin?.query(`drop database if exists "${name}"`);
    await admin?.end();
  });

  return ctx;
}

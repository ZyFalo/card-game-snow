import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { adminUrl, useTempDatabase } from './support/database';

/* Migraciones contra un Postgres de verdad (DATABASE_URL_TEST); sin la variable, se saltan. */
describe.skipIf(!adminUrl)('Base de datos (DATABASE_URL_TEST)', () => {
  const ctx = useTempDatabase();

  it('responde a la comprobación de salud', async () => {
    await expect(ctx.database.ping()).resolves.toBeUndefined();
  });

  it('aplica las migraciones del repositorio y deja registro de cada una', async () => {
    await ctx.database.migrate();
    const client = new pg.Client({ connectionString: ctx.url });
    await client.connect();
    const tables = await client.query(
      `select to_regclass('drizzle.__drizzle_migrations') as log, to_regclass('public.users') as users,
              to_regclass('public.sessions') as sessions, to_regclass('public.email_codes') as codes`,
    );
    await client.end();
    expect(tables.rows[0]).toEqual({
      log: 'drizzle.__drizzle_migrations',
      users: 'users',
      sessions: 'sessions',
      codes: 'email_codes',
    });
  });

  it('volver a migrar no hace nada: las migraciones aplicadas se saltan', async () => {
    await expect(ctx.database.migrate()).resolves.toBeUndefined();
  });
});

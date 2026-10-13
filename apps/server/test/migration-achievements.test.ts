import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../src/db';
import { adminUrl, useTempDatabase } from './support/database';

/*
 * La migración del avance de los logros (D-104), contra un Postgres de verdad: una base que ya tenía los
 * logros de la Beta pasa a la tabla nueva. Sin DATABASE_URL_TEST, se salta.
 */
describe.skipIf(!adminUrl)('Migración del avance de los logros (DATABASE_URL_TEST)', () => {
  const ctx = useTempDatabase();
  const MIGRATION = '0005_avance_de_logros';
  /** Las migraciones del repositorio hasta la anterior a esta: así estaba la base de la Beta. */
  const before = mkdtempSync(join(tmpdir(), 'ventisca-migraciones-'));
  afterAll(() => rmSync(before, { recursive: true, force: true }));

  it('D-104: los logros de la Beta se reinician, y las monedas ya ganadas se conservan', async () => {
    cpSync(MIGRATIONS_DIR, before, { recursive: true });
    rmSync(join(before, `${MIGRATION}.sql`));
    const journalPath = join(before, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
    expect(journal.entries.at(-1)?.tag).toBe(MIGRATION);
    journal.entries.pop();
    writeFileSync(journalPath, JSON.stringify(journal));
    await ctx.database.migrate(before);

    const client = new pg.Client({ connectionString: ctx.url });
    await client.connect();
    try {
      // Una cuenta de la Beta: 180 monedas ganadas en una partida, y dos logros de los de antes.
      const user = (
        await client.query(
          `insert into users (email, password_hash, display_name, display_name_key)
           values ('beta@example.com', 'x', 'Beta', 'beta') returning id`,
        )
      ).rows[0].id as string;
      await client.query(`insert into profiles (user_id, camino_element, coins) values ($1, 'snow', 180)`, [user]);
      const match = (
        await client.query(
          `insert into matches (difficulty, seed, status, outcome) values ('classic', 7, 'finished', 'victory') returning id`,
        )
      ).rows[0].id as string;
      await client.query(
        `insert into coin_ledger (user_id, match_id, round, amount) values ($1, $2, '1', 60), ($1, $2, '2', 120)`,
        [user, match],
      );
      await client.query(
        `insert into achievements (user_id, achievement_id, match_id) values ($1, 'combo2', $2), ($1, 'reviver', $2)`,
        [user, match],
      );

      await ctx.database.migrate();

      expect((await client.query('select * from achievements')).rows).toEqual([]);
      expect((await client.query('select coins from profiles where user_id = $1', [user])).rows).toEqual([
        { coins: 180 },
      ]);
      const ledger = await client.query('select round, amount from coin_ledger where user_id = $1 order by round', [
        user,
      ]);
      expect(ledger.rows).toEqual([
        { round: '1', amount: 60 },
        { round: '2', amount: 120 },
      ]);
      // La tabla nueva: el avance de cada logro, sin la partida en que se ganó.
      const columns = await client.query(
        `select column_name, is_nullable from information_schema.columns
         where table_name = 'achievements' order by column_name`,
      );
      expect(columns.rows).toEqual([
        { column_name: 'achievement_id', is_nullable: 'NO' },
        { column_name: 'progress', is_nullable: 'NO' },
        { column_name: 'unlocked_at', is_nullable: 'YES' },
        { column_name: 'user_id', is_nullable: 'NO' },
      ]);
      // El avance empieza en cero, sin completar, y no puede ser negativo.
      await client.query(`insert into achievements (user_id, achievement_id) values ($1, 'reviver')`, [user]);
      expect((await client.query('select progress, unlocked_at from achievements')).rows).toEqual([
        { progress: 0, unlocked_at: null },
      ]);
      await expect(client.query('update achievements set progress = -1')).rejects.toThrow(
        /achievements_progress_check/,
      );
    } finally {
      await client.end();
    }
  });
});

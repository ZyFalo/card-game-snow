import { eq } from 'drizzle-orm';
import { connect } from '../../src/db';
import { creditRound } from '../../src/progress/store';
import { matches, users } from '../../src/schema';
import { e2eDatabaseUrl } from './e2e-database';

/*
 * Solo para las pruebas e2e: le paga partidas completas a una cuenta de la base de las e2e, con la
 * misma función con que el servidor acredita las rondas de una partida (R-29). Así las pruebas de la
 * tienda no tienen que jugar una partida entera para tener monedas; el servidor no tiene ninguna ruta
 * que las regale.
 *
 * Uso: DATABASE_URL_TEST=… tsx e2e-coins.ts <correo> [partidas]
 */
const [email, count = '1'] = process.argv.slice(2);
const adminUrl = process.env.DATABASE_URL_TEST;
if (!adminUrl || !email) throw new Error('Uso: DATABASE_URL_TEST=… tsx e2e-coins.ts <correo> [partidas]');

const database = connect(e2eDatabaseUrl(adminUrl));
try {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error(`No hay una cuenta con el correo ${email}.`);
  for (let i = 0; i < Number(count); i++) {
    // Cada cobro del libro apunta a su partida: una ya terminada, que nadie jugó.
    const [match] = await database.db
      .insert(matches)
      .values({ difficulty: 'classic', seed: 0, status: 'finished', outcome: 'victory', bonusOutcome: 'won' })
      .returning({ id: matches.id });
    if (!match) throw new Error('No se pudo crear la partida.');
    for (const round of [1, 2, 3, 'bonus'] as const) {
      await creditRound(database.db, { userId: user.id, matchId: match.id, round, doubled: false }, new Date());
    }
  }
} finally {
  await database.close();
}

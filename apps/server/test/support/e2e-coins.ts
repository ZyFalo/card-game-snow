import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { connect } from '../../src/db';
import { creditRound } from '../../src/progress/store';
import { users } from '../../src/schema';
import { e2eDatabaseUrl } from './e2e-database';

/*
 * Solo para las pruebas e2e: le paga partidas completas a una cuenta de la base de las e2e, con la
 * misma función que usará el servidor al resolver cada ronda (R-29). Hasta que existan las partidas en
 * línea (M8) no hay otra forma de tener monedas, y el servidor no tiene ninguna ruta que las regale.
 *
 * Uso: DATABASE_URL_TEST=… tsx e2e-coins.ts <correo> [partidas]
 */
const [email, matches = '1'] = process.argv.slice(2);
const adminUrl = process.env.DATABASE_URL_TEST;
if (!adminUrl || !email) throw new Error('Uso: DATABASE_URL_TEST=… tsx e2e-coins.ts <correo> [partidas]');

const database = connect(e2eDatabaseUrl(adminUrl));
try {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error(`No hay una cuenta con el correo ${email}.`);
  for (let i = 0; i < Number(matches); i++) {
    const matchId = randomUUID();
    for (const round of [1, 2, 3, 'bonus'] as const) {
      await creditRound(database.db, { userId: user.id, matchId, round, doubled: false }, new Date());
    }
  }
} finally {
  await database.close();
}

import { ACHIEVEMENT_IDS } from '@ventisca/core';
import { eq } from 'drizzle-orm';
import { connect } from '../../src/db';
import { achievements, users } from '../../src/schema';
import { e2eDatabaseUrl } from './e2e-database';

/*
 * Solo para las pruebas e2e: le da a una cuenta de la base de las e2e todos los logros, o todos menos uno,
 * escribiéndolos en la tabla donde el servidor los cuenta (R-55). Así una prueba del doble de monedas
 * (R-29) no tiene que ganar los 9 jugando; el servidor no tiene ninguna ruta que los regale.
 *
 * Uso: DATABASE_URL_TEST=… tsx e2e-achievements.ts <correo> [logro que falta]
 */
const [email, missing] = process.argv.slice(2);
const adminUrl = process.env.DATABASE_URL_TEST;
if (!adminUrl || !email) throw new Error('Uso: DATABASE_URL_TEST=… tsx e2e-achievements.ts <correo> [logro que falta]');
if (missing !== undefined && !(ACHIEVEMENT_IDS as readonly string[]).includes(missing)) {
  throw new Error(`No existe el logro ${missing}.`);
}

const database = connect(e2eDatabaseUrl(adminUrl));
try {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error(`No hay una cuenta con el correo ${email}.`);
  await database.db
    .insert(achievements)
    .values(ACHIEVEMENT_IDS.filter((id) => id !== missing).map((achievementId) => ({ userId: user.id, achievementId })))
    .onConflictDoNothing();
} finally {
  await database.close();
}

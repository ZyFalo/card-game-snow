import { ACHIEVEMENT_IDS, type AchievementId, achievementGoal } from '@ventisca/core';
import { eq } from 'drizzle-orm';
import { connect } from '../../src/db';
import { achievements, users } from '../../src/schema';
import { e2eDatabaseUrl } from './e2e-database';

/*
 * Solo para las pruebas e2e: deja el avance de los logros de una cuenta de la base de las e2e como la
 * prueba lo necesita, escribiéndolo en la tabla donde el servidor lo cuenta (R-55). Así una prueba del
 * doble de monedas (R-29) no tiene que completar el amuleto jugando; el servidor no tiene ninguna ruta que
 * regale logros.
 *
 * Uso: DATABASE_URL_TEST=… tsx e2e-achievements.ts <correo> <avance>
 * `avance` es un JSON con lo que lleva contado cada logro, por su id; `"all"` deja completos todos los que
 * no nombre. Un número negativo dice cuánto le falta para su meta: `-1`, que le falta una vez. Lo que llega
 * a la meta queda completo.
 */
const [email, text = '{"all":true}'] = process.argv.slice(2);
const adminUrl = process.env.DATABASE_URL_TEST;
if (!adminUrl || !email) throw new Error('Uso: DATABASE_URL_TEST=… tsx e2e-achievements.ts <correo> <avance>');
const { all = false, ...counts } = JSON.parse(text) as { all?: boolean } & Partial<Record<AchievementId, number>>;
for (const id of Object.keys(counts)) {
  if (!(ACHIEVEMENT_IDS as readonly string[]).includes(id)) throw new Error(`No existe el logro ${id}.`);
}

const database = connect(e2eDatabaseUrl(adminUrl));
try {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error(`No hay una cuenta con el correo ${email}.`);
  const rows = ACHIEVEMENT_IDS.flatMap((achievementId) => {
    const goal = achievementGoal(achievementId);
    const want = counts[achievementId] ?? (all ? goal : 0);
    const progress = Math.max(0, Math.min(goal, want < 0 ? goal + want : want));
    const unlockedAt = progress >= goal ? new Date() : null;
    return progress > 0 ? [{ userId: user.id, achievementId, progress, unlockedAt }] : [];
  });
  await database.db.delete(achievements).where(eq(achievements.userId, user.id));
  if (rows.length > 0) await database.db.insert(achievements).values(rows);
} finally {
  await database.close();
}

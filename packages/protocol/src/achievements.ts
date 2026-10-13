import { ACHIEVEMENT_IDS } from '@ventisca/core';
import { z } from 'zod';

/*
 * El avance de los logros (R-55 y D-104), tal como viaja del servidor al cliente: en el progreso de la
 * cuenta y al terminar una partida en línea. Lo cuenta y lo guarda el servidor; el cliente solo lo muestra.
 * Cada persona recibe el suyo, y nadie más lo ve.
 */

/** El avance de un logro: las veces que lleva contadas, sin pasar de su meta, y si ya lo completó. */
export const achievementProgressSchema = z.object({
  count: z.number().int().nonnegative(),
  done: z.boolean(),
});
export type AchievementProgress = z.infer<typeof achievementProgressSchema>;

/** El avance de la cuenta en los 12 logros, por id. */
export const achievementsSchema = z.record(z.enum(ACHIEVEMENT_IDS), achievementProgressSchema);
export type Achievements = z.infer<typeof achievementsSchema>;

import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

/* Conexión a Postgres con Drizzle (D-52). */

/** Migraciones del repositorio. Funciona igual desde src/ (desarrollo) que desde dist/ (imagen). */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

export function connect(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return {
    db,
    /** Comprueba que la base responde (salud del servicio). */
    ping: async (): Promise<void> => {
      await pool.query('select 1');
    },
    /** Aplica las migraciones pendientes; las ya aplicadas se saltan. */
    migrate: (folder = MIGRATIONS_DIR) => migrate(db, { migrationsFolder: folder }),
    close: () => pool.end(),
  };
}

export type Database = ReturnType<typeof connect>;

import { defineConfig } from 'vitest/config';

// Variables del .env local (sin versionar), como DATABASE_URL_TEST para las pruebas del servidor.
try {
  process.loadEnvFile('.env');
} catch {
  /* sin .env: las pruebas que necesitan Postgres se saltan */
}

export default defineConfig({
  test: {
    include: [
      'packages/**/test/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
      'apps/web/scripts/**/*.test.mjs',
      'apps/server/test/**/*.test.ts',
    ],
    environment: 'node',
  },
});

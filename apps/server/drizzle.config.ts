import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` compara src/schema.ts con las migraciones y escribe la siguiente en drizzle/ (D-52).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
});

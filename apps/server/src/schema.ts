/*
 * Esquema de Postgres (Drizzle, D-52). Cada tabla llega con la función que la usa: las de cuentas
 * (users, sessions y email_codes) en el PR 5 del M7. Tras cambiarlo, `pnpm db:generate` escribe la
 * migración en drizzle/ y el servidor la aplica al arrancar.
 */
export {};

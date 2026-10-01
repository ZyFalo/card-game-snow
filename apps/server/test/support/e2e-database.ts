/** La base de las pruebas e2e: se recrea en cada corrida, y la de desarrollo no se toca. */
export const E2E_DATABASE = 'ventisca_e2e';

/** La URL de la base de las e2e en el Postgres de `adminUrl` (DATABASE_URL_TEST). */
export function e2eDatabaseUrl(adminUrl: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
}

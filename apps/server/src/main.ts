import { fileURLToPath } from 'node:url';
import { devMailer, noMailer } from './accounts/mailer';
import { buildApp, privateLogger } from './app';
import { loadConfig } from './config';
import { connect } from './db';

/* Arranque: configuración, migraciones pendientes y servidor. Railway manda SIGTERM al reemplazarlo. */

/** Build del cliente. Funciona igual desde src/ (desarrollo) que desde dist/ (imagen). */
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

const config = loadConfig(process.env);
const database = connect(config.databaseUrl);
const app = buildApp({
  ping: database.ping,
  webDist: WEB_DIST,
  logger: privateLogger(config.logLevel),
  accounts: {
    db: database.db,
    // Resend llega con el PR 6. Hasta entonces, en producción no se envían correos.
    mailer: config.production ? noMailer : devMailer,
    secret: config.sessionSecret,
    appUrl: config.appUrl,
  },
});

try {
  await database.migrate();
  app.log.info('Migraciones al día');
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.fatal({ err }, 'No se pudo arrancar el servidor');
  await database.close();
  process.exit(1);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'Cerrando');
    await app.close();
    await database.close();
    process.exit(0);
  });
}

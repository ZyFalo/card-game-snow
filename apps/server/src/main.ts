import { fileURLToPath } from 'node:url';
import { missingCaptcha, noCaptcha, turnstile } from './accounts/captcha';
import { devMailer, fileMailer, noMailer } from './accounts/mailer';
import { resendMailer } from './accounts/resend';
import { buildApp, privateLogger } from './app';
import { loadConfig, publicConfigFrom } from './config';
import { connect } from './db';

/* Arranque: configuración, migraciones pendientes y servidor. Railway manda SIGTERM al reemplazarlo. */

/** Build del cliente. Funciona igual desde src/ (desarrollo) que desde dist/ (imagen). */
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

const config = loadConfig(process.env);
const database = connect(config.databaseUrl);
/** Resend si hay clave; si no, ningún envío en producción, y la consola o la carpeta de las e2e fuera de ella. */
const mailer = config.resendApiKey
  ? resendMailer(config.resendApiKey)
  : config.production
    ? noMailer
    : config.mailOutboxDir
      ? fileMailer(config.mailOutboxDir)
      : devMailer;
/** Turnstile si hay clave; en producción exige que el desafío se haya resuelto en el dominio del juego. */
const captcha = config.turnstileSecretKey
  ? turnstile(config.turnstileSecretKey, config.production ? new URL(config.appUrl).hostname : null)
  : config.production
    ? missingCaptcha
    : noCaptcha;

const app = buildApp({
  ping: database.ping,
  commit: config.commit,
  publicConfig: publicConfigFrom(config),
  webDist: WEB_DIST,
  logger: privateLogger(config.logLevel),
  devOrigin: config.devOrigin,
  accounts: {
    db: database.db,
    mailer,
    captcha,
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

import { fileURLToPath } from 'node:url';
import { missingCaptcha, noCaptcha, turnstile } from './accounts/captcha';
import { devMailer, fileMailer, noMailer } from './accounts/mailer';
import { resendMailer } from './accounts/resend';
import { type AppOptions, buildApp, privateLogger } from './app';
import { loadConfig, publicConfigFrom } from './config';
import { connect } from './db';
import { dbStore } from './play/store';

/*
 * Arranque: configuración, migraciones pendientes y servidor. Railway manda SIGTERM al reemplazarlo.
 * `main.ts` lo llama sin opciones. El servidor de las pruebas e2e le pasa sus plazos del juego en línea,
 * para que una prueba no dependa del reloj de verdad ni de lo cargado que esté el equipo, y lo apaga y lo
 * vuelve a arrancar para probar un reinicio (R-54).
 */

/** Build del cliente. Funciona igual desde src/ (desarrollo) que desde dist/ (imagen). */
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

/** Lo que las pruebas pueden cambiar al arrancar: los plazos del juego en línea y el tablero de sus partidas. */
export type StartOptions = Pick<AppOptions, 'playTimings' | 'matchSeed' | 'matchPrepare'>;

/** El servidor en marcha. */
export interface Running {
  /**
   * Lo apaga como en un despliegue: las partidas en curso se interrumpen con sus cuentas (R-54), se cierran
   * las conexiones y se suelta la base. Llamarlo otra vez no hace nada más.
   */
  stop(): Promise<void>;
}

const SIGNALS = ['SIGTERM', 'SIGINT'] as const;

export async function start(
  options: StartOptions = {},
  env: Record<string, string | undefined> = process.env,
): Promise<Running> {
  const config = loadConfig(env);
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
    ...options,
  });

  try {
    await database.migrate();
    app.log.info('Migraciones al día');
    // Las partidas que quedaron a medias por un reinicio se pierden (R-54): se acreditan sus rondas ya
    // terminadas, y cada persona se entera la próxima vez que entre a jugar en línea.
    const lost = await dbStore(database.db).interrupt(null);
    if (lost > 0) app.log.warn({ matches: lost }, 'Partidas interrumpidas por el reinicio del servidor');
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.fatal({ err }, 'No se pudo arrancar el servidor');
    await database.close();
    process.exit(1);
  }

  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      for (const signal of SIGNALS) process.off(signal, onSignal);
      await app.close();
      await database.close();
    })();
    return stopping;
  };
  const onSignal = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'Cerrando');
    await stop();
    process.exit(0);
  };
  for (const signal of SIGNALS) process.once(signal, onSignal);
  return { stop };
}

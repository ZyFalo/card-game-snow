import type { PublicConfig } from '@ventisca/protocol';
import { z } from 'zod';

/*
 * Configuración del servidor, leída de las variables de entorno. En desarrollo vienen del archivo
 * .env (sin versionar, copia de .env.example); en Railway, de las variables del servicio. Si falta o
 * sobra algo, el servidor no arranca y dice qué variable revisar, sin mostrar su valor.
 */

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'debe empezar con postgres://'),
  // Clave de las huellas HMAC de sesiones y códigos. En producción: openssl rand -base64 48.
  SESSION_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  // Dirección pública del juego, sin barra final: https://ventisca.wpena.dev en producción.
  APP_URL: z.string().regex(/^https?:\/\/[^/\s]+$/, 'debe ser http(s)://dominio, sin ruta ni barra final'),
  // Resend (PR 6). Sin clave: en desarrollo el correo se imprime en la consola; en producción no sale.
  RESEND_API_KEY: z.string().optional(),
  // Solo pruebas e2e, fuera de producción: carpeta donde se guardan los correos en vez de enviarlos.
  MAIL_OUTBOX_DIR: z.string().optional(),
  // Turnstile. La secreta verifica el registro; la del sitio es pública y la entrega /api/config.
  TURNSTILE_SECRET_KEY: z.string().optional(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  // Commit desplegado: Railway lo da en tiempo de ejecución; APP_COMMIT lo hornea el Dockerfile.
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
  APP_COMMIT: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export interface Config {
  production: boolean;
  databaseUrl: string;
  sessionSecret: string;
  appUrl: string;
  resendApiKey: string | null;
  mailOutboxDir: string | null;
  turnstileSecretKey: string | null;
  turnstileSiteKey: string | null;
  commit: string | null;
  port: number;
  host: string;
  logLevel: (typeof LOG_LEVELS)[number];
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuración inválida. Revisa estas variables de entorno:\n- ${problems.join('\n- ')}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production' && e.MAIL_OUTBOX_DIR) {
    throw new Error('Configuración inválida: MAIL_OUTBOX_DIR es solo para pruebas y no se usa en producción.');
  }
  return {
    production: e.NODE_ENV === 'production',
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET,
    appUrl: e.APP_URL,
    resendApiKey: e.RESEND_API_KEY || null,
    mailOutboxDir: e.MAIL_OUTBOX_DIR || null,
    turnstileSecretKey: e.TURNSTILE_SECRET_KEY || null,
    turnstileSiteKey: e.TURNSTILE_SITE_KEY || null,
    commit: e.RAILWAY_GIT_COMMIT_SHA || e.APP_COMMIT || null,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
  };
}

/** Los únicos valores de la configuración que puede ver el navegador (GET /api/config). */
export function publicConfigFrom(config: Config): PublicConfig {
  return { turnstileSiteKey: config.turnstileSiteKey };
}

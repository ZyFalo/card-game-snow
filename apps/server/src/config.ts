import { z } from 'zod';

/*
 * Configuración del servidor, leída de las variables de entorno. En desarrollo vienen del archivo
 * .env (sin versionar, copia de .env.example); en Railway, de las variables del servicio. Si falta o
 * sobra algo, el servidor no arranca y dice qué variable revisar, sin mostrar su valor.
 */

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'debe empezar con postgres://'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export interface Config {
  databaseUrl: string;
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
  return { databaseUrl: e.DATABASE_URL, port: e.PORT, host: e.HOST, logLevel: e.LOG_LEVEL };
}

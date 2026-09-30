import { z } from 'zod';

/*
 * Protocolo entre el cliente y el servidor (D-53). Cada entrada de la API y cada mensaje del juego
 * se valida con estos esquemas en los dos lados. Crece con cada paso del M7: cuentas y progreso.
 * Los datos de cuenta viajan siempre en el cuerpo, nunca en la URL: los registros guardan la URL.
 */

/** Códigos de error de la API. El cliente decide el texto; el servidor nunca manda mensajes para la persona. */
export const errorCodeSchema = z.enum([
  'bad_request',
  'not_found',
  'internal',
  'db_unavailable',
  'unauthorized',
  'email_unavailable',
  'privacy_not_accepted',
  'name_taken',
  'name_not_allowed',
  'weak_password',
  'invalid_code',
  'code_expired',
  'too_many_attempts',
  'invalid_credentials',
  'email_not_verified',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * `reason` precisa el error cuando la persona puede corregirlo: qué regla de la contraseña (R-45) o
 * del nombre falló, o qué campo llegó mal. `attemptsLeft`: intentos que le quedan al código (R-43).
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    reason: z.string().optional(),
    attemptsLeft: z.number().int().nonnegative().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiError = (code: ErrorCode, extra: { reason?: string; attemptsLeft?: number } = {}): ApiError => ({
  error: { code, ...extra },
});

/** `GET /api/health`: el servidor responde y llega a la base de datos. */
export const healthSchema = z.object({ ok: z.literal(true), db: z.literal('ok') });
export type Health = z.infer<typeof healthSchema>;

/* ---------- Cuentas (R-43 a R-45) ---------- */

/** Solo tipos y tamaños máximos: las reglas (R-45, filtro de nombres) las aplica el servidor con su motivo. */
const email = z.string().trim().min(1).max(254);
const password = z.string().min(1).max(512);

/** Motivos de `weak_password` (R-45). */
export const passwordProblemSchema = z.enum([
  'length',
  'newline',
  'uppercase',
  'digit',
  'symbol',
  'common',
  'personal',
]);
export type PasswordProblem = z.infer<typeof passwordProblemSchema>;

/** Motivos de `name_not_allowed`. */
export const nameProblemSchema = z.enum(['length', 'characters', 'spaces', 'offensive', 'reserved']);
export type NameProblem = z.infer<typeof nameProblemSchema>;

/** `POST /api/auth/register` (R-44). */
export const registerSchema = z.object({
  email,
  password,
  displayName: z.string().max(64),
  acceptPrivacy: z.boolean(),
});
export type RegisterBody = z.infer<typeof registerSchema>;

/** `POST /api/auth/verify`: el código de 6 dígitos que llegó al correo (R-43). */
export const verifySchema = z.object({ email, code: z.string().regex(/^\d{6}$/) });
export type VerifyBody = z.infer<typeof verifySchema>;

/** `POST /api/auth/resend`: pide un código nuevo (R-43). */
export const resendSchema = z.object({ email });
export type ResendBody = z.infer<typeof resendSchema>;

/** `POST /api/auth/login`. */
export const loginSchema = z.object({ email, password });
export type LoginBody = z.infer<typeof loginSchema>;

/**
 * Respuesta de registrar o pedir un código: siempre la misma, exista o no la cuenta (D-59), para no
 * revelar qué correos están registrados.
 */
export const checkEmailSchema = z.object({ status: z.literal('check_email') });
export type CheckEmail = z.infer<typeof checkEmailSchema>;

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  verified: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

/** Respuesta de verificar, iniciar sesión y `GET /api/auth/me`. */
export const sessionSchema = z.object({ user: userSchema });
export type Session = z.infer<typeof sessionSchema>;

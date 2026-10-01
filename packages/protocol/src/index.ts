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
  'too_many_requests',
  'captcha_failed',
  'captcha_unavailable',
  'email_taken',
  'bad_origin',
  'camino_required',
  'camino_already_chosen',
  'not_enough_coins',
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

/**
 * `GET /api/health`: el servidor responde y llega a la base de datos. `commit` es el commit desplegado
 * (el repositorio es público), para que `pnpm check:prod` confirme que corre el último de main.
 */
export const healthSchema = z.object({ ok: z.literal(true), db: z.literal('ok'), commit: z.string().nullable() });
export type Health = z.infer<typeof healthSchema>;

/**
 * `GET /api/config`: lo que el cliente necesita saber del servidor en tiempo de ejecución. La clave
 * del sitio de Turnstile es pública (viaja al navegador en cada página); null si no hay captcha.
 */
export const publicConfigSchema = z.object({ turnstileSiteKey: z.string().nullable() });
export type PublicConfig = z.infer<typeof publicConfigSchema>;

/* ---------- Cuentas (R-43 a R-49) ---------- */

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

/** `POST /api/auth/register` (R-44). `captchaToken`: el token de Turnstile del formulario. */
export const registerSchema = z.object({
  email,
  password,
  displayName: z.string().max(64),
  acceptPrivacy: z.boolean(),
  captchaToken: z.string().min(1).max(2048),
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

/** `POST /api/auth/recover/request`: pide un código para recuperar la contraseña (R-46). */
export const recoverRequestSchema = z.object({ email });
export type RecoverRequestBody = z.infer<typeof recoverRequestSchema>;

/** `POST /api/auth/recover/confirm`: el código y la contraseña nueva (R-46). */
export const recoverConfirmSchema = z.object({ email, code: z.string().regex(/^\d{6}$/), password });
export type RecoverConfirmBody = z.infer<typeof recoverConfirmSchema>;

/** `POST /api/auth/password`: con la sesión iniciada, la actual y la nueva (R-47). */
export const changePasswordSchema = z.object({ currentPassword: password, newPassword: password });
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;

/** `POST /api/auth/email/request`: con la sesión iniciada, la contraseña y el correo nuevo (R-48). */
export const changeEmailRequestSchema = z.object({ password, newEmail: email });
export type ChangeEmailRequestBody = z.infer<typeof changeEmailRequestSchema>;

/** `POST /api/auth/email/confirm`: el código que llegó al correo nuevo (R-48). */
export const changeEmailConfirmSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
export type ChangeEmailConfirmBody = z.infer<typeof changeEmailConfirmSchema>;

/**
 * `POST /api/auth/email/revert`: deshace un cambio de correo sin sesión, con el correo anterior, el
 * código que llegó a ese correo y una contraseña nueva (R-50).
 */
export const revertEmailSchema = z.object({ email, code: z.string().regex(/^\d{6}$/), password });
export type RevertEmailBody = z.infer<typeof revertEmailSchema>;

/** `POST /api/auth/delete`: con la sesión iniciada, se confirma con la contraseña (R-49). */
export const deleteAccountSchema = z.object({ password });
export type DeleteAccountBody = z.infer<typeof deleteAccountSchema>;

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

/* ---------- Progreso en la cuenta (D-34; R-25 a R-32) ---------- */

export const elementSchema = z.enum(['fire', 'water', 'snow']);
export type Element = z.infer<typeof elementSchema>;

/**
 * El progreso de una cuenta (`GET /api/progress`). `camino` es null hasta que la persona elige su
 * carta de camino (R-30); hasta entonces no tiene monedas ni cartas. `collection` dice cuántas copias
 * tiene de cada carta del banco (R-25), por id de carta; las que no tiene no aparecen.
 */
export const progressSchema = z.object({
  camino: elementSchema.nullable(),
  coins: z.number().int().nonnegative(),
  boxesOpened: z.number().int().nonnegative(),
  collection: z.record(z.string(), z.number().int().positive()),
});
export type Progress = z.infer<typeof progressSchema>;

/** `POST /api/progress/camino`: el elemento de la carta de camino (R-30). La elección es permanente. */
export const chooseCaminoSchema = z.object({ element: elementSchema });
export type ChooseCaminoBody = z.infer<typeof chooseCaminoSchema>;

/** `POST /api/progress/boxes`: compra una caja de `size` cartas del elemento elegido (R-28). */
export const buyBoxSchema = z.object({ element: elementSchema, size: z.number().int().positive() });
export type BuyBoxBody = z.infer<typeof buyBoxSchema>;

/** Respuesta de comprar una caja: las cartas que salieron, en orden, y el progreso ya actualizado. */
export const boxResultSchema = z.object({ cards: z.array(z.string()), progress: progressSchema });
export type BoxResult = z.infer<typeof boxResultSchema>;

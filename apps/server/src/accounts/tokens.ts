import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/*
 * Huellas HMAC con SESSION_SECRET. En la base solo quedan huellas: con una copia de la base no se
 * puede usar una sesión ni un código.
 */

export const fingerprint = (secret: string, kind: string, value: string) =>
  createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex');

/** Compara dos huellas en tiempo constante. */
export function sameFingerprint(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Código de 6 dígitos (R-43). */
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** Token de sesión para la cookie: 32 bytes aleatorios. */
export const newSessionToken = () => randomBytes(32).toString('base64url');

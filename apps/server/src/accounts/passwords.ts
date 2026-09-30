import { hash, verify } from '@node-rs/argon2';
import type { PasswordProblem } from '@ventisca/protocol';
import { COMMON_PASSWORDS } from './common-passwords';
import { nameKey } from './names';

/*
 * Contraseñas (R-45 y D-54). Se normalizan a NFC antes de validarlas y de calcular el hash: la misma
 * contraseña escrita en otro sistema (con la tilde como carácter aparte, NFD) debe coincidir, y una
 * tilde suelta no debe contar como símbolo.
 */

/** La expresión aprobada en R-45, tal cual. */
export const R45 = /^(?=.*\p{Lu})(?=.*\p{Nd})(?=.*[^\p{L}\p{Nd}\s]).{8,128}$/u;

/** Minúsculas sin tildes, para comparar con el nombre y el correo. */
const plain = (s: string) => nameKey(s);

/** La palabra base: sin números, símbolos ni espacios en los bordes ("Password1!" es "password"). */
const baseWord = (s: string) => s.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');

export function checkPassword(raw: string, personal: { email: string; displayName: string }): PasswordProblem | null {
  const pw = raw.normalize('NFC');
  if (/[\r\n\u2028\u2029]/.test(pw)) return 'newline';
  const length = [...pw].length;
  if (length < 8 || length > 128) return 'length';
  if (!/\p{Lu}/u.test(pw)) return 'uppercase';
  if (!/\p{Nd}/u.test(pw)) return 'digit';
  if (!/[^\p{L}\p{Nd}\s]/u.test(pw)) return 'symbol';
  // Las comprobaciones de arriba explican el motivo; la expresión aprobada es la que manda.
  if (!R45.test(pw)) return 'symbol';

  const lower = pw.toLowerCase();
  const letters = lower.replace(/[^\p{L}]/gu, '');
  if ([lower, baseWord(lower), letters].some((w) => COMMON_PASSWORDS.has(w))) return 'common';

  const flat = plain(pw);
  const localPart = plain(personal.email.split('@')[0] ?? '');
  const name = plain(personal.displayName);
  if ((localPart.length >= 3 && flat.includes(localPart)) || (name.length >= 3 && flat.includes(name))) {
    return 'personal';
  }
  return null;
}

/** Argon2id con los costos que recomienda OWASP (19 MiB, 2 pasadas, 1 hilo), que son los de la librería. */
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password.normalize('NFC'), ARGON2);

export const verifyPassword = (stored: string, password: string) => verify(stored, password.normalize('NFC'));

/**
 * Hash de una contraseña que nadie tiene. Iniciar sesión con un correo que no existe lo verifica
 * igual, para que la respuesta tarde lo mismo y no revele qué correos están registrados (D-59).
 */
let decoy: Promise<string> | null = null;
export const decoyHash = () => {
  decoy ??= hashPassword(`sin-cuenta-${Math.random()}`);
  return decoy;
};

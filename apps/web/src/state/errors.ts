import { ACCOUNT_ERRORS } from '../i18n/es';
import type { ClientError } from '../net/api';

/* El servidor solo manda códigos de error; aquí se convierten en mensajes (i18n/es.ts). */

/** El mensaje de un error de la API, con el motivo cuando la persona puede corregirlo. */
export function errorMessage(error: ClientError): string {
  const e = ACCOUNT_ERRORS;
  switch (error.code) {
    case 'bad_request':
      if (error.reason === 'email') return e.badEmail;
      if (error.reason === 'same_email') return e.sameEmail;
      return e.bad_request;
    case 'name_not_allowed':
      return e.name[error.reason as keyof typeof e.name] ?? e.name.offensive;
    case 'weak_password':
      return e.password[error.reason as keyof typeof e.password] ?? e.password.length;
    case 'invalid_code':
      return error.attemptsLeft === undefined
        ? e.invalid_code
        : `${e.invalid_code} ${e.attemptsLeft(error.attemptsLeft)}`;
    case 'offline':
    case 'privacy_not_accepted':
    case 'name_taken':
    case 'code_expired':
    case 'too_many_attempts':
    case 'invalid_credentials':
    case 'email_not_verified':
    case 'too_many_requests':
    case 'captcha_failed':
    case 'captcha_unavailable':
    case 'email_unavailable':
    case 'email_taken':
    case 'unauthorized':
    case 'camino_required':
    case 'camino_already_chosen':
    case 'not_enough_coins':
      return e[error.code];
    default:
      return e.generic;
  }
}

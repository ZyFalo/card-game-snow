import type { Mail } from './mailer';

/*
 * Textos de los correos de cuentas. Frases cortas en español neutro, como la interfaz. Ningún correo
 * lleva texto escrito por quien llena un formulario: la dirección de destino todavía puede no ser suya.
 */

/** Sin el nombre visible: lo escribe quien se registra y el correo aún no está verificado. */
export function verificationMail(to: string, code: string, appUrl: string): Mail {
  return {
    to,
    subject: 'Tu código para Ventisca',
    text: [
      'Hola:',
      '',
      'Tu código para verificar tu cuenta de Ventisca es:',
      '',
      code,
      '',
      'Vence en 15 minutos y sirve una sola vez. Si no creaste esta cuenta, ignora este correo.',
      '',
      `Ventisca · ${appUrl}`,
    ].join('\n'),
  };
}

/** Alguien intentó registrarse con un correo que ya tiene cuenta (D-59). */
export function existingAccountMail(to: string, appUrl: string): Mail {
  return {
    to,
    subject: 'Ya tienes una cuenta en Ventisca',
    text: [
      'Alguien intentó crear una cuenta de Ventisca con este correo, que ya está registrado.',
      '',
      `Si fuiste tú, inicia sesión en ${appUrl}. Si no verificaste tu cuenta, pide un código nuevo desde ahí.`,
      '',
      'Si no fuiste tú, no tienes que hacer nada: tu cuenta sigue igual.',
      '',
      `Ventisca · ${appUrl}`,
    ].join('\n'),
  };
}

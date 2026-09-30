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
      `Si fuiste tú, inicia sesión en ${appUrl}. Si no verificaste tu cuenta, pide un código nuevo desde ahí, y si no recuerdas tu contraseña, recupérala desde ahí también.`,
      '',
      'Si no fuiste tú, no tienes que hacer nada: tu cuenta sigue igual.',
      '',
      `Ventisca · ${appUrl}`,
    ].join('\n'),
  };
}

/** R-46: código para recuperar la contraseña. */
export function recoveryCodeMail(to: string, code: string, appUrl: string): Mail {
  return {
    to,
    subject: 'Tu código para recuperar tu contraseña de Ventisca',
    text: [
      'Hola:',
      '',
      'Tu código para recuperar la contraseña de tu cuenta de Ventisca es:',
      '',
      code,
      '',
      'Vence en 15 minutos y sirve una sola vez. Si no pediste recuperar tu contraseña, ignora este correo: tu cuenta sigue igual.',
      '',
      `Ventisca · ${appUrl}`,
    ].join('\n'),
  };
}

/** R-48: código que confirma el correo nuevo. Va a la dirección nueva. */
export function changeEmailCodeMail(to: string, code: string, appUrl: string): Mail {
  return {
    to,
    subject: 'Confirma tu correo nuevo en Ventisca',
    text: [
      'Hola:',
      '',
      'Tu código para usar este correo en tu cuenta de Ventisca es:',
      '',
      code,
      '',
      'Vence en 15 minutos y sirve una sola vez. Si no pediste este cambio, ignora este correo.',
      '',
      `Ventisca · ${appUrl}`,
    ].join('\n'),
  };
}

/** R-46 y R-47: aviso de que la contraseña cambió. */
export function passwordChangedMail(to: string, appUrl: string): Mail {
  return {
    to,
    subject: 'Tu contraseña de Ventisca cambió',
    text: [
      'Hola:',
      '',
      'La contraseña de tu cuenta de Ventisca acaba de cambiar.',
      '',
      `Si fuiste tú, no tienes que hacer nada. Si no fuiste tú, recupera tu contraseña desde la pantalla de inicio de sesión en ${appUrl}.`,
      '',
      `Ventisca · ${appUrl}`,
    ].join('\n'),
  };
}

/**
 * R-48 y R-50: aviso al correo anterior, con el código que deshace el cambio durante 7 días. No incluye
 * la dirección nueva, que escribió quien pidió el cambio.
 */
export function emailChangedMail(to: string, code: string, appUrl: string): Mail {
  return {
    to,
    subject: 'El correo de tu cuenta de Ventisca cambió',
    text: [
      'Hola:',
      '',
      'Tu cuenta de Ventisca ya no usa este correo: se cambió por otro.',
      '',
      'Si fuiste tú, no tienes que hacer nada.',
      '',
      `Si no fuiste tú, deshaz el cambio en ${appUrl}, en "Deshacer un cambio de correo", con este correo, este código y una contraseña nueva. El código vale 7 días y sirve una sola vez:`,
      '',
      code,
      '',
      'Te pediremos una contraseña nueva porque quien hizo el cambio conocía la anterior.',
      '',
      `Ventisca · ${appUrl}`,
    ].join('\n'),
  };
}

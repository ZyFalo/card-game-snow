/*
 * Envío de correos. Resend llega con el PR 6. Mientras tanto, en desarrollo el correo se muestra en
 * la consola y en producción no hay envío: registrarse responde `email_unavailable`.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  /** Si puede enviar. Sin envío, registrarse y pedir códigos responden `email_unavailable`. */
  readonly available: boolean;
  send(mail: Mail): Promise<void>;
}

/** Solo en desarrollo: el correo se imprime en la consola, con el código, y no sale a ningún lado. */
export const devMailer: Mailer = {
  available: true,
  async send(mail) {
    console.info(`\n[correo de desarrollo, no se envía]\nPara: ${mail.to}\nAsunto: ${mail.subject}\n\n${mail.text}\n`);
  },
};

export const noMailer: Mailer = {
  available: false,
  async send() {
    throw new Error('No hay envío de correo configurado');
  },
};

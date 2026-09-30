import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Envío de correos. En producción sale por Resend (resend.ts); sin su clave no hay envío y registrarse
 * responde `email_unavailable`. En desarrollo el correo se muestra en la consola, y en las pruebas e2e
 * se guarda en una carpeta para que la prueba lea el código.
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

/**
 * Solo fuera de producción (pruebas e2e): cada correo se guarda como JSON en `dir`, para que la prueba
 * lea el código sin enviar nada. El servidor no arranca así en producción (ver main.ts).
 */
export function fileMailer(dir: string): Mailer {
  mkdirSync(dir, { recursive: true });
  let n = 0;
  return {
    available: true,
    async send(mail) {
      n += 1;
      writeFileSync(join(dir, `${Date.now()}-${String(n).padStart(4, '0')}.json`), JSON.stringify(mail));
    },
  };
}

import type { Mailer } from './mailer';

/*
 * Envío con Resend. El subdominio ventisca.wpena.dev está verificado en la región São Paulo
 * (sa-east-1); el seguimiento de aperturas y clics queda apagado, como promete el aviso de privacidad.
 */

export const MAIL_FROM = 'Ventisca <no-responder@ventisca.wpena.dev>';

export function resendMailer(apiKey: string, from = MAIL_FROM, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    available: true,
    async send(mail) {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(10_000),
      });
      // Sin el cuerpo de la respuesta en el error: puede traer la dirección de destino.
      if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
    },
  };
}

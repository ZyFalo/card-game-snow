/*
 * Captcha del registro con Cloudflare Turnstile. Se verifica el token en el servidor sin mandar la
 * IP de la persona (`remoteip` es opcional): lo promete el aviso de privacidad.
 */

export interface Captcha {
  /** Sin captcha configurado en producción, registrarse responde `captcha_unavailable`. */
  readonly available: boolean;
  verify(token: string): Promise<boolean>;
}

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * `hostname`: si se da, el desafío tiene que haberse resuelto en ese dominio. En desarrollo va vacío,
 * porque las claves de prueba de Cloudflare no dan el dominio real.
 */
export function turnstile(secret: string, hostname: string | null, fetchImpl: typeof fetch = fetch): Captcha {
  return {
    available: true,
    async verify(token) {
      try {
        const res = await fetchImpl(SITEVERIFY, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ secret, response: token }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { success?: boolean; hostname?: string };
        return body.success === true && (hostname === null || body.hostname === hostname);
      } catch {
        return false;
      }
    },
  };
}

/** Desarrollo sin clave: no hay captcha que resolver. */
export const noCaptcha: Captcha = { available: true, verify: async () => true };

/** Producción sin clave: no se acepta ningún registro. */
export const missingCaptcha: Captcha = { available: false, verify: async () => false };

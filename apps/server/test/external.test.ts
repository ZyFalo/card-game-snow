import { describe, expect, it } from 'vitest';
import { turnstile } from '../src/accounts/captcha';
import { MAIL_FROM, resendMailer } from '../src/accounts/resend';

/** fetch falso: guarda la petición y responde lo que se le pida. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe('Turnstile (captcha del registro)', () => {
  it('verifica el token con la clave secreta y sin mandar la IP de la persona', async () => {
    const f = fakeFetch(200, { success: true, hostname: 'ventisca.wpena.dev' });
    expect(await turnstile('secreta', 'ventisca.wpena.dev', f.impl).verify('token')).toBe(true);
    expect(f.calls[0]?.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(JSON.parse(f.calls[0]?.init.body as string)).toEqual({ secret: 'secreta', response: 'token' });
  });

  it('rechaza un desafío resuelto en otro dominio', async () => {
    const f = fakeFetch(200, { success: true, hostname: 'otro.example' });
    expect(await turnstile('secreta', 'ventisca.wpena.dev', f.impl).verify('token')).toBe(false);
  });

  it('rechaza si Cloudflare dice que no, si responde con error o si no responde', async () => {
    expect(await turnstile('s', null, fakeFetch(200, { success: false }).impl).verify('t')).toBe(false);
    expect(await turnstile('s', null, fakeFetch(500, {}).impl).verify('t')).toBe(false);
    const down = (async () => {
      throw new Error('sin red');
    }) as unknown as typeof fetch;
    expect(await turnstile('s', null, down).verify('t')).toBe(false);
  });
});

describe('Resend (envío de correos)', () => {
  it('envía texto plano desde el remitente de Ventisca, con la clave en la cabecera', async () => {
    const f = fakeFetch(200, { id: 'x' });
    await resendMailer('re_clave', MAIL_FROM, f.impl).send({ to: 'a@example.com', subject: 'Asunto', text: 'Hola:' });
    expect(f.calls[0]?.url).toBe('https://api.resend.com/emails');
    const headers = (f.calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_clave');
    expect(JSON.parse(f.calls[0]?.init.body as string)).toEqual({
      from: 'Ventisca <no-responder@ventisca.wpena.dev>',
      to: ['a@example.com'],
      subject: 'Asunto',
      text: 'Hola:',
    });
  });

  it('si Resend falla, el error no trae la respuesta, que puede incluir la dirección', async () => {
    const f = fakeFetch(422, { message: 'a@example.com no es válido' });
    const sending = resendMailer('re_clave', MAIL_FROM, f.impl).send({ to: 'a@example.com', subject: 's', text: 't' });
    await expect(sending).rejects.toThrow('Resend respondió 422');
    await expect(sending).rejects.not.toThrow(/a@example\.com/);
  });
});

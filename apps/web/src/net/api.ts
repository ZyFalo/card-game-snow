import { type ApiError, apiErrorSchema } from '@ventisca/protocol';

/*
 * Llamadas a la API del servidor, en el mismo origen (la cookie de sesión va sola). Los datos de cuenta
 * van siempre en el cuerpo, nunca en la URL: los registros del servidor guardan la URL.
 */

/** `offline`: no hubo respuesta (sin red, o el build de un solo archivo, que no tiene servidor). */
export type ClientError = ApiError['error'] | { code: 'offline' };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ClientError };

interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

async function request<T>(method: 'GET' | 'POST', path: string, body: object | undefined, schema?: Schema<T>) {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return { ok: false, status: 0, error: { code: 'offline' } } satisfies ApiResult<T>;
  }
  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.ok) {
    if (!schema) return { ok: true, data: undefined as T } satisfies ApiResult<T>;
    const parsed = schema.safeParse(json);
    if (parsed.success) return { ok: true, data: parsed.data } satisfies ApiResult<T>;
    return { ok: false, status: res.status, error: { code: 'internal' } } satisfies ApiResult<T>;
  }
  const error = apiErrorSchema.safeParse(json);
  // Sin un error de la API (un 404 de otro servidor, por ejemplo), se trata como sin conexión.
  if (!error.success) return { ok: false, status: res.status, error: { code: 'offline' } } satisfies ApiResult<T>;
  return { ok: false, status: res.status, error: error.data.error } satisfies ApiResult<T>;
}

export const api = {
  get: <T>(path: string, schema: Schema<T>): Promise<ApiResult<T>> => request('GET', path, undefined, schema),
  post: <T = undefined>(path: string, body: object, schema?: Schema<T>): Promise<ApiResult<T>> =>
    request('POST', path, body, schema),
};

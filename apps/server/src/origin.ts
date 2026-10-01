import { apiError } from '@ventisca/protocol';
import type { FastifyInstance } from 'fastify';

/*
 * Comprobación de origen (D-65). Una petición que cambia estado solo vale si viene del propio juego.
 *
 * La cookie de sesión es SameSite=Lax, pero para SameSite todo wpena.dev es el mismo sitio: viaja en
 * las peticiones que mande una página de cualquier otro subdominio. Lo que sí distingue a esa página
 * es su origen, que el navegador declara en cada petición que no es de lectura y que una página no
 * puede falsificar.
 */

/**
 * Métodos de lectura: no cambian nada, así que no se comprueban. Ojo en el M8: una conexión WebSocket
 * empieza con un GET, así que esta guarda no la cubre y necesita su propia comprobación de Origin.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** `origins`: los orígenes exactos (esquema, dominio y puerto) desde los que se sirve el juego. */
export function originGuard(app: FastifyInstance, origins: readonly string[]) {
  const allowed = new Set(origins);
  app.addHook('onRequest', async (req, reply) => {
    if (SAFE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    const site = req.headers['sec-fetch-site'];
    // Sin Origin, los navegadores actuales dicen igual de dónde viene la petición, en Sec-Fetch-Site.
    // Sin ninguna de las dos cabeceras no es un navegador (curl, las pruebas): no lleva la cookie de nadie.
    const fromHere =
      origin !== undefined ? allowed.has(origin) : site === undefined || site === 'same-origin' || site === 'none';
    if (fromHere) return;
    req.log.warn({ origin: origin ?? null, site: site ?? null }, 'Petición rechazada: viene de otro origen');
    return reply.code(403).send(apiError('bad_origin'));
  });
}

import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * Intenta abrir un WebSocket y devuelve lo que respondió el servidor al pedirlo, sin llegar a usar la
 * conexión: `status` es 101 si la abrió y, si no, el estado HTTP con que la rechazó, con su cuerpo.
 *
 * Se hace a mano, con una petición HTTP: el WebSocket de Node no deja elegir el `Origin` ni dice con qué
 * estado lo rechazaron, y eso es justo lo que hay que mirar.
 *
 * @param {URL | string} url La dirección, con http: o https:.
 * @param {{ origin?: string, timeoutMs?: number }} [options] Sin `origin`, la petición no lleva esa cabecera.
 * @returns {Promise<{ status: number, body: unknown }>}
 */
export function handshake(url, { origin, timeoutMs = 20_000 } = {}) {
  const target = new URL(url);
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(target, {
      // Una conexión por intento, sin guardarla para el siguiente: el servidor corta la de un intento que
      // rechaza, y el próximo la encontraría muerta.
      agent: false,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        ...(origin ? { Origin: origin } : {}),
      },
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve({ status: res.statusCode ?? 0, body: null });
    });
    req.on('response', (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () => {
        let body = text;
        try {
          body = JSON.parse(text);
        } catch {
          /* no era JSON: se devuelve el texto */
        }
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`sin respuesta en ${Math.round(timeoutMs / 1000)} s`)));
    req.on('error', reject);
    req.end();
  });
}

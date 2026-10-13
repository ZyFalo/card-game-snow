import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { handshake } from './handshake.mjs';

/*
 * `pnpm check:prod` mira cómo responde el servidor al pedirle la conexión del juego. Aquí se prueba esa
 * mirada contra un servidor de mentira que hace lo mismo que el de verdad: rechaza con un estado HTTP y su
 * código, o abre la conexión.
 */
describe('handshake', () => {
  /** @type {import('node:http').Server | null} */
  let server = null;
  /** Las conexiones que el servidor de mentira dejó abiertas: un servidor HTTP no cierra las que ya son otra cosa. */
  /** @type {Set<import('node:stream').Duplex>} */
  const sockets = new Set();
  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(null)));
    server = null;
  });

  /** Un servidor que abre la conexión solo desde `allowed`, y dice qué cabeceras le llegaron. */
  async function listen(allowed) {
    /** @type {import('node:http').IncomingHttpHeaders[]} */
    const seen = [];
    server = createServer((_req, res) => res.writeHead(426).end('solo WebSocket'));
    server.on('upgrade', (req, socket) => {
      sockets.add(socket);
      seen.push(req.headers);
      if (req.headers.origin !== allowed) {
        const body = JSON.stringify({ error: { code: 'bad_origin' } });
        socket.end(
          `HTTP/1.1 403 Forbidden\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\nconnection: close\r\n\r\n${body}`,
        );
        return;
      }
      const accept = createHash('sha1')
        .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );
      socket.on('error', () => undefined);
    });
    await new Promise((resolve) => server?.listen(0, '127.0.0.1', () => resolve(null)));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    return { url: `http://127.0.0.1:${port}/api/play`, seen };
  }

  it('dice el estado y el código con que el servidor rechazó la conexión', async () => {
    const { url, seen } = await listen('https://juego.test');
    expect(await handshake(url, { origin: 'https://otro.test' })).toEqual({
      status: 403,
      body: { error: { code: 'bad_origin' } },
    });
    expect(seen[0]).toMatchObject({ origin: 'https://otro.test', upgrade: 'websocket', 'sec-websocket-version': '13' });
  });

  it('cada intento abre su propia conexión: el servidor de verdad corta la de un intento rechazado', async () => {
    // Como el servidor del juego: responde sin decir que va a cerrar, y enseguida corta la conexión.
    server = createServer((_req, res) => res.writeHead(426).end());
    server.on('upgrade', (_req, socket) => {
      sockets.add(socket);
      const body = JSON.stringify({ error: { code: 'unauthorized' } });
      socket.write(
        `HTTP/1.1 401 Unauthorized\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
        () => setTimeout(() => socket.destroy(), 20),
      );
      socket.on('error', () => undefined);
    });
    await new Promise((resolve) => server?.listen(0, '127.0.0.1', () => resolve(null)));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    const url = `http://127.0.0.1:${port}/api/play`;
    // Uno tras otro, sin pausa: si el segundo reutilizara la conexión del primero, la encontraría cortada.
    for (let attempt = 0; attempt < 4; attempt++) {
      expect(await handshake(url, { origin: 'https://juego.test' })).toEqual({
        status: 401,
        body: { error: { code: 'unauthorized' } },
      });
    }
  });

  it('sin `origin`, la petición no lleva esa cabecera', async () => {
    const { url, seen } = await listen('https://juego.test');
    expect((await handshake(url)).status).toBe(403);
    expect(seen[0]).not.toHaveProperty('origin');
  });

  it('da 101 cuando el servidor abre la conexión', async () => {
    const { url } = await listen('https://juego.test');
    expect(await handshake(url, { origin: 'https://juego.test' })).toEqual({ status: 101, body: null });
  });

  it('un cuerpo que no es JSON llega como texto', async () => {
    server = createServer((_req, res) => res.writeHead(404).end('no hay nada'));
    server.on('upgrade', (_req, socket) => {
      socket.end('HTTP/1.1 404 Not Found\r\ncontent-length: 11\r\nconnection: close\r\n\r\nno hay nada');
    });
    await new Promise((resolve) => server?.listen(0, '127.0.0.1', () => resolve(null)));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    expect(await handshake(`http://127.0.0.1:${port}/api/play`)).toEqual({ status: 404, body: 'no hay nada' });
  });

  it('falla, y no se queda esperando, si el servidor no responde', async () => {
    server = createServer();
    server.on('upgrade', (_req, socket) => {
      sockets.add(socket);
      socket.on('error', () => undefined);
    });
    await new Promise((resolve) => server?.listen(0, '127.0.0.1', () => resolve(null)));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
    await expect(handshake(`http://127.0.0.1:${port}/api/play`, { timeoutMs: 1200 })).rejects.toThrow(
      'sin respuesta en 1 s',
    );
  });
});

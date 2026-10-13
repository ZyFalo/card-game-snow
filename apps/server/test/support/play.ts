import type { AddressInfo } from 'node:net';
import {
  type ClientPayload,
  PLAY_PATH,
  PROTOCOL_VERSION,
  type ServerMessage,
  type ServerMessageType,
  serverMessageSchema,
  sessionSchema,
} from '@ventisca/protocol';
import WebSocket from 'ws';
import type { Captcha } from '../../src/accounts/captcha';
import type { Mail, Mailer } from '../../src/accounts/mailer';
import { SESSION_COOKIE } from '../../src/accounts/session';
import { type AppOptions, buildApp } from '../../src/app';
import type { Database } from '../../src/db';

/*
 * Para probar el juego en línea contra el servidor de verdad: una aplicación escuchando en un puerto
 * libre, cuentas ya verificadas y clientes WebSocket que guardan lo que reciben.
 */

export const APP_ORIGIN = 'https://ventisca.test';
export const SECRET = 's'.repeat(48);

/** Un cliente de prueba: guarda cada mensaje del servidor, ya validado contra el protocolo. */
export class TestClient {
  /** Todo lo recibido, en orden. */
  readonly received: ServerMessage[] = [];
  private readonly unread: ServerMessage[] = [];
  private readonly waiting: { type: ServerMessageType; resolve: (m: ServerMessage) => void }[] = [];
  private seq = 0;
  /** El código con que se cerró la conexión. */
  readonly closed: Promise<number>;

  constructor(readonly socket: WebSocket) {
    this.closed = new Promise((resolve) => socket.once('close', (code) => resolve(code)));
    socket.on('message', (data) => {
      const message = serverMessageSchema.parse(JSON.parse(data.toString()));
      this.received.push(message);
      const i = this.waiting.findIndex((w) => w.type === message.type);
      if (i >= 0) this.waiting.splice(i, 1)[0]?.resolve(message);
      else this.unread.push(message);
    });
  }

  /** Envía un mensaje con la versión y su número de secuencia, que devuelve. */
  send(payload: ClientPayload): number {
    const seq = this.seq;
    this.seq += 1;
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, seq, ...payload }));
    return seq;
  }

  /** Envía un texto tal cual, para probar lo que no cumple el protocolo. */
  raw(text: string): void {
    this.socket.send(text);
  }

  /** El siguiente mensaje de ese tipo que todavía no se leyó; lo espera si no llegó. */
  next<T extends ServerMessageType>(type: T, timeoutMs = 3000): Promise<Extract<ServerMessage, { type: T }>> {
    type Wanted = Extract<ServerMessage, { type: T }>;
    const i = this.unread.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(this.unread.splice(i, 1)[0] as Wanted);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No llegó ningún mensaje ${type}`)), timeoutMs);
      this.waiting.push({
        type,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Wanted);
        },
      });
    });
  }

  /** Lo recibido de ese tipo que todavía no se leyó, sin esperar. */
  pending(type: ServerMessageType): ServerMessage[] {
    return this.unread.filter((m) => m.type === type);
  }

  close(): Promise<number> {
    this.socket.close();
    return this.closed;
  }
}

/** Lo que respondió el servidor cuando no quiso abrir la conexión. */
export interface Refused {
  status: number;
  body: unknown;
}

export interface TestServer {
  app: ReturnType<typeof buildApp>;
  url: string;
  sent: Mail[];
  /** Una cuenta nueva, verificada. Con `camino`, ya con su carta de camino elegida. */
  signUp(camino?: 'fire' | 'water' | 'snow'): Promise<{ cookie: string; userId: string; name: string; email: string }>;
  /** Abre la conexión de juego. Por defecto, desde el origen del juego. */
  connect(cookie: string | null, headers?: Record<string, string>): Promise<TestClient>;
  /** Intenta abrirla y devuelve la respuesta HTTP con que el servidor la rechazó. */
  refused(cookie: string | null, headers?: Record<string, string>): Promise<Refused>;
  close(): Promise<void>;
}

let accounts = 0;

/** Levanta el servidor en un puerto libre, con la base de la prueba. */
export async function startServer(database: Database, extra: Partial<AppOptions> = {}): Promise<TestServer> {
  const sent: Mail[] = [];
  const mailer: Mailer = {
    available: true,
    async send(mail) {
      sent.push(mail);
    },
  };
  const captcha: Captcha = { available: true, verify: async () => true };
  const app = buildApp({
    ping: async () => {},
    webDist: null,
    logger: false,
    accounts: { db: database.db, mailer, captcha, secret: SECRET, appUrl: APP_ORIGIN },
    ...extra,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  const url = `ws://127.0.0.1:${port}${PLAY_PATH}`;
  const clients: TestClient[] = [];

  const headersFor = (cookie: string | null, headers: Record<string, string> = { origin: APP_ORIGIN }) => ({
    ...headers,
    ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}),
  });

  return {
    app,
    url,
    sent,
    async signUp(camino) {
      accounts += 1;
      const tag = `${process.pid}x${accounts}`;
      const email = `juego${tag}@example.com`;
      const name = `Ninja ${accounts}`;
      const post = (path: string, payload: object, cookie?: string) =>
        app.inject({
          method: 'POST',
          url: path,
          payload,
          headers: { origin: APP_ORIGIN },
          ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
        });
      await post('/api/auth/register', {
        email,
        displayName: name,
        password: 'Tundra7#Oso',
        acceptPrivacy: true,
        captchaToken: 'ok',
      });
      const code = (sent.at(-1)?.text.match(/\b(\d{6})\b/)?.[1] ?? '') as string;
      const res = await post('/api/auth/verify', { email, code });
      const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)?.value as string;
      const userId = sessionSchema.parse(res.json()).user.id;
      if (camino) await post('/api/progress/camino', { element: camino }, cookie);
      return { cookie, userId, name, email };
    },
    connect(cookie, headers) {
      return new Promise((resolve, reject) => {
        const socket = new WebSocket(url, { headers: headersFor(cookie, headers) });
        const client = new TestClient(socket);
        socket.once('open', () => {
          clients.push(client);
          resolve(client);
        });
        socket.once('unexpected-response', (_req, res) => reject(new Error(`El servidor respondió ${res.statusCode}`)));
        socket.once('error', reject);
      });
    },
    refused(cookie, headers) {
      return new Promise((resolve, reject) => {
        const socket = new WebSocket(url, { headers: headersFor(cookie, headers) });
        socket.once('open', () => {
          socket.close();
          reject(new Error('La conexión se abrió, y no debía'));
        });
        socket.once('unexpected-response', (_req, res) => {
          let text = '';
          res.on('data', (chunk: Buffer) => {
            text += chunk.toString();
          });
          res.on('end', () => {
            let body: unknown = text;
            try {
              body = JSON.parse(text);
            } catch {
              /* no era JSON: se devuelve el texto */
            }
            resolve({ status: res.statusCode ?? 0, body });
          });
        });
        socket.once('error', () => undefined);
      });
    },
    async close() {
      for (const client of clients) client.socket.terminate();
      await app.close();
    },
  };
}

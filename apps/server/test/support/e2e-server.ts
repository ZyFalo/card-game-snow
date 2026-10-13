import { rmSync } from 'node:fs';
import { createServer } from 'node:http';
import pg from 'pg';
import type { StartOptions } from '../../src/start';
import { type Board, board } from './board';
import { E2E_DATABASE, e2eDatabaseUrl } from './e2e-database';

/*
 * El servidor de las pruebas e2e (lo arranca apps/web/playwright.config.ts). Antes de arrancar, recrea la
 * base de las e2e en el Postgres de DATABASE_URL_TEST y vacía la carpeta de correos: cada corrida
 * empieza limpia y la base de desarrollo no se toca.
 */
const adminUrl = process.env.DATABASE_URL_TEST;
if (!adminUrl) {
  throw new Error('Las e2e necesitan DATABASE_URL_TEST: corre docker compose up -d db y revisa el .env.');
}
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
await admin.query(`drop database if exists "${E2E_DATABASE}" with (force)`);
await admin.query(`create database "${E2E_DATABASE}"`);
await admin.end();

process.env.DATABASE_URL = e2eDatabaseUrl(adminUrl);
if (process.env.MAIL_OUTBOX_DIR) rmSync(process.env.MAIL_OUTBOX_DIR, { recursive: true, force: true });

/** Los tableros que pidieron las pruebas, por código de sala. Cada uno vale para una partida. */
const boards = new Map<string, Board>();

/*
 * Los plazos del juego en línea, para las pruebas: un turno largo, para que una prueba que planea y
 * confirma no dependa de lo cargado que esté el equipo (el turno se resuelve en cuanto confirman todos), y
 * una oferta del bot corta, para no esperar 30 s en la cola. El tablero solo se prepara en la sala que una
 * prueba pidió: las demás partidas salen del motor, como en producción.
 */
const options: StartOptions = {
  playTimings: { turnMs: 60_000, offerMs: 4_000 },
  matchPrepare: (state, room) => {
    const spec = room === null ? undefined : boards.get(room);
    if (room === null || !spec) return null;
    boards.delete(room);
    return board(spec)(state);
  },
};
const { start } = await import('../../src/start');
let running = await start(options);

/*
 * El control de las pruebas: un servidor aparte, que solo escucha en esta máquina, para lo que una prueba
 * necesita pedirle al servidor y el juego no le ofrece a nadie.
 * - `POST /board` con `{ room, board }`: el tablero de la próxima partida de esa sala.
 * - `POST /restart`: apaga el servidor como en un despliegue y lo vuelve a arrancar, con la misma base (R-54).
 * Solo acepta JSON: así una página abierta en el navegador de esta máquina no puede llamarlo.
 */
const CONTROL_PORT = Number(process.env.E2E_CONTROL_PORT ?? 3101);
const control = createServer((req, res) => {
  let text = '';
  req.on('data', (chunk: Buffer) => {
    text += chunk.toString();
  });
  req.on('end', async () => {
    try {
      if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') {
        res.writeHead(400).end();
        return;
      }
      if (req.url === '/board') {
        const body = JSON.parse(text) as { room: string; board: Board };
        boards.set(body.room, body.board);
      } else if (req.url === '/restart') {
        await running.stop();
        running = await start(options);
      } else {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(204).end();
    } catch (err) {
      res.writeHead(500).end((err as Error).message);
    }
  });
});
control.listen(CONTROL_PORT, '127.0.0.1');

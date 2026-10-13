import type { Board } from '../../server/test/support/board';

/*
 * El control del servidor de las pruebas e2e (apps/server/test/support/e2e-server.ts): lo que una prueba
 * necesita pedirle y el juego no le ofrece a nadie. Escucha solo en esta máquina, en su propio puerto.
 */

export type { Board };

export const CONTROL_PORT = 3101;

async function control(path: string, body: object): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${CONTROL_PORT}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`El servidor de las pruebas respondió ${res.status} a ${path}: ${await res.text()}`);
}

/** Deja preparado el tablero de la próxima partida de esa sala. Las demás partidas salen del motor. */
export const prepareBoard = (room: string, board: Board) => control('/board', { room, board });

/**
 * Apaga el servidor de las pruebas como en un despliegue y lo vuelve a arrancar, con la misma base (R-54).
 * Corta a todo el que esté conectado: solo lo usa la prueba del reinicio, que corre sola (playwright.config.ts).
 */
export const restartServer = () => control('/restart', {});

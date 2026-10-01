/**
 * Reintenta una lectura que a veces falla por la red. Devuelve el primer resultado que llega; si
 * todos los intentos fallan, lanza el último error, con su mensaje entero.
 *
 * @template T
 * @param {(attempt: number) => T | Promise<T>} read
 * @param {{ attempts?: number, pauseMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function retry(read, { attempts = 3, pauseMs = 2000 } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await read(attempt);
    } catch (err) {
      last = err;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }
  throw last;
}

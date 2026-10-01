import { describe, expect, it } from 'vitest';
import { retry } from './retry.mjs';

describe('check:prod: reintentar una lectura', () => {
  it('si la lectura funciona, devuelve su resultado sin reintentar', async () => {
    let calls = 0;
    const value = await retry(() => {
      calls += 1;
      return 'd1a3f92';
    });
    expect(value).toBe('d1a3f92');
    expect(calls).toBe(1);
  });

  it('si la lectura falla dos veces y a la tercera funciona, devuelve ese resultado', async () => {
    const attempts = [];
    const value = await retry(
      (attempt) => {
        attempts.push(attempt);
        if (attempt < 3) throw new Error('fatal: unable to access');
        return 'd1a3f92';
      },
      { pauseMs: 0 },
    );
    expect(value).toBe('d1a3f92');
    expect(attempts).toEqual([1, 2, 3]);
  });

  it('si todos los intentos fallan, lanza el último error con su mensaje', async () => {
    let calls = 0;
    const failing = retry(
      () => {
        calls += 1;
        throw new Error(`intento ${calls}: no se pudo`);
      },
      { attempts: 3, pauseMs: 0 },
    );
    await expect(failing).rejects.toThrow('intento 3: no se pudo');
    expect(calls).toBe(3);
  });

  it('entre intento e intento espera la pausa pedida', async () => {
    const start = Date.now();
    await retry(
      (attempt) => {
        if (attempt === 1) throw new Error('falla');
        return 'ok';
      },
      { pauseMs: 40 },
    );
    expect(Date.now() - start).toBeGreaterThanOrEqual(35);
  });
});

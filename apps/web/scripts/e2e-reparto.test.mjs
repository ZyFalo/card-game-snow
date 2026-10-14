import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SECONDS, e2eFiles, estimate, RESTART, restartMachine, SECONDS, split } from './e2e-reparto.mjs';

/* La CI reparte las e2e entre varias máquinas: ninguna prueba se puede quedar sin correr. */
describe('CI: el reparto de las e2e entre máquinas', () => {
  const onDisk = readdirSync(new URL('../e2e/', import.meta.url)).filter((file) => file.endsWith('.spec.ts'));
  const files = e2eFiles();

  it('reparte todos los archivos de pruebas del juego, y el del reinicio queda aparte', () => {
    expect(onDisk).toContain(RESTART);
    expect([...files, RESTART].sort()).toEqual([...onDisk].sort());
  });

  it('cada archivo va a una sola máquina y no falta ninguno, sea cual sea el número de máquinas', () => {
    for (let machines = 1; machines <= files.length; machines++) {
      const parts = split(files, machines);
      expect(parts).toHaveLength(machines);
      expect(parts.flat().sort()).toEqual([...files].sort());
      // Una máquina sin archivos correría la suite entera.
      for (const part of parts) expect(part.length).toBeGreaterThan(0);
    }
  });

  it('no deja a una máquina sin archivos: con más máquinas que archivos, falla', () => {
    expect(() => split(files, files.length + 1)).toThrow(/archivos para/);
    expect(() => split(files, 0)).toThrow(/no válido/);
    expect(() => split(files, 1.5)).toThrow(/no válido/);
  });

  it('todas las máquinas calculan el mismo reparto, lleguen los archivos en el orden que lleguen', () => {
    const reversed = [...files].reverse();
    const shuffled = [...files].sort((a, b) => a.length - b.length || b.localeCompare(a));
    for (const machines of [2, 3, 4]) {
      expect(split(reversed, machines)).toEqual(split(files, machines));
      expect(split(shuffled, machines)).toEqual(split(files, machines));
    }
  });

  it('un archivo nuevo, que todavía no tiene tiempo medido, también se reparte', () => {
    const withNew = [...files, 'nueva.spec.ts'];
    expect(SECONDS['nueva.spec.ts']).toBeUndefined();
    const parts = split(withNew, 3);
    expect(parts.flat()).toContain('nueva.spec.ts');
    expect(parts.flat().sort()).toEqual([...withNew].sort());
    expect(estimate(['nueva.spec.ts'])).toBe(DEFAULT_SECONDS);
  });

  it('la tabla de tiempos no nombra archivos que ya no existen', () => {
    expect(Object.keys(SECONDS).filter((file) => !files.includes(file))).toEqual([]);
  });

  it('del más pesado al más liviano, cada archivo va a la máquina que menos lleva', () => {
    // Sin tiempos medidos, todos pesan igual y se reparten por turnos, en orden alfabético.
    expect(split(['d.spec.ts', 'b.spec.ts', 'a.spec.ts', 'c.spec.ts'], 2)).toEqual([
      ['a.spec.ts', 'c.spec.ts'],
      ['b.spec.ts', 'd.spec.ts'],
    ]);
    // Con los tiempos de verdad: los dos más pesados nunca caen en la misma máquina.
    const [first, second] = split(files, 2);
    expect(first).toContain('online-match.spec.ts');
    expect(second).toContain('demos.spec.ts');
    expect(first).not.toContain('demos.spec.ts');
  });

  it('una máquina no tarda menos que su archivo más pesado, ni menos que la mitad de lo que suman los suyos', () => {
    // Un archivo corre en un solo proceso; los demás, en el otro.
    expect(estimate(['online-match.spec.ts', 'webgl.spec.ts'])).toBe(SECONDS['online-match.spec.ts']);
    expect(estimate(['board.spec.ts', 'online.spec.ts', 'tips.spec.ts'])).toBe((275 + 217 + 179) / 2);
  });

  it('con tres máquinas, la más lenta tarda lo que el archivo más pesado: más máquinas no la acortan', () => {
    const heaviest = Math.max(...files.map((file) => estimate([file])));
    const slowest = (machines) => Math.max(...split(files, machines).map(estimate));
    expect(slowest(3)).toBe(heaviest);
    expect(slowest(4)).toBe(heaviest);
    expect(slowest(2)).toBeGreaterThan(heaviest);
  });

  it('la prueba del reinicio le toca a una sola máquina: la que termina antes con lo suyo', () => {
    for (const machines of [1, 2, 3, 4]) {
      const times = split(files, machines).map(estimate);
      const machine = restartMachine(files, machines);
      expect(machine).toBeGreaterThanOrEqual(1);
      expect(machine).toBeLessThanOrEqual(machines);
      expect(times[machine - 1]).toBe(Math.min(...times));
    }
  });
});

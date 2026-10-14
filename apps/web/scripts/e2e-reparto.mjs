// Reparte los archivos de las e2e entre las máquinas de la CI, para que corran en paralelo y todas tarden
// parecido. Cada máquina llama a este guion con su número y el total, y corre solo lo que le toca:
//
//   node scripts/e2e-reparto.mjs 2 3              los archivos de la máquina 2 de 3
//   node scripts/e2e-reparto.mjs 2 3 --reinicio   sale con 0 si a esa máquina le toca la prueba del reinicio
//
// Reparte lo que hay en e2e/, no una lista escrita a mano: un archivo nuevo entra solo, y ninguno se queda
// sin correr. Playwright trae su propio reparto (--shard), pero cuenta pruebas, no minutos, y aquí unas
// pocas pruebas con tres navegadores pesan más que decenas de las otras.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Los segundos que suman las pruebas de cada archivo en la CI, sin tarjeta gráfica. Medidos el 13 de
 * octubre de 2026, en el registro de la corrida del PR #31. No hace falta que estén al día: solo sirven
 * para equilibrar. Un archivo que no esté aquí cuenta como `DEFAULT_SECONDS`.
 */
export const SECONDS = {
  'online-match.spec.ts': 489,
  'demos.spec.ts': 408,
  'board.spec.ts': 275,
  'online.spec.ts': 217,
  'tips.spec.ts': 179,
  'progress.spec.ts': 174,
  'accounts.spec.ts': 132,
  'online-security.spec.ts': 124,
  'keyboard.spec.ts': 61,
  'credits.spec.ts': 48,
  'scene.spec.ts': 44,
  'sandbox.spec.ts': 38,
  'clock.spec.ts': 34,
  'privacy.spec.ts': 22,
  'smoke.spec.ts': 20,
  'webgl.spec.ts': 8,
};
export const DEFAULT_SECONDS = 60;

/** La prueba del reinicio corta a todo el que esté conectado: no entra en el reparto y corre sola, al final. */
export const RESTART = 'restart.spec.ts';

/** Los procesos de Playwright en una máquina de la CI: la mitad de sus 4 núcleos. */
const WORKERS = 2;

const seconds = (file) => SECONDS[file] ?? DEFAULT_SECONDS;

/** Los archivos de pruebas del juego, sin el del reinicio. */
export function e2eFiles() {
  const dir = fileURLToPath(new URL('../e2e/', import.meta.url));
  return readdirSync(dir).filter((file) => file.endsWith('.spec.ts') && file !== RESTART);
}

/**
 * Los archivos de cada máquina. Del más pesado al más liviano, cada uno va a la máquina que menos lleva.
 * El resultado no depende del orden en que lleguen los archivos: todas las máquinas calculan lo mismo.
 */
export function split(files, machines) {
  if (!Number.isInteger(machines) || machines < 1) throw new Error(`Número de máquinas no válido: ${machines}`);
  // Sin archivos, Playwright correría la suite entera en esa máquina.
  if (machines > files.length) throw new Error(`Hay ${files.length} archivos para ${machines} máquinas`);
  const parts = Array.from({ length: machines }, () => []);
  const load = parts.map(() => 0);
  const order = [...files].sort((a, b) => seconds(b) - seconds(a) || a.localeCompare(b));
  for (const file of order) {
    const lightest = load.indexOf(Math.min(...load));
    parts[lightest].push(file);
    load[lightest] += seconds(file);
  }
  return parts;
}

/**
 * Lo que tarda una máquina con sus archivos, en segundos. Las pruebas de un archivo van una tras otra en
 * un mismo proceso, así que no baja de lo que tarda su archivo más pesado.
 */
export function estimate(files) {
  const all = files.map(seconds);
  return Math.max(...all, all.reduce((sum, s) => sum + s, 0) / WORKERS);
}

/** La máquina que corre la prueba del reinicio (desde 1): la que termina antes con lo suyo. */
export function restartMachine(files, machines) {
  const times = split(files, machines).map(estimate);
  return times.indexOf(Math.min(...times)) + 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [machine, machines] = process.argv.slice(2, 4).map(Number);
  if (!Number.isInteger(machine) || machine < 1 || machine > machines) {
    console.error('Uso: node scripts/e2e-reparto.mjs <máquina> <máquinas> [--reinicio]');
    process.exit(2);
  }
  const files = e2eFiles();
  if (process.argv.includes('--reinicio')) process.exit(restartMachine(files, machines) === machine ? 0 : 1);
  console.log(
    split(files, machines)
      [machine - 1].map((file) => `e2e/${file}`)
      .join(' '),
  );
}

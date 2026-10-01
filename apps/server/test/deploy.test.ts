import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

/*
 * Despliegue en Railway: railway.json es la fuente de verdad (D-64). Fija el comando de arranque,
 * porque al importar el monorepo Railway puso en el panel uno con pnpm, que la imagen no trae. El
 * panel puede pisar a railway.json sin que se note, así que sus campos equivalentes deben quedar
 * vacíos. Estas pruebas evitan que el archivo se desalinee del Dockerfile y que la salud apunte a
 * una ruta que no existe.
 */
const root = (file: string) => fileURLToPath(new URL(`../../../${file}`, import.meta.url));
const railway = JSON.parse(readFileSync(root('railway.json'), 'utf8')) as {
  build: { watchPatterns?: string[] };
  deploy: { startCommand?: string; healthcheckPath?: string };
};

/** El CMD del Dockerfile en forma exec, con sus partes unidas por espacios. */
function dockerCmd(): string {
  const line = readFileSync(root('Dockerfile'), 'utf8')
    .split('\n')
    .findLast((l) => l.startsWith('CMD '));
  if (!line) throw new Error('El Dockerfile no tiene CMD');
  return (JSON.parse(line.slice(4)) as string[]).join(' ');
}

describe('Despliegue en Railway (railway.json)', () => {
  it('fija el comando de arranque, y es el mismo CMD del Dockerfile', () => {
    expect(railway.deploy.startCommand).toBe(dockerCmd());
  });

  it('el comando de arranque usa node, que sí trae la imagen, y no pnpm', () => {
    expect(railway.deploy.startCommand).toMatch(/^node /);
  });

  it('la imagen instala @node-rs/argon2 (nativo) con la misma versión exacta que package.json', () => {
    const pkg = JSON.parse(readFileSync(root('apps/server/package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const installed = readFileSync(root('Dockerfile'), 'utf8').match(/@node-rs\/argon2@(\S+)/)?.[1];
    expect(installed).toBe(pkg.dependencies['@node-rs/argon2']);
  });

  it('D-64: no limita qué cambios redespliegan, así que cada push a main se despliega', () => {
    // Con una lista de rutas vigiladas, un PR solo de documentación dejaría producción atrás a
    // propósito, y pnpm check:prod exige que corra el último commit de main.
    expect(railway.build).not.toHaveProperty('watchPatterns');
  });

  it('la comprobación de salud apunta a una ruta que responde', async () => {
    const app = buildApp({ ping: async () => {}, webDist: null, logger: false });
    const res = await app.inject({ method: 'GET', url: railway.deploy.healthcheckPath ?? '' });
    await app.close();
    expect(res.statusCode).toBe(200);
  });
});

// Empaqueta el servidor en un solo archivo (dist/server.mjs) con los paquetes del monorepo y sus
// dependencias adentro: la imagen de Docker no necesita node_modules ni TypeScript.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // pg solo lo carga si se pide el modo nativo, que no usamos.
  external: ['pg-native'],
  // Varias dependencias son CommonJS y llaman a require; en un módulo ES hay que dárselo.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});

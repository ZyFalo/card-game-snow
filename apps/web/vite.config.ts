import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el build funciona igual en cualquier servidor, en itch.io o abriendo el archivo.
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  // En desarrollo, /api va al servidor (pnpm dev:server); las e2e lo apuntan al suyo con VENTISCA_API.
  server: { port: 5173, proxy: { '/api': process.env.VENTISCA_API ?? 'http://localhost:3000' } },
});

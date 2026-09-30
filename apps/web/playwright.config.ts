import { defineConfig } from '@playwright/test';

/*
 * Pruebas de humo en Chromium. En equipos sin GPU se puede forzar el render por
 * software con PW_SWIFTSHADER=1; PW_CHROMIUM_PATH permite usar un Chromium ya instalado.
 */
const swiftshader = process.env.PW_SWIFTSHADER === '1';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: swiftshader
        ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
        : [],
    },
  },
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js --port 5174 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

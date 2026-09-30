# Traspaso a Claude Code

Estado al 30 de septiembre de 2026: **v0.10, con el hito M7 en curso**. Es el modo en línea y se describe en `docs/PRD-v2.md`. El juego se construyó en claude.ai hasta la v0.9, y desde entonces continúa en Claude Code.

## Qué hay

- **Sandbox para un jugador:**
  - Las reglas R-01 a R-24, con los tres ninjas y el mazo de referencia (D-50).
  - Sin cuenta ni progreso (D-34).
  - Dificultades Clásica y Tormenta, tres ritmos de reloj, pausa y ayuda.
- **Motor puro (`packages/core`):** reglas, bot, progresión (R-25 a R-32) y logros. El servidor lo usará tal cual.
- **En línea:** https://ventisca.wpena.dev, en Railway (ver "Despliegue").
- **Servidor (`apps/server`):**
  - Fastify con Postgres (Drizzle).
  - Sirve el juego y `/api/health`, y aplica las migraciones al arrancar.
  - Las cuentas y el progreso llegan en los siguientes pasos del M7.
- **Protocolo (`packages/protocol`):** esquemas de Zod que comparten el cliente y el servidor.
- **Animación en cuatro fases:** esqueletos articulados, efectos, coreografía medida con metas de ritmo e interfaz animada.
- **Calidad:**
  - Pruebas unitarias con Vitest, que incluyen las del servidor contra Postgres.
  - e2e con Playwright, lint con Biome y tipos con TypeScript 7.
  - Un simulador de balance y un estimador de ritmo.
  - La CI de GitHub Actions corre todo eso y además construye y prueba la imagen de Docker.

## Puesta en marcha (una sola vez)

1. **Requisitos:** Node 22.12 o superior, Git y Docker Desktop. Activa pnpm con `corepack enable`; el repositorio fija pnpm 12.8.1. Si pnpm falla con "Cannot find module …/bin/pnpm.cjs", actualiza Corepack con `npm i -g corepack@latest`.
2. **Dependencias:** `pnpm install`.
3. **Variables de entorno:** `cp .env.example .env`, y cambia `SESSION_SECRET` por un valor aleatorio (`openssl rand -base64 48`). Git ignora `.env`. En producción las variables se cargan en Railway, no en un archivo.
4. **Postgres:** `docker compose up -d db`. Queda en el puerto 5434, para no chocar con otros Postgres de la máquina.

## Día a día

- **Jugar el sandbox:** `pnpm dev` y abre http://localhost:5173. No necesita el servidor.
- **Servidor en desarrollo:** `pnpm dev:server` sirve en http://localhost:3000 y se recarga al guardar. Sirve la API y, si antes corriste `pnpm build`, también el juego.
- **Todo como en producción:** `docker compose up --build` y abre http://localhost:3000. Es la misma imagen que se despliega.
- **Verificación completa:** `pnpm run ci` corre lint, tipos, pruebas y build. Con Postgres levantado, las pruebas del servidor usan la base de `DATABASE_URL_TEST`: cada corrida crea su propia base temporal y la borra al terminar. Sin esa variable, esas pruebas se saltan.
  - En pnpm 12, `pnpm ci` sin `run` es una instalación limpia que no verifica nada.
- **Pruebas en el navegador:** instala el navegador una vez con `pnpm --filter @ventisca/web exec playwright install chromium`, y después corre `pnpm e2e`. En una máquina sin GPU, usa `PW_SWIFTSHADER=1 pnpm e2e`.
- **Cambiar la base de datos:**
  1. Edita `apps/server/src/schema.ts`.
  2. Corre `pnpm db:generate`.
  3. Sube la migración nueva de `apps/server/drizzle/` junto con el cambio. El servidor la aplica al arrancar.

## Despliegue (Railway)

- **Dónde:** https://ventisca.wpena.dev, en Railway (plan Hobby, región EE. UU. Este), con su Postgres. La base no tiene copias de seguridad: es un riesgo aceptado, a revisar antes de que el proyecto crezca.
- **Cómo se despliega:** con cada push a `main`, es decir, al fusionar un PR.
  - Railway espera a que pase la CI ("Wait for CI") y construye la imagen del Dockerfile.
  - `railway.json` manda sobre el panel. Fija el comando de arranque, la comprobación de salud (`/api/health`), los reinicios, la región y qué cambios redespliegan (los de documentación no).
- **Migraciones:** el servidor las aplica al arrancar. Si fallan, el despliegue nuevo no pasa la comprobación de salud y sigue sirviendo el anterior.
- **Variables:** se cargan en el panel del servicio (Variables), nunca en el repositorio.
  - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
  - `PORT` = `3000`.
  - `LOG_LEVEL` = `info`.
  - Las de cuentas y correo llegan con los PRs 5 y 6.
- **DNS (D-58):** en wpena.dev hay dos registros: el CNAME `ventisca`, que apunta a Railway, y el TXT de verificación. El CNAME va en **"Solo DNS"** (nube gris en Cloudflare), nunca con el proxy. Con el proxy, Cloudflare ve todo el tráfico, inyecta su analítica en la página y agrega reportes de red hacia sus servidores, y nada de eso está declarado en el aviso de privacidad.
- **Comprobar un despliegue:** `pnpm check:prod`. Revisa:
  - el DNS sin el proxy;
  - el certificado de Let's Encrypt;
  - las cabeceras sin Cloudflare;
  - la redirección de HTTP a HTTPS;
  - la salud y el 404;
  - un turno jugado en Chromium sin pedir nada a otros dominios.

  Sale con código 1 si algo falla.
- **Registros:** en el panel de Railway, en cada despliegue; se pueden consultar 7 días. Los del servidor no guardan IPs; los de acceso de Railway sí, y el aviso de privacidad lo declara.
- **Volver atrás:** en Deployments, "Rollback" sobre un despliegue anterior.

## Herramientas útiles

- `?speed=0.2` en la URL acelera las animaciones (pruebas y demos).
- En desarrollo están expuestos `window.__ventisca` (store), `window.__ventiscaScene` (escena de Phaser) y `window.__ventiscaGame`.
- `pnpm sim -- --matches 2000 --skill 1 [--storm]` mide el balance con el bot, sin render.
- `pnpm pacing` mide cuánto dura la animación de cada turno sobre partidas del bot.

## Pendiente, según los PRD

- **M7, en pasos pequeños (PRD de v2):** cuentas en el servidor y en el cliente, y progreso en la cuenta. El despliegue ya está hecho.
- **Después del M7:** el M8 (partida en línea) y el M9 (emparejamiento). Antes del M8 hay que medir P-20 (equipos de colecciones mezcladas).
- Validar con personas: balance, ritmo y animaciones están calibrados con datos, pero nadie lo ha jugado todavía.
- QA en Firefox y Safari, control táctil, rangos y experiencia (P-18) y el video de demo.

## Cómo se trabaja

- Cada paso del M7 es un PR pequeño, con sus pruebas y la CI en verde. El dueño de producto lo revisa antes de fusionarlo, con merge commit y sin squash.
- Nunca se suben secretos al repositorio: cada variable se documenta en `.env.example`.

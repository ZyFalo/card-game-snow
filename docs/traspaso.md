# Traspaso a Claude Code

Estado al 1 de octubre de 2026: **v0.10, con el hito M7 completo**: cuentas y progreso en el servidor, todavía sin multijugador. Es el primer hito del modo en línea, que se describe en `docs/PRD-v2.md`; el siguiente es el M8. El juego se construyó en claude.ai hasta la v0.9, y desde entonces continúa en Claude Code.

## Qué hay

- **Sandbox para un jugador:**
  - Las reglas R-01 a R-24, con los tres ninjas y el mazo de referencia (D-50).
  - Sin cuenta ni progreso (D-34).
  - Dificultades Clásica y Tormenta, tres ritmos de reloj, pausa y ayuda.
- **Cuenta en el cliente (`apps/web/src/state/account.ts` y `ui/Account.tsx`):**
  - La portada ofrece "Jugar sin cuenta" y "Entrar"; con sesión, "Mi cuenta".
  - Pantallas de registro con el aviso de privacidad, verificación, entrada, recuperación, deshacer un cambio de correo y perfil (contraseña, correo, cierre de sesión y borrado).
  - Los resultados del sandbox invitan a crear una cuenta.
  - Las pantallas siguen `docs/lineamientos-de-diseno.md`. El beneficio de la cuenta que todavía no existe, "Juega en línea con amigos", lleva la etiqueta "Próximamente" (`BENEFITS` en `ui/Account.tsx`).
  - El script de Turnstile se carga solo en la vista de registro, como promete el aviso de privacidad.
  - Sin servidor (por ejemplo, con `pnpm dev` solo), la portada no muestra la cuenta y se juega igual.
- **Progreso en el cliente (`apps/web/src/state/progress.ts`, `ui/Progress.tsx` y `ui/CardFace.tsx`):**
  - El cliente no calcula el progreso: pide `/api/progress` y muestra lo que respondió el servidor (D-34).
  - Al verificar la cuenta o al entrar, quien todavía no eligió su carta de camino llega a elegirla (R-30). Puede dejarlo para después, y el perfil se lo recuerda (D-67).
  - El perfil hace de inicio en línea durante el M7 (D-67): a la derecha muestra el camino, las monedas, las cartas por elemento y las cajas abiertas, y su botón primario lleva a la colección y la tienda.
  - La colección muestra las 20 cartas de cada elemento, con las que faltan como siluetas (R-25). La tienda vende cajas de 1, 2 o 3 cartas del elemento elegido y revela lo que salió (R-28).
  - Cada compra lleva un identificador que genera el cliente y que conserva hasta que el servidor la confirma: si la respuesta se pierde, comprar de nuevo la misma caja no cobra dos veces (D-66 y D-68). Mientras espera, los botones de compra quedan deshabilitados.
  - **Hoy nadie puede ganar monedas:** se ganarán en las partidas en línea (M8). La tienda lo dice en futuro y con "Próximamente". Las e2e le pagan partidas a su cuenta con `apps/server/test/support/e2e-coins.ts`, que usa `creditRound` sobre la base de las e2e; el servidor no tiene ninguna ruta que regale monedas.
- **Motor puro (`packages/core`):** reglas, bot, progresión (R-25 a R-32) y logros. El servidor lo usará tal cual.
- **En línea:** https://ventisca.wpena.dev, en Railway (ver "Despliegue").
- **Servidor (`apps/server`):**
  - Fastify con Postgres (Drizzle).
  - Sirve el juego y `/api/health`, y aplica las migraciones al arrancar.
  - Cuentas (`/api/auth/*`), R-43 a R-49:
    - registro con captcha (Turnstile) y verificación con código de 6 dígitos;
    - inicio y cierre de sesión;
    - recuperación de la contraseña, cambio de contraseña y de correo, borrado, y deshacer un cambio de correo desde el correo anterior (R-50).
  - Los datos de cuenta viajan siempre en el cuerpo de la petición, nunca en la URL, porque los registros guardan la URL.
  - Ninguna respuesta revela si un correo tiene cuenta (D-59).
  - Límites en memoria (hay una sola instancia): 5 intentos fallidos de contraseña cada 15 min por cuenta y 50 por IP (D-61), y 3 correos por hora por dirección, salvo los avisos de seguridad.
  - `/api/config` entrega al cliente solo valores públicos (la clave del sitio de Turnstile).
  - Las peticiones que cambian estado solo se aceptan desde el propio juego (D-65): deben traer el `Origin` de `APP_URL`. La cookie `SameSite=Lax` no basta, porque para `SameSite` todo wpena.dev es el mismo sitio.
  - Progreso en la cuenta (`/api/progress`, D-34), con las reglas R-25 a R-30 resueltas por `packages/core`:
    - `GET /api/progress`: camino, monedas, cajas abiertas y colección;
    - `POST /api/progress/camino`: elige la carta de camino, que es permanente, y da el inventario inicial (R-30);
    - `POST /api/progress/boxes`: compra una caja; el servidor cobra y sortea las cartas (R-27, R-28). El cliente manda un identificador por compra: si reintenta con el mismo, recibe el resultado original y no paga de nuevo (D-66).
    - El libro de monedas (`coin_ledger`) guarda todos los movimientos del saldo: los cobros de rondas, positivos, y las compras, negativas, con sus cartas.
    - El cobro de las rondas no tiene ruta: `creditRound` (`apps/server/src/progress/store.ts`) lo hará al resolver las partidas en línea (M8). El libro de monedas impide pagar dos veces la misma ronda (D-31).
    - Los logros y las estadísticas llegan con las partidas (M8 y M9).
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
- **Probar las cuentas en el navegador:** además de `pnpm dev`, corre `pnpm dev:server`. Vite pasa `/api` al puerto 3000 y el código de cada correo aparece en la consola del servidor. El `.env` debe tener `DEV_ORIGIN=http://localhost:5173`, como en `.env.example`: sin él, el servidor rechaza lo que llegue desde el puerto de Vite (D-65).
- **Servidor en desarrollo:** `pnpm dev:server` sirve en http://localhost:3000 y se recarga al guardar. Sirve la API y, si antes corriste `pnpm build`, también el juego.
- **Correos en desarrollo:** sin `RESEND_API_KEY`, el servidor no los envía: los muestra en su consola, con el código. El captcha usa las claves de prueba públicas de Turnstile de `.env.example`, que siempre pasan.
- **Todo como en producción:** `docker compose up --build` y abre http://localhost:3000. Es la misma imagen que se despliega.
- **Verificación completa:** `pnpm run ci` corre lint, tipos, pruebas y build. Con Postgres levantado, las pruebas del servidor usan la base de `DATABASE_URL_TEST`: cada corrida crea su propia base temporal y la borra al terminar. Sin esa variable, esas pruebas se saltan.
  - En pnpm 12, `pnpm ci` sin `run` es una instalación limpia que no verifica nada.
- **Pruebas en el navegador:** instala el navegador una vez con `pnpm --filter @ventisca/web exec playwright install chromium`, y después corre `pnpm e2e`. En una máquina sin GPU, usa `PW_SWIFTSHADER=1 pnpm e2e`.
  - Necesitan Postgres (`docker compose up -d db`): levantan Vite en el puerto 5174 y el servidor de verdad en el 3100.
  - El servidor de las e2e usa su propia base, `ventisca_e2e`, que recrea en cada corrida en el Postgres de `DATABASE_URL_TEST`. La base de desarrollo no se toca.
  - Los correos no se envían: el servidor los guarda en `apps/web/.e2e-outbox/` (ignorada por git y vaciada en cada corrida), y de ahí las pruebas leen los códigos. El script de Turnstile se reemplaza por uno falso.
- **Cambiar la base de datos:**
  1. Edita `apps/server/src/schema.ts`.
  2. Corre `pnpm db:generate`.
  3. Sube la migración nueva de `apps/server/drizzle/` junto con el cambio. El servidor la aplica al arrancar.

## Despliegue (Railway)

- **Dónde:** https://ventisca.wpena.dev, en Railway (plan Hobby, región EE. UU. Este), con su Postgres. La base no tiene copias de seguridad: es un riesgo aceptado, a revisar antes de que el proyecto crezca.
- **Cómo se despliega:** con cada push a `main`, es decir, al fusionar un PR, toque lo que toque (D-64).
  - En el panel está activado "Wait for CI": Railway espera a que termine la CI de `main` y entonces construye la imagen del Dockerfile. Medido el 1 de octubre de 2026: no dejó ningún estado en el commit mientras corría la CI, empezó a desplegar 4 segundos después de que terminó y tardó 38. Así que entre fusionar y ver el cambio en producción pasa lo que dure la CI (de 3 a 10 minutos) y un minuto más.
  - GitHub muestra en cada commit dos suites en cola, de `railway-app` y `cursor`, que nunca corren nada. No detienen el despliegue.
  - `railway.json` es la fuente de verdad del despliegue. Fija el comando de arranque, la comprobación de salud (`/api/health`), los reinicios y la región. No lleva `watchPatterns`: con una lista de rutas vigiladas, un PR solo de documentación dejaría producción atrás a propósito, y `pnpm check:prod` exige que corra el último commit de `main`.
  - **En el panel del servicio deben quedar vacíos "Watch Paths", "Custom Build Command", "Custom Start Command" y "Root Directory".** El panel puede pisar a `railway.json` sin que se note. Al importar el monorepo, Railway puso por su cuenta un comando de arranque y uno de build con pnpm, y unas "Watch Paths" (`/apps/server/**`) que saltaron los despliegues de los PR #12 y #13, que solo tocaban `apps/web/` y documentación.
  - Si un despliegue no llega, mira el estado que Railway deja en el commit en GitHub. "No deployment needed - watched paths not modified" significa que lo saltó por las rutas vigiladas del panel.
- **Migraciones:** el servidor las aplica al arrancar. Si fallan, el despliegue nuevo no pasa la comprobación de salud y sigue sirviendo el anterior.
- **Variables:** se cargan en el panel del servicio (Variables), nunca en el repositorio.
  - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
  - `PORT` = `3000`.
  - `LOG_LEVEL` = `info`.
  - `SESSION_SECRET`: `openssl rand -base64 48`; la genera y la carga el dueño, nunca pasa por el chat.
  - `APP_URL` = `https://ventisca.wpena.dev`, sin barra final.
  - `RESEND_API_KEY`: con permiso solo de envío, restringida a ventisca.wpena.dev.
  - `TURNSTILE_SECRET_KEY` y `TURNSTILE_SITE_KEY`: el widget de Turnstile de ventisca.wpena.dev.
  - Sin `RESEND_API_KEY` o sin `TURNSTILE_SECRET_KEY`, en producción el registro responde `email_unavailable` o `captcha_unavailable`.
- **DNS de wpena.dev (en Cloudflare):**
  - **El juego (D-58):** el CNAME `ventisca` apunta a Railway, y el TXT `_railway-verify.ventisca` verifica el dominio. El CNAME va en **"Solo DNS"** (nube gris en Cloudflare), nunca con el proxy. Con el proxy, Cloudflare ve todo el tráfico, inyecta su analítica en la página y agrega reportes de red hacia sus servidores, y nada de eso está declarado en el aviso de privacidad.
  - **El envío de correos (Resend):** el TXT `resend._domainkey.ventisca` (DKIM) y `send.ventisca`, con el MX de rebotes y el SPF del envío.
  - **El correo de contacto (D-62):** wpena.dev usa Cloudflare Email Routing, con sus registros MX y SPF en la raíz, bloqueados por Cloudflare. Recibe `ventisca@wpena.dev` y lo reenvía al buzón del responsable. En la raíz también hay un DMARC en `p=none`.
  - **No actives la recepción de Resend en ventisca.wpena.dev:** pediría un MX en `ventisca`, y un nombre con CNAME no admite otros registros, así que chocaría con el CNAME del juego.
- **Comprobar un despliegue:** `pnpm check:prod`. Revisa:
  - el DNS sin el proxy;
  - un certificado válido con más de 14 días de vigencia (el emisor se muestra como dato);
  - las cabeceras sin Cloudflare;
  - la redirección de HTTP a HTTPS;
  - la salud y el 404;
  - que corra el último commit de main (`/api/health` lo informa); la lectura de `main` se reintenta, porque a veces falla sin que el despliegue tenga nada que ver;
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

- **M7 (PRD de v2):** su lista está completa: el despliegue, las cuentas y el progreso, en el servidor y en el cliente.
- **M8:** quita "Próximamente" de "Juega en línea con amigos".
  - **Inicio en línea:** el perfil hace de inicio durante el M7 (D-67). Con las partidas, se le suma "Jugar".
  - **Monedas:** al existir las partidas, la tienda deja de decir "Próximamente" (`earnHint` en `i18n/es.ts`).
  - **Origen del WebSocket:** `originGuard` no revisa los `GET`, y la conexión WebSocket empieza con uno. Necesita su propia comprobación de `Origin`, con su prueba (D-65).
  - **Doble de monedas:** hoy `creditRound` recibe si la persona ya tiene los 9 logros. En el M8 lo calcula el servidor desde su tabla de logros, al resolver la partida; nunca llega del cliente.
- **Textos en futuro:** la introducción de "Entrar" y la invitación de los resultados dicen "podrás jugar en línea y guardar tu progreso" (`loginIntro` e `invite` en `i18n/es.ts`). El progreso ya existe; vuelven al presente cuando llegue el juego en línea, con el M8. Lo mismo vale para los textos del progreso que hablan de las partidas en línea: `caminoIntro`, `collectionIntro`, `repeatedNote`, `revealNote`, `earnHint` y `profileIntro`.
- **Después del M7:** el M8 (partida en línea) y el M9 (emparejamiento). Antes del M8 hay que medir P-20 (equipos de colecciones mezcladas).
- Validar con personas: balance, ritmo y animaciones están calibrados con datos, pero nadie lo ha jugado todavía.
- QA en Firefox y Safari, control táctil, rangos y experiencia (P-18) y el video de demo.

## Cómo se trabaja

- Toda interfaz sigue `docs/lineamientos-de-diseno.md` (D-63) y se compara con una captura a 1280×720 junto a "Tu equipo".
- Cada paso del M7 es un PR pequeño, con sus pruebas y la CI en verde. El dueño de producto lo revisa antes de fusionarlo, con merge commit y sin squash.
- Nunca se suben secretos al repositorio: cada variable se documenta en `.env.example`.

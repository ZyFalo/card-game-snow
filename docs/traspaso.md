# Traspaso a Claude Code

Estado al 13 de octubre de 2026: **v0.10, con la Beta del modo en línea.** El M7 trajo las cuentas y el progreso en el servidor. El M8 y el M9, que se entregan juntos (D-84), traen el juego en línea: la cola pública, las salas con código, la partida en el servidor, las recompensas y sus pantallas. La Beta se publicó el 13 de octubre de 2026 y ese día tuvo su primera prueba con personas, de la que salieron los ajustes de D-104 a D-107: el amuleto de 4 pliegues con contadores, el avance siempre a la vista, "Mis cartas" por elemento y el aviso de mazo agotado. El modo en línea se describe en `docs/PRD-v2.md`. El juego se construyó en claude.ai hasta la v0.9, y desde entonces continúa en Claude Code. Ventisca empezó como proyecto de clase y hoy es el piloto de un proyecto personal, que su responsable avanza en sus ratos libres (D-75).

> **La Beta está publicada** desde el 13 de octubre de 2026 (PR #29): toda cuenta verificada puede jugar en línea. Cada despliegue reinicia el servidor y corta las partidas en curso, así que se fusiona cuando nadie esté jugando (D-95).
>
> **Los ajustes de la Beta reinician los logros** (D-104): al desplegarlos, la migración `0005_avance_de_logros` vacía la tabla de logros, porque los contadores nuevos no se pueden reconstruir. Las monedas no se tocan. Las metas de los logros salieron del simulador, cuyo bot casi no cae: se recalibran con los datos reales de la Beta (P-25).

## Qué hay

- **Sandbox para un jugador:**
  - Las reglas R-01 a R-24, con los tres ninjas y el mazo de referencia (D-50).
  - Sin cuenta ni progreso (D-34).
  - Dificultades Clásica y Tormenta, tres ritmos de reloj, pausa y ayuda.
- **Cuenta en el cliente (`apps/web/src/state/account.ts` y `ui/Account.tsx`):**
  - La portada ofrece "Jugar sin cuenta" y "Entrar"; con sesión, "Mi cuenta".
  - Pantallas de registro con el aviso de privacidad, verificación, entrada, recuperación, deshacer un cambio de correo y perfil (contraseña, correo, cierre de sesión y borrado).
  - Los resultados del sandbox invitan a crear una cuenta.
  - Las pantallas siguen `docs/lineamientos-de-diseno.md`.
  - El script de Turnstile se carga solo en la vista de registro, como promete el aviso de privacidad.
  - Sin servidor (por ejemplo, con `pnpm dev` solo), la portada no muestra la cuenta y se juega igual.
- **Progreso en el cliente (`apps/web/src/state/progress.ts`, `ui/Notebook.tsx`, `ui/Progress.tsx` y `ui/CardFace.tsx`):**
  - El cliente no calcula el progreso: pide `/api/progress` y muestra lo que respondió el servidor (D-34).
  - Al verificar la cuenta o al entrar, quien todavía no eligió su carta de camino llega a elegirla (R-30). Puede dejarlo para después, y el perfil se lo recuerda (D-67). Sin camino no se juega en línea: "Jugar en línea" lleva a elegirlo.
  - **La Libreta ninja** (D-100) reemplaza a "Tu progreso" y a "Colección y tienda". Se abre desde el perfil y desde los resultados de una partida en línea.
    - "Mi progreso" (D-105): arriba, el amuleto de papel de 4 pliegues, su explicación y las estadísticas privadas de Clásica (R-42); debajo, una tarjeta por pliegue (Fuego, Agua, Nieve y Equipo), que dice con quién se gana y muestra cada logro con su explicación, su contador y su barra. Cada pliegue se colorea al completarse y, con los cuatro, el amuleto dice que las monedas dobles están activas (R-29).
    - "Mis cartas" (D-105): un elemento a la vez, con una pestaña por elemento y dos páginas de 2 × 5, con las que faltan como siluetas (R-25). "Abrir cajas de [elemento]" lleva a la tienda de ese elemento, que vende cajas de 1, 2 o 3 cartas y revela lo que salió (R-28).
    - Lo que es puro del avance en pantalla (qué llena cada barra, qué pliegues están completos y qué sumó la última partida) vive en `state/achievements.ts`, con sus pruebas. El cliente no cuenta nada: muestra lo que dijo el servidor.
  - El perfil conserva un resumen corto, con el camino y las monedas, y su botón principal abre la Libreta ninja.
  - Cada compra lleva un identificador que genera el cliente (D-66). Mientras espera la respuesta, los botones de compra quedan deshabilitados.
  - El cliente conserva ese identificador solo si la respuesta se pierde (D-68): comprar de nuevo la misma caja no cobra dos veces. Entonces vuelve a leer el progreso, para mostrar el saldo real, y esa caja se puede reintentar aunque el saldo ya no alcance. Cualquier respuesta definitiva, sea la caja o un rechazo, borra el identificador. Tras un rechazo por monedas insuficientes también vuelve a leer el progreso.
  - En el código (`purchaseLost` en `state/progress.ts`), una respuesta perdida es que no llegó ninguna o que el servidor falló con un 500, porque un 500 tampoco dice si cobró.
  - **Las monedas se ganan en las partidas en línea** (R-40). Las e2e de la tienda le pagan partidas a su cuenta con `apps/server/test/support/e2e-coins.ts`, que usa `creditRound` sobre la base de las e2e, para no jugar una partida entera; el servidor no tiene ninguna ruta que regale monedas ni logros. Para los logros hay un apoyo igual, `e2e-achievements.ts`, que deja el avance de una cuenta como la prueba lo necesite.
- **Juego en línea en el cliente (Beta):**
  - **Tres capas.** `src/net/socket.ts` es la conexión: numera lo que sale, comprueba lo que entra con el protocolo y vuelve a conectarse, cada vez con más espera. `src/state/online.ts` lleva lo de fuera del tablero (la ficha, la cola, las salas y los avisos) y guarda lo que dice el servidor, sin calcular nada. La partida la lleva `src/state/actions.ts` con un `NetworkHost` (`src/host/`), que traduce los mensajes del servidor a los que la interfaz ya sabía mostrar.
  - **Las pantallas** (`ui/Online.tsx`, `ui/OnlineMatch.tsx` y `ui/online.css`), sobre las maquetas aprobadas: la ficha para elegir ninja (D-87), que al pie muestra el pliegue de ese ninja y el de Equipo con su avance (D-105), "Buscando equipo" con la oferta del bot (R-52), las salas con código (R-53), la carga con el consejo ninja, el combate y los resultados en pergamino, con lo que esa partida sumó a los logros. Fuera del combate son adaptables (D-97): una consulta de contenedor mide el ancho en que se dibujan (lineamientos, sección 13).
  - **En el combate:** el reloj es del servidor, una tarta que pierde una porción por segundo. Cada persona planea solo a su ninja y ve solo su mano; los planes de los demás llegan al tablero con las mismas marcas del sandbox (R-35), y la franja anuncia el combo. Quien confirmó lleva una marca verde, y el ninja de quien no está queda gris y dormido. No hay pausa, "Sugerir jugada" ni ayudas de daño y alcance (D-78): la ✕ es "Salir".
  - **Los avisos** (D-100): un diálogo cuando hay que decidir o enterarse de algo ("¿Salir de la partida?", "La partida terminó sin ti", "La partida terminó", "Abriste el juego en otra pestaña", "Tu sesión terminó"), y una franja arriba para lo pasajero ("Se perdió la conexión", "Volviste").
  - Al abrir el juego, quien se había desconectado de una partida en curso vuelve derecho a ella (R-38).
  - **La ayuda** tiene una sección "En línea" con lo que cambia: el equipo y el bot, el reloj, el ninja quieto, el abandono, las monedas y los reinicios. Los segundos del reloj salen de `PLAY_TURN_SECONDS` (`packages/protocol`), la misma constante que usa el servidor.
  - Lo que es puro del equipo (quién está listo, quién duerme y qué dice la franja) vive en `src/state/team.ts`, con sus pruebas.
  - **Mazo agotado** (D-106): cuando a un ninja no le quedan cartas en el mazo ni en la mano, el lugar de la mano dice que se acabaron, con un texto en línea y otro sin cuenta. En su panel, "Mazo 0" va en rojo y el medidor, apagado. Vale igual en el sandbox.
- **Portada y créditos:**
  - El pie de la portada dice "Piloto de un proyecto personal" (D-75) y lleva a los créditos y, con servidor, al aviso de privacidad.
  - La pantalla de créditos (`CreditsScreen` en `ui/Screens.tsx`) muestra el texto corto de `CREDITOS.md` (D-76); una prueba los compara. Es el único lugar del juego que nombra al original.
  - El aviso de privacidad dice que hoy el juego es gratuito: no vende nada ni muestra publicidad. Si eso cambia algún día, el aviso cambia antes.
- **Tablero (`apps/web/src/game/` y `apps/web/src/state/board.ts`):**
  - Cada unidad cabe en su casilla, con su barra de vida y sus estados dentro (`game/layout.ts`).
  - Al planificar a un ninja, el tablero le ofrece a la vez sus casillas y los objetivos que alcanza desde donde va a estar: un clic en un objetivo lo elige sin moverse, y un clic en una casilla lo mueve y recalcula los objetivos. No hay un paso de moverse, y solo colocar una carta es un modo aparte (casillas rojas). Los planes del equipo quedan en silueta y marca: un ataque elegido lleva un anillo con un arco del color de cada ninja que lo eligió, y una carta colocada, su miniatura, siempre al frente, con un lugar fijo por elemento y un borde dorado cuando hay combo.
  - El tablero muestra lo que se puede hacer, no el resultado. Lo demás es a pedido: el panel de cada ninja resume su plan sin números, la franja de arriba nombra al gólem que está bajo el ratón, sin números, y la vida que perdería un gólem y su alcance son ayudas opcionales, apagadas por defecto y solo en las partidas locales (D-78; `state/aids.ts`).
  - Ningún tinte se mezcla con otro: cada casilla lleva un solo relleno.
  - El foco no salta solo: se elige otro ninja con un clic, en el tablero o en su panel, o con Tab. "Pasar al siguiente ninja" viene apagado, y una migración única lo apagó también en los ajustes ya guardados en el navegador (D-79; `state/persist.ts`).
  - Consejos en el momento (D-80): cuatro consejos salen una sola vez cada uno, en una burbuja que va siempre junto a la mano, nunca sobre el tablero, y se cierran con "Entendido". Lo que señala lleva el borde dorado: el panel del ninja o la carta. Los aprendidos se guardan con los ajustes, y la ayuda permite volver a verlos. `state/tips.ts` decide qué consejo sale, cuándo y dónde.
  - Demostraciones de las cartas (D-81): el ▶ junto al título de la mano abre un tablero en miniatura donde la carta se juega en bucle, con o sin combo. No pausa el reloj ni mira la partida.
  - Demostraciones de los gólems (D-82): la franja que nombra a un gólem ofrece "Ver cómo ataca", que abre la misma burbuja con su ataque en bucle, las casillas golpeadas teñidas y un ninja a salvo. La franja se queda con el gólem un momento, para que se alcance el botón. Los números los pone el motor (`enemyStrike`, `sniperDamage` y `balance.json`).
  - `state/board.ts` decide qué capa se ve y cuándo, y `state/steps.ts`, qué hace cada clic. Los dos son puros y tienen sus pruebas; la escena solo dibuja y `state/actions.ts` solo aplica.
  - Las capas, sus colores y cuándo se ve cada una están en la sección 11 de `docs/lineamientos-de-diseno.md`.
- **Motor puro (`packages/core`):** reglas, bot, progresión (R-25 a R-32) y logros. El servidor lo usa tal cual para resolver las partidas en línea (D-02). De los logros (`achievements.ts`) el motor sabe cuáles son, en qué pliegue va cada uno, qué suma un turno a quien lleva a cada ninja (`countFeats`) y cómo avanza un contador hasta su meta (`advance`). Las metas están en `balance.json`.
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
    - El cobro de las rondas no tiene ruta: lo hace el servidor al cerrar cada partida en línea, con `creditRound` (`apps/server/src/progress/store.ts`). El libro de monedas impide pagar dos veces la misma ronda.
    - `GET /api/progress` trae también el avance de cada logro y las estadísticas privadas de su dueño (R-42 y R-55).
  - Juego en línea (`apps/server/src/play/`), R-33 a R-40 y R-52 a R-55:
    - **La conexión** (`routes.ts`): un WebSocket en `/api/play`. Antes de abrirla comprueba, en este orden, que viene del propio juego (su `Origin`, D-65), que trae una sesión vigente y que la cuenta verificó su correo. Limita el tamaño de cada mensaje y los mensajes por segundo. `GET /api/play/status` dice si la cuenta tiene una partida en curso.
    - **El centro del juego** (`hub.ts`): sabe quién está conectado y dónde está cada persona. Una conexión por cuenta: la nueva reemplaza a la anterior (D-102). Todo vive en la memoria del proceso, porque hay una sola instancia.
    - **La cola** (`queue.ts`) arma equipos con un ninja de cada elemento y, a los 30 s, ofrece el bot a dos personas (D-88). **Las salas** (`rooms.ts`) tienen un código de 6 caracteres y un asiento por elemento.
    - **La partida** (`match.ts`): el motor resuelve cada turno. El reloj da 10 s (D-90) y empieza cuando todas las personas terminaron de mirar el turno anterior. Cada plan se valida al llegar y se comparte con el equipo; confirmar es definitivo. El ninja de quien se desconecta queda quieto (D-92).
    - **Las cuentas de una partida** (`store.ts`): las monedas de cada ronda quedan pendientes y entran al libro al terminar (D-93). Quien abandona las pierde. Si el servidor se reinicia, se acreditan las rondas terminadas (D-94). El avance de los logros se suma en cada turno, a quien está conectado, y no pasa de la meta (R-55); la tabla guarda el total de la cuenta, no lo de cada partida. El doble de monedas lo decide el servidor contando los logros completos de su tabla (R-29).
    - **El arranque** (`start.ts`): al levantarse, da por interrumpidas las partidas que un reinicio dejó vivas; al apagarse con SIGTERM, interrumpe las que tiene en curso y les dice a los clientes por qué se cierra.
    - Los registros de una partida dicen su identificador, sus turnos y cuántas personas quedaron: sin nombres, correos ni IPs.
- **Protocolo (`packages/protocol`):** esquemas de Zod que comparten el cliente y el servidor: la API y los mensajes del juego en línea, en los dos sentidos.
- **Animación en cuatro fases:** esqueletos articulados, efectos, coreografía medida con metas de ritmo e interfaz animada.
- **Calidad:**
  - Pruebas unitarias con Vitest, que incluyen las del servidor contra Postgres y con conexiones WebSocket de verdad.
  - e2e con Playwright, también con dos y tres navegadores a la vez para el juego en línea; lint con Biome y tipos con TypeScript 7.
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
- **Jugar en línea en tu máquina:** con `pnpm dev` y `pnpm dev:server` corriendo, abre el juego en dos ventanas que no compartan sesión (una normal y una privada, o dos perfiles del navegador) y crea una cuenta en cada una. Con dos personas: una sala con código y "Empezar con el bot", o la cola, que ofrece el bot a los 30 s. Con tres, una ventana más.
- **Servidor en desarrollo:** `pnpm dev:server` sirve en http://localhost:3000 y se recarga al guardar. Al recargarse se pierden las partidas en curso, como en un despliegue (R-54). Sirve la API y, si antes corriste `pnpm build`, también el juego.
- **Correos en desarrollo:** sin `RESEND_API_KEY`, el servidor no los envía: los muestra en su consola, con el código. El captcha usa las claves de prueba públicas de Turnstile de `.env.example`, que siempre pasan.
- **Todo como en producción:** `docker compose up --build` y abre http://localhost:3000. Es la misma imagen que se despliega.
- **Verificación completa:** `pnpm run ci` corre lint, tipos, pruebas y build. Con Postgres levantado, las pruebas del servidor usan la base de `DATABASE_URL_TEST`: cada corrida crea su propia base temporal y la borra al terminar. Sin esa variable, esas pruebas se saltan.
  - En pnpm 12, `pnpm ci` sin `run` es una instalación limpia que no verifica nada.
- **Pruebas en el navegador:** instala el navegador una vez con `pnpm --filter @ventisca/web exec playwright install chromium`, y después corre `pnpm e2e`. En una máquina sin GPU, usa `PW_SWIFTSHADER=1 pnpm e2e`.
  - **Cuando una prueba falla, queda su evidencia** en `apps/web/test-results/<prueba>/`: una captura (`test-failed-1.png`), el estado de la pantalla (`error-context.md`) y la traza (`trace.zip`), que se abre con `pnpm --filter @ventisca/web exec playwright show-trace <ruta>/trace.zip`.
  - **La corrida siguiente vacía esa carpeta:** copia la evidencia antes de repetir las pruebas. En la CI se sube como el artefacto `evidencia-e2e` de la corrida que falló, y se conserva 14 días.
  - **Qué guarda la traza:** en las pruebas de cuentas y de progreso va completa, con el registro de red y el DOM de cada paso. En las del tablero guarda los pasos, la consola y los fotogramas, porque las instantáneas del DOM las frenan mucho. En las de teclado va apagada, porque miden lo que pasa mientras se mantiene una tecla.
  - Necesitan Postgres (`docker compose up -d db`): levantan Vite en el puerto 5174 y el servidor de verdad en el 3100.
  - El servidor de las e2e usa su propia base, `ventisca_e2e`, que recrea en cada corrida en el Postgres de `DATABASE_URL_TEST`. La base de desarrollo no se toca.
  - Los correos no se envían: el servidor los guarda en `apps/web/.e2e-outbox/` (ignorada por git y vaciada en cada corrida), y de ahí las pruebas leen los códigos. El script de Turnstile se reemplaza por uno falso.
  - **Las del juego en línea** (`e2e/online*.spec.ts` y `e2e/restart.spec.ts`) abren un navegador por persona, con su cuenta creada por la API.
    - El servidor de las pruebas (`apps/server/test/support/e2e-server.ts`) arranca con sus propios plazos: un turno de 60 s, para que una prueba no dependa del reloj, y la oferta del bot a los 4 s.
    - Tiene además un control, en el puerto 3101 y solo en esa máquina (`e2e/control.ts`). Con él una prueba le pide el tablero de su sala (`prepareBoard`), para que su partida termine en pocos turnos, o un reinicio del servidor (`restartServer`). El tablero dice dónde va cada quien, su vida, su mano y, si hace falta, cuántas cartas le quedan en el mazo. Las partidas de las demás salas salen del motor, como en producción.
    - La del reinicio corta a todo el que esté conectado, así que corre sola, al final: es el proyecto `reinicio` de `playwright.config.ts`, que espera al proyecto `juego`. Para correrla sin repetir las demás: `pnpm --filter @ventisca/web exec playwright test --project reinicio --no-deps`. Con un filtro (`--grep` o `--grep-invert`) hay que pedir el proyecto (`--project juego`): si no, Playwright corre entero el proyecto del que depende el del reinicio. La CI corre los dos por separado. Para correr solo algunos archivos, el proyecto va pegado con un igual (`playwright test e2e/progress.spec.ts --project=juego`): con un espacio, Playwright toma los archivos que siguen por nombres de proyecto.
    - La cola pública es una sola para todo el servidor: las pruebas que entran a ella viven en `online.spec.ts`, donde corren una tras otra. Las demás usan salas.
    - Cortar la red del navegador no cierra un WebSocket ya abierto: `dropLink` (`e2e/online-helpers.ts`) la corta y además cierra la conexión desde la página.
- **Cambiar la base de datos:**
  1. Edita `apps/server/src/schema.ts`.
  2. Corre `pnpm db:generate`.
  3. Sube la migración nueva de `apps/server/drizzle/` junto con el cambio. El servidor la aplica al arrancar.

## Despliegue (Railway)

- **Dónde:** https://ventisca.wpena.dev, en Railway (plan Hobby, región EE. UU. Este), con su Postgres. La base no tiene copias de seguridad: es un riesgo aceptado, a revisar antes de que el proyecto crezca.
- **Cómo se despliega:** con cada push a `main`, es decir, al fusionar un PR, toque lo que toque (D-64).
  - En el panel está activado "Wait for CI": Railway espera a que termine la CI de `main` y entonces construye la imagen del Dockerfile. Medido el 1 de octubre de 2026: no dejó ningún estado en el commit mientras corría la CI, empezó a desplegar 4 segundos después de que terminó y tardó 38. Así que entre fusionar y ver el cambio en producción pasa lo que dure la CI y un minuto más. Con las e2e del juego en línea, la CI tarda unos 20 minutos: abren dos y tres navegadores por prueba, y en la CI el tablero se dibuja sin tarjeta gráfica.
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
  - el juego en línea: que pregunte por la sesión (401) al pedir la conexión desde el propio juego, y que la rechace (403) desde otro origen o sin decir de dónde viene (D-65). Sin una cuenta no puede abrir la conexión: eso se comprueba a mano, entrando a "Jugar en línea";
  - un turno jugado en Chromium sin pedir nada a otros dominios.

  Sale con código 1 si algo falla.
- **Registros:** en el panel de Railway, en cada despliegue; se pueden consultar 7 días. Los del servidor no guardan IPs; los de acceso de Railway sí, y el aviso de privacidad lo declara. Cada partida en línea deja "Empieza una partida" y "Termina una partida", con su identificador, sus turnos y cuántas personas quedaron.
- **Desplegar con gente jugando:** cada despliegue reinicia el servidor, y las partidas en curso se pierden (R-54): cada persona conserva las monedas de sus rondas terminadas y ve un aviso. Por eso se fusiona cuando nadie esté jugando (D-95). En Railway, el servidor nuevo puede arrancar antes de que el anterior se apague: entonces es él quien da por interrumpidas las partidas, y el anterior, al notarlo, las termina sin pagar de nuevo.
- **Volver atrás:** en Deployments, "Rollback" sobre un despliegue anterior. Las migraciones no se deshacen: volver a una versión anterior a una migración que cambió una tabla puede romperla. Pasa con la de los ajustes de la Beta (`0005_avance_de_logros`, D-104): la versión de antes escribe en `achievements` una columna que ya no existe, y fallaría al guardar un logro en plena partida. Si hay que deshacer esos ajustes, se hace con un commit nuevo, no con "Rollback".

## Herramientas útiles

- `?speed=0.2` en la URL acelera las animaciones (pruebas y demos).
- En desarrollo están expuestos `window.__ventisca` (store), `window.__ventiscaScene` (escena de Phaser) y `window.__ventiscaGame`. `window.__ventiscaLoad(estado)` deja la partida local en curso en un tablero preparado, también en el anfitrión: así una prueba e2e resuelve un turno de verdad sobre el tablero que necesita. En línea el tablero es del servidor: las e2e se lo piden con `prepareBoard` (ver "Pruebas en el navegador").
- Las capturas de la escena se toman con la tarjeta gráfica (`--use-angle=metal --enable-gpu --ignore-gpu-blocklist` al lanzar Chromium). Con el render por software (SwiftShader), las piezas giradas de las figuras salen recortadas: es un defecto de ese render, no del juego.
- `pnpm sim -- --matches 2000 --skill 1 [--storm]` mide el balance con el bot, sin render. Con `--team fire=new,water=full,snow=bot` arma un equipo en línea asiento por asiento, y con `--mixed` reproduce las tablas de equipos de colecciones mezcladas del reporte de balance (P-20). Con `--achievements` mide lo que cada partida suma a los logros y cuántas partidas tarda cada pliegue (D-107); `--goals` prueba otras metas sin tocar el balance.
- `pnpm pacing` mide cuánto dura la animación de cada turno sobre partidas del bot.

## Lo que sigue

El M7, P-20, la ronda de claridad del tablero, la Beta del modo en línea y los ajustes de su primera prueba están hechos. Va en este orden:

1. **Publicar los ajustes de la Beta.**
   1. Su PR (#30) está revisado y aprobado, con un cambio ya aplicado: qué cuenta "Nadie se queda atrás" (P-25).
   2. Fusionarlo cuando nadie esté jugando (D-95), con merge commit y sin squash. No hay variables nuevas que cargar en Railway.
   3. Esperar el despliegue y correr `pnpm check:prod`.
   4. Mirar en los registros de Railway que el arranque diga "Migraciones al día": la migración `0005_avance_de_logros` reinicia los logros y cambia su tabla.
   5. Quien tenga el juego abierto desde antes verá el aviso de que hay una versión nueva al entrar a "Jugar en línea": el protocolo pasó a la versión 2.
   6. Si algo falla tras el despliegue, se corrige con un PR nuevo: esa migración no admite volver atrás con "Rollback" (ver "Despliegue").
2. **Seguir la Beta con personas,** con `docs/guia-beta.md`. Quedan por decidir, con lo que se vea:
   - si el reloj se queda en 10 s (D-90), si el abandono se siente justo (D-93, P-22) y si las marcas del tablero bastan para coordinarse sin chat (D-91);
   - el ritmo real del amuleto: tras unas semanas de Beta se mide y se ajustan las metas. Las de "De pie otra vez" y "Reanimador" quedaron en 1 porque el bot del simulador casi no cae (P-25).
3. **Después de la Beta,** sin orden decidido:
   - el mecanismo para avisar los cambios del aviso de privacidad (D-96): hasta que exista, el aviso queda congelado;
   - Tormenta en línea (D-85), con su mínimo de 5 cartas por elemento (R-51) en las salas y en la cola;
   - el resto de las estadísticas de R-42 (D-86);
   - el teléfono: la investigación de D-73 y el combate en línea, que hoy es para computador (D-97);
   - las defensas contra el abuso del juego en línea (P-26), que se deciden antes de publicar rangos visibles, eventos con insignias o cualquier pago.

### Rondas cerradas

- **Ronda de claridad del tablero** (D-74 y D-77 a D-82), cerrada el 12 de octubre de 2026 en siete PRs. Lo que dejó está en "Qué hay", en el PRD y en la sección 11 de `docs/lineamientos-de-diseno.md`.
  - **Hallazgo de la primera prueba con personas** (octubre de 2026): el juego se siente muy bien. Lo único: la gente elige por su cuenta al siguiente ninja, y el paso automático la confunde. Por eso "Pasar al siguiente ninja" viene apagado (D-79).
  - **Las tablas de P-20** se volvieron a correr al cerrarla, sin cambios, y otra vez con el bot afinado al revivir (D-101): las de ahora están en `docs/balance-report.md`.
  - **Reglas de las demostraciones** (D-81 y D-82), que valen para las que se agreguen:
    - una burbuja a la vez; Esc o un clic fuera la cierran;
    - no pausan el reloj y funcionan igual en línea: muestran qué hace algo, nunca cuánto daño hará la jugada;
    - sin videos: cada demostración la juega el propio motor, con el arte y las animaciones del juego, en un tablero en miniatura (`state/demos.ts` lo prepara y `game/DemoScene.ts` lo anima);
    - con animaciones reducidas, el antes y el después como dos imágenes fijas, con una línea de texto;
    - los números salen del motor, nunca escritos a mano.
- **Segunda prueba con personas del tablero,** aprobada el 12 de octubre de 2026. La hace el dueño de producto por su cuenta, y no frena lo demás. Cuatro a seis personas, la mitad sin haber jugado nunca, una partida de Clásica en el sandbox con los ajustes por defecto, pensando en voz alta y sin explicación previa. Se mira, sin preguntar: si leen los consejos o los cierran, si después de cada uno hacen lo que dice, si encuentran solas el ▶ de la mano y "Ver cómo ataca", y si tras ver a Granizo y a Témpano dejan de amontonarse. Al final, tres preguntas: qué hace cada gólem, cómo se logra un combo y qué fue lo más confuso.

## Pendientes anotados

Para que no se pierdan. Los que tienen hito están también en el PRD de v2.

- **Mecanismo para avisar los cambios del aviso de privacidad** (D-96): un aviso en el juego al entrar y un correo a todas las cuentas. El aviso lo promete en "Cambios". Llega después de la Beta, y hasta entonces el aviso no se toca. Sus dos correcciones se hicieron sin aviso previo: la del 6 de octubre de 2026 (D-75), cuando todas las cuentas eran internas, y la del multijugador, en el PR de la Beta, por decisión del dueño de producto (D-96).
- **Mínimo para Tormenta** (R-51), en las salas y en la cola: llega con Tormenta en línea (D-85).
- **Investigación del teléfono** (D-73): no se hizo antes de la Beta. Hace falta para decidir el combate en teléfono.
- **La pantalla de carga en línea no se adapta** a ventanas angostas: lleva al combate, que es para computador (D-73).
- **Medir el ritmo real del amuleto tras unas semanas de Beta y ajustar las metas** (D-107 y P-25). Las metas salieron del simulador, cuyo bot casi no cae: "De pie otra vez" y "Reanimador" quedaron en una sola vez, y "Nadie se queda atrás" cambió de regla para entrar en el ritmo (`docs/balance-report.md`, "Logros: metas y ritmo"). El servidor todavía no guarda cuánto cae cada persona: es de las estadísticas de R-42 que faltan.
- **Defensas contra el abuso del juego en línea** (P-26, abierta): varias cuentas de una misma persona, programas que juegan solos y abandonos a propósito. Queda por revisar si existe un límite de conexiones por IP y un tope de intentos de unirse a salas.
- **La ficha de "Jugar en línea" quedó justa de alto:** con los dos pliegues al pie, ocupa los 652 px que tiene a 1280×720. Si se le agrega algo más, hay que quitarle otra cosa o darle otra forma.
- **Dos pruebas que fallan a veces, sin relación con lo que se esté cambiando:**
  - la e2e de `tips.spec.ts` que mide la burbuja de "cambiar de ninja" junto a la mano falló una vez en la CI por 2 px, al parecer en plena animación de entrada;
  - la prueba del servidor `D-61: 50 intentos fallidos por IP` puede pasarse de sus 5 s con el equipo muy cargado.
- **La CI tarda unos 20 minutos,** unos 6 más que antes de la Beta, por las e2e del juego en línea, y Railway espera a la CI para desplegar. Si estorba, hay dos salidas sin quitar pruebas: correr las e2e con tres procesos en vez de dos, o repartirlas en dos trabajos de la CI. Ninguna está probada.
- **La base de producción no tiene copias de seguridad** (ver "Despliegue"). Con la Beta guarda monedas y logros de otras personas: conviene decidirlo antes de que crezca.
- Validar con personas: balance, ritmo y animaciones están calibrados con datos; la primera prueba dejó D-79.
- QA en Firefox y Safari, control táctil, rangos y experiencia (P-18) y el video de demo.

## Cómo se trabaja

- Toda interfaz sigue `docs/lineamientos-de-diseno.md` (D-63) y se compara con una captura a 1280×720 junto a "Tu equipo".
- Cada paso es un PR pequeño, con sus pruebas y la CI en verde. El dueño de producto lo revisa antes de fusionarlo, con merge commit y sin squash.
- Nunca se suben secretos al repositorio: cada variable se documenta en `.env.example`.
- `docs/ideas/` guarda ideas del dueño de producto para después (su `README.md` es el índice). No son decisiones ni tareas: nada de esa carpeta se implementa sin pasar antes por el PRD.

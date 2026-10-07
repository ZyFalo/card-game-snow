# Traspaso a Claude Code

Estado al 6 de octubre de 2026: **v0.10, con el M7 y P-20 cerrados.** El M7 trajo las cuentas y el progreso en el servidor, todavía sin multijugador, y P-20 fijó la curva de dificultad en línea. Está en curso la ronda de claridad del tablero (D-74), con sus dos primeros pasos hechos; después viene el M8, que empieza por su especificación técnica y por la investigación del teléfono (ver "Lo que sigue"). El modo en línea se describe en `docs/PRD-v2.md`. El juego se construyó en claude.ai hasta la v0.9, y desde entonces continúa en Claude Code. Ventisca empezó como proyecto de clase y hoy es el piloto de un proyecto personal, que su responsable avanza en sus ratos libres (D-75).

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
  - Cada compra lleva un identificador que genera el cliente (D-66). Mientras espera la respuesta, los botones de compra quedan deshabilitados.
  - El cliente conserva ese identificador solo si la respuesta se pierde (D-68): comprar de nuevo la misma caja no cobra dos veces. Entonces vuelve a leer el progreso, para mostrar el saldo real, y esa caja se puede reintentar aunque el saldo ya no alcance. Cualquier respuesta definitiva, sea la caja o un rechazo, borra el identificador.
  - En el código (`purchaseLost` en `state/progress.ts`), una respuesta perdida es que no llegó ninguna o que el servidor falló con un 500, porque un 500 tampoco dice si cobró.
  - **Hoy nadie puede ganar monedas:** se ganarán en las partidas en línea (M8). La tienda lo dice en futuro y con "Próximamente". Las e2e le pagan partidas a su cuenta con `apps/server/test/support/e2e-coins.ts`, que usa `creditRound` sobre la base de las e2e; el servidor no tiene ninguna ruta que regale monedas.
- **Portada y créditos:**
  - El pie de la portada dice "Piloto de un proyecto personal" (D-75) y lleva a los créditos y, con servidor, al aviso de privacidad.
  - La pantalla de créditos (`CreditsScreen` en `ui/Screens.tsx`) muestra el texto corto de `CREDITOS.md` (D-76); una prueba los compara. Es el único lugar del juego que nombra al original.
  - El aviso de privacidad dice que hoy el juego es gratuito: no vende nada ni muestra publicidad. Si eso cambia algún día, el aviso cambia antes.
- **Tablero (`apps/web/src/game/` y `apps/web/src/state/board.ts`):**
  - Cada unidad cabe en su casilla, con su barra de vida y sus estados dentro (`game/layout.ts`).
  - Cada ninja se planifica en dos pasos: moverse (solo casillas) y actuar (sus objetivos, con las casillas a la vista para cambiar de destino con otro clic). Solo colocar una carta es un modo exclusivo (casillas rojas). Los planes del equipo quedan en silueta y marca: un ataque elegido lleva un anillo con un arco del color de cada ninja que lo eligió.
  - `state/board.ts` decide qué capa se ve y cuándo, y `state/steps.ts`, qué hace cada clic en cada paso. Los dos son puros y tienen sus pruebas; la escena solo dibuja y `state/actions.ts` solo aplica.
  - Las capas, sus colores y cuándo se ve cada una están en la sección 11 de `docs/lineamientos-de-diseno.md`.
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
  - **Cuando una prueba falla, queda su evidencia** en `apps/web/test-results/<prueba>/`: una captura (`test-failed-1.png`), el estado de la pantalla (`error-context.md`) y la traza (`trace.zip`), que se abre con `pnpm --filter @ventisca/web exec playwright show-trace <ruta>/trace.zip`.
  - **La corrida siguiente vacía esa carpeta:** copia la evidencia antes de repetir las pruebas. En la CI se sube como el artefacto `evidencia-e2e` de la corrida que falló, y se conserva 14 días.
  - **Qué guarda la traza:** en las pruebas de cuentas y de progreso va completa, con el registro de red y el DOM de cada paso. En las del tablero guarda los pasos, la consola y los fotogramas, porque las instantáneas del DOM las frenan mucho. En las de teclado va apagada, porque miden lo que pasa mientras se mantiene una tecla.
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
- En desarrollo están expuestos `window.__ventisca` (store), `window.__ventiscaScene` (escena de Phaser) y `window.__ventiscaGame`. `window.__ventiscaLoad(estado)` deja la partida en curso en un tablero preparado, también en el anfitrión: así una prueba e2e resuelve un turno de verdad sobre el tablero que necesita.
- Las capturas de la escena se toman con la tarjeta gráfica (`--use-angle=metal --enable-gpu --ignore-gpu-blocklist` al lanzar Chromium). Con el render por software (SwiftShader), las piezas giradas de las figuras salen recortadas: es un defecto de ese render, no del juego.
- `pnpm sim -- --matches 2000 --skill 1 [--storm]` mide el balance con el bot, sin render. Con `--team fire=new,water=full,snow=bot` arma un equipo en línea asiento por asiento, y con `--mixed` reproduce las tablas de equipos de colecciones mezcladas del reporte de balance (P-20).
- `pnpm pacing` mide cuánto dura la animación de cada turno sobre partidas del bot.

## Lo que sigue

El M7 y P-20 están cerrados. Va en este orden:

1. **Ronda de claridad del tablero** (D-74), antes del M8. Quienes probaron el juego dicen que es confuso: los planes de los tres ninjas se superponen. Los ajustes los pasa el dueño de producto. Va en cinco PRs pequeños, cada uno con capturas de antes y después a 1280×720 junto a "Tu equipo":
   1. **Orden visual.** Hecho: ver la sección 11 de `docs/lineamientos-de-diseno.md`.
   2. **Foco y pasos.** Hecho: solo el ninja activo muestra sus opciones, la planificación va en dos pasos (moverse y actuar) y elegir una carta cambia el tablero a modo carta. Ajustado después, como en el original: tras moverse, las casillas siguen a la vista y otro clic cambia el destino; el foco no salta tras moverse; y los objetivos elegidos llevan la marca del equipo, con un arco por atacante.
   3. **La reanimación vuelve a la regla del original.** Hecho (D-77, que reemplaza a D-18): quien revive queda ocupado durante la fase enemiga, y el caído se levanta al final del turno con 1 de vida; si quien revive cae antes, la reanimación no ocurre. La medición del balance de antes y después está en `docs/balance-report.md`.
   4. **Información a pedido.** Pendiente. Lleva su decisión, con el siguiente número libre.
      - **El resumen del plan** de cada ninja en los paneles, sin números ("Moverse → atacar a Témpano").
      - **Al pasar sobre un gólem,** su nombre y un consejo corto sobre cómo ataca, sin pintar casillas.
      - **Las ayudas de daño y de alcance:** "Ver el daño antes de confirmar" y "Ver el alcance de los enemigos", en el grupo "Ayudas" de la pantalla de equipo. Apagadas por defecto y solo en las partidas locales (sandbox y un jugador). En línea no están disponibles: con el M8, las partidas en línea las ignoran y no las muestran.
      - **Las cartas colocadas de los ninjas que no están activos** se reducen a su miniatura y a un contorno fino y tenue de su área, sin relleno ni borde grueso. El área completa se ve solo con su dueño activo, o al pasar el ratón sobre la miniatura.
      - **La miniatura** es una carta pequeña, igual a las de la mano, con el símbolo de su elemento (llama, ola o copo) en su color y su valor pequeño en una esquina. Reemplaza al número en círculo, que se confunde con los números de orden.
      - **Un lugar fijo por elemento** dentro de la casilla: Fuego a la izquierda, Agua al centro y Nieve a la derecha, el mismo orden de los paneles. Va en la franja superior de la casilla, sin tapar a la unidad que esté en ella. Con tres cartas en la misma casilla se ven las tres, sin superponerse y sin moverse al sumarse otra.
      - **Un solo contorno** para el área cuando varias cartas comparten casilla. Al pasar el ratón sobre cualquiera de ellas se ve el área completa.
      - **El combo se anuncia:** si dos o más ninjas tienen carta en el mismo turno, sus miniaturas llevan un borde dorado, estén en la misma casilla o en distintas.
      - **Las capas:** las casillas y las marcas del ninja activo quedan siempre por encima de las de los demás, y ningún tinte se mezcla con otro. Si una casilla es opción del ninja activo, se ve solo su color.
      - **Pruebas y capturas:** una, dos y tres cartas en la misma casilla, y dos cartas en casillas distintas con combo; la prueba de que ninguna miniatura tapa a otra; y, de antes y después, la escena de la carta de 11 de Escarcha con Brasa activo en el paso de moverse. La regla va a la sección "Tablero" de los lineamientos.
   5. **Consejos en el momento.** Una línea junto al ninja activo según el paso, que deja de mostrarse tras varias veces; la franja superior queda solo con el estado del turno. El consejo de la primera caída (R-09), que hoy sale una vez por partida, se suma a esa lógica: deja de mostrarse al aprenderlo.

   Para toda la ronda:
   - cada cambio de reglas o de balance lleva su regla o su decisión en el PRD, y sus pruebas;
   - si afecta el balance, va con una simulación antes y otra después;
   - la sección "Tablero" de los lineamientos crece con cada paso: qué capas existen, sus colores, cuándo se ve cada una y qué modo es exclusivo;
   - al terminar, se vuelven a correr las tablas de P-20 (`pnpm sim -- --mixed` y `pnpm sim -- --mixed --skill 1`) y se actualiza `docs/balance-report.md`, porque los ajustes pueden mover sus números;
   - al terminar, se propone una prueba corta con personas: tres tareas como "haz que Marea ataque a Témpano", "cura a Brasa" y "usa una carta", midiendo errores y dudas.
2. **M8: partida en línea.** No se programa hasta que el dueño de producto revise su especificación técnica.
   - **Especificación técnica,** en un PR de documentación. Se escribe después de la ronda de jugabilidad, porque los ajustes pueden cambiar reglas que ella usa. Debe cubrir:
     - **Protocolo:** los mensajes y sus esquemas, la frecuencia de los fantasmas de los compañeros, el reloj y los plazos en el servidor, y el ciclo de vida de una sala.
     - **Desconexiones:** qué plan juega el bot si alguien se desconecta a mitad de la planificación; cómo vuelve una persona a una partida en curso; y qué pasa con las partidas cuando Railway redespliega (aviso a los clientes, reconexión automática y restauración desde la foto de cada turno, D-49).
     - **Emparejamiento y salas:** el ninja de cada persona (D-43), la espera de 30 s con el bot (D-44), el mínimo de 5 cartas para Tormenta (R-51) y las salas con código.
     - **Recompensas:** el pago por ronda con el libro de monedas (D-48), los logros calculados por el servidor desde su propia tabla, incluido el doble de monedas, y las estadísticas (R-42).
     - **Seguridad:** la comprobación de `Origin` en la conexión WebSocket, con su prueba; sesión obligatoria en esa conexión; límites de mensajes por segundo y de tamaño por conexión; y la validación de cada plan en el servidor con `packages/core`.
     - **Pruebas:** con dos y tres clientes, e2e con varios navegadores a la vez y un plan para una partida de prueba con personas reales.
   - **Investigación del teléfono** (D-73), en ese PR o en uno aparte: capturar la portada, las cuentas, la colección y el tablero en 390×844 (vertical) y 844×390 (horizontal), probar los controles táctiles del tablero, y decir qué se rompe y qué haría falta. Con eso se decide el alcance del teléfono y lo que hay que sumar a los lineamientos de diseño.
   - **Dispositivos (D-73):** el combate en línea del M8 se diseña para computador. Las pantallas nuevas del M8 (sala, cola y equipo en línea) se construyen adaptables desde el principio, con diseño fluido y no dentro del escenario fijo de 1280×720.
3. **M9: emparejamiento y estadísticas.**

## Pendientes anotados

Para que no se pierdan. Los seis primeros están también en su hito del PRD de v2.

- **Releer el progreso tras un rechazo por monedas insuficientes** (D-68). Hoy el cliente solo lo relee tras una respuesta perdida, así que tras ese rechazo el saldo en pantalla queda viejo. Va en el próximo PR del cliente.
- **Comprobación de `Origin` en la conexión WebSocket** (M8). `originGuard` no revisa los `GET`, y la conexión WebSocket empieza con uno: necesita su propia comprobación, con su prueba (D-65).
- **Logros calculados por el servidor** (M8). Hoy `creditRound` recibe si la persona ya tiene los 9 logros. En el M8 el servidor los calcula desde su propia tabla al resolver la partida, incluido el doble de monedas; nunca llegan del cliente.
- **Mínimo para Tormenta** (R-51): en las salas con código (M8) y en la cola (M9).
- **Mecanismo para avisar los cambios del aviso de privacidad** (M9): un aviso en el juego al entrar y un correo a todas las cuentas. Debe existir antes de que haya cuentas de otras personas: desde entonces, cualquier cambio del aviso pasa por él, porque el aviso lo promete en "Cambios". El cambio del 6 de octubre de 2026 (D-75) fue una corrección previa a la apertura, sin aviso previo, porque todas las cuentas seguían siendo internas.
- **Investigación del teléfono** (D-73), antes de programar el M8.
- **Afinar el bot al revivir, antes del M8.** Hoy mira si a quien revive lo alcanza algún gólem, en la casilla desde donde revive (D-77). Debe evaluar si quien revive podría caer, no solo si un gólem lo alcanza: un ninja con mucha vida aguanta un golpe y completa la reanimación. Se mide con el simulador antes del M8, porque en línea el bot cubrirá a personas (D-35).
- **Dos personas que eligen revivir al mismo caído** (M8). En el sandbox lo impide la planificación: un caído solo puede tener un reanimador (R-09). En línea cada persona planifica su ninja a la vez, así que pueden llegar los dos planes: el motor hace valer al primero en el orden de R-11 y el otro pierde su acción. La especificación del M8 debe decir si el servidor lo avisa antes de cerrar el turno.
- **Con el M8:**
  - "Juega en línea con amigos" deja de decir "Próximamente" en los beneficios de la cuenta (`BENEFITS` en `ui/Account.tsx`);
  - la pista de las monedas de la tienda deja de decir "Próximamente" (`earnHint` en `i18n/es.ts`);
  - el perfil, que hace de inicio en línea (D-67), suma "Jugar".
- **Textos en futuro:** la introducción de "Entrar" y la invitación de los resultados dicen en presente que la cuenta guarda el progreso, y en futuro que "pronto podrás jugar en línea" (`loginIntro` e `invite` en `i18n/es.ts`). Esa mitad vuelve al presente cuando llegue el juego en línea, con el M8. Lo mismo vale para los textos del progreso que hablan de las partidas en línea: `caminoIntro`, `collectionIntro`, `repeatedNote`, `revealNote`, `earnHint` y `profileIntro`.
- Validar con personas: balance, ritmo y animaciones están calibrados con datos, pero nadie lo ha jugado todavía.
- QA en Firefox y Safari, control táctil, rangos y experiencia (P-18) y el video de demo.

## Cómo se trabaja

- Toda interfaz sigue `docs/lineamientos-de-diseno.md` (D-63) y se compara con una captura a 1280×720 junto a "Tu equipo".
- Cada paso es un PR pequeño, con sus pruebas y la CI en verde. El dueño de producto lo revisa antes de fusionarlo, con merge commit y sin squash.
- Nunca se suben secretos al repositorio: cada variable se documenta en `.env.example`.
- `docs/ideas/` guarda ideas del dueño de producto para después (su `README.md` es el índice). No son decisiones ni tareas: nada de esa carpeta se implementa sin pasar antes por el PRD.

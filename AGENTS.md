# Guía para agentes de IA (Claude Code, Cursor, etc.)

Lee también `docs/PRD.md` (el mapa del proyecto) y `docs/adr/`.

## Comandos
- `pnpm install`, luego `pnpm dev` (http://localhost:5173)
- Servidor (M7): `cp .env.example .env` y `docker compose up -d db` una vez; luego `pnpm dev:server` (http://localhost:3000). `docker compose up --build` levanta la misma imagen que se despliega. Tras cambiar `apps/server/src/schema.ts`, `pnpm db:generate` escribe la migración
- `pnpm test` (Vitest), `pnpm typecheck` (TypeScript 7), `pnpm lint` (Biome), `pnpm run ci` (todo lo anterior + build; en pnpm 12, `pnpm ci` sin `run` es una instalación limpia que no verifica nada). Las pruebas del servidor que usan Postgres corren si `.env` define `DATABASE_URL_TEST` (con `docker compose up -d db`); si no, se saltan
- `pnpm sim -- --matches 2000 --skill 1 [--storm] [--collection starter|box|full]` para simular balance sin render. La reserva real es la colección del jugador (R-26): mide por etapa con `--collection`, porque sin esa opción se usa el mazo fijo de v1. `pnpm sim -- --table` reproduce la tabla del §18.3 del PRD. En línea cada persona trae su colección (R-34): `pnpm sim -- --team fire=new,water=full,snow=bot` arma el equipo asiento por asiento (`bot`, `new-off`, `new`, `box`, `box3` o `full`), y `pnpm sim -- --mixed` reproduce las tablas de equipos mezclados del reporte de balance (P-20)
- `pnpm e2e` (Playwright; `PW_SWIFTSHADER=1` en máquinas sin GPU). Si una prueba falla, deja su captura y su traza en `apps/web/test-results/`; la corrida siguiente vacía esa carpeta, así que cópialas antes de repetir
- `pnpm check:prod [url]` comprueba el despliegue (por defecto https://ventisca.wpena.dev): DNS sin el proxy de Cloudflare (D-58), certificado, cabeceras, HTTP a HTTPS, salud, que corra el último commit de main y un turno en Chromium sin pedir nada a otros dominios
- `pnpm build:single` genera `apps/web/dist-single/index.html`, un solo archivo jugable
- `?speed=0.2` en la URL acelera las animaciones (pruebas y demos)
- `pnpm pacing` mide el ritmo de las animaciones sobre partidas del bot (todos los tiempos viven en `apps/web/src/game/timing.ts`)

## Reglas de arquitectura (no negociables)
1. `packages/core` es puro: sin DOM, sin Phaser, sin `Date.now()` ni `Math.random()`. Usa el RNG del estado (R-23) y enteros (R-24).
2. La UI nunca modifica el estado del juego directamente: todo pasa por `apps/web/src/state/actions.ts`, que habla con un `GameHost`.
3. Todo lo que se anima debe existir como `GameEvent`. Si falta información para animar, se agrega al evento en el core, con prueba.
4. Cambiar números de balance = editar `packages/core/src/balance.json`, volver a simular y actualizar `docs/balance-report.md`.
5. Las pruebas del core se nombran por regla: `it('R-17: …')`.
6. Identidad original (D-01): prohibido usar nombres, arte, audio o textos del juego original en el producto. Las referencias solo pueden aparecer en `docs/` y, como reconocimiento de la inspiración (D-76), en `CREDITOS.md`, en el README y en la pantalla de créditos del juego, con el texto de `CREDITOS.md`.
7. Los textos de la UI van en `apps/web/src/i18n/es.ts`, con verbos claros y frases cortas en español neutro.
8. La progresión (PRD §18) es pura y vive en `packages/core/src/cards.ts` y `economy.ts`. Precios, monedas y banco se cambian en `balance.json`. En v2 el progreso vive en la cuenta, en el servidor (D-34): `apps/server/src/progress/` guarda el resultado y deja las reglas a esas mismas funciones. El cliente (`apps/web/src/state/progress.ts`) solo pide y muestra lo que respondió el servidor: nunca calcula monedas ni cartas. El sandbox no guarda progreso en el navegador (D-55).

## Phaser 4
Antes de tocar la escena, consulta las guías oficiales para agentes que vienen con el paquete, en `apps/web/node_modules/phaser/skills/` (cámaras, tweens, partículas, input, etc.). Notas locales:
- La cámara tiene zoom 1,5: la escena trabaja en coordenadas lógicas de 1280×720.
- Las texturas se generan desde SVG en `src/art` y se agregan con `textures.addImage`, sin cargador XHR.
- `fps.smoothStep` está desactivado a propósito (ADR 0004).
- Lo que el tablero muestra al planificar (casillas, fantasmas, marcas de objetivo, líneas de mira) se decide en `src/state/board.ts`, y lo que hace cada clic, en `src/state/steps.ts`. Los dos son puros y tienen pruebas; `BattleScene.redrawPlanning` solo dibuja y `state/actions.ts` solo aplica. Al planificar a un ninja valen a la vez sus casillas y sus objetivos: no hay un paso de moverse, y solo colocar una carta es un modo aparte. Las capas están en la sección 11 de `docs/lineamientos-de-diseno.md`.
- Cada unidad cabe en su casilla: los tamaños y las piezas de una unidad viven en `src/game/layout.ts`, y `layout.test.ts` mide que quepan. Ahí está también el lugar fijo de la miniatura de cada carta colocada, y la prueba de que ninguna tape a otra.
- El tablero muestra lo que se puede hacer, no el resultado. La vida que perdería un gólem y su alcance son ayudas opcionales (D-78): `src/state/aids.ts` dice cuáles valen, y solo valen en las partidas locales (`GameHost.local`). Lo que quitarían los planes lo calcula el motor (`plannedDamage`), no el cliente.
- Para probar o capturar un tablero concreto, en desarrollo `window.__ventiscaLoad(estado)` deja la partida en curso en ese estado, también en el anfitrión (`state/actions.ts`): el turno siguiente se resuelve de verdad sobre él.
- Las capturas de la escena se toman con la tarjeta gráfica (`--use-angle=metal --enable-gpu --ignore-gpu-blocklist`). El render por software (SwiftShader) recorta las piezas giradas de las figuras: no es un defecto del juego.

## Antes de terminar una tarea
`pnpm run ci` en verde, capturas si cambió algo visible y una línea en `docs/ai-log.md` si fue una decisión relevante.

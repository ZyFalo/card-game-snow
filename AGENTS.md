# Guía para agentes de IA (Claude Code, Cursor, etc.)

Lee también `docs/PRD.md` (el mapa del proyecto) y `docs/adr/`.

## Comandos
- `pnpm install`, luego `pnpm dev` (http://localhost:5173)
- `pnpm test` (Vitest), `pnpm typecheck` (TypeScript 7), `pnpm lint` (Biome), `pnpm ci` (todo lo anterior + build)
- `pnpm sim -- --matches 2000 --skill 1 [--storm]` para simular balance sin render
- `pnpm e2e` (Playwright; `PW_SWIFTSHADER=1` en máquinas sin GPU)
- `pnpm build:single` genera `apps/web/dist-single/index.html`, un solo archivo jugable
- `?speed=0.2` en la URL acelera las animaciones (pruebas y demos)
- `pnpm pacing` mide el ritmo de las animaciones sobre partidas del bot (todos los tiempos viven en `apps/web/src/game/timing.ts`)

## Reglas de arquitectura (no negociables)
1. `packages/core` es puro: sin DOM, sin Phaser, sin `Date.now()` ni `Math.random()`. Usa el RNG del estado (R-23) y enteros (R-24).
2. La UI nunca modifica el estado del juego directamente: todo pasa por `apps/web/src/state/actions.ts`, que habla con un `GameHost`.
3. Todo lo que se anima debe existir como `GameEvent`. Si falta información para animar, se agrega al evento en el core, con prueba.
4. Cambiar números de balance = editar `packages/core/src/balance.json`, volver a simular y actualizar `docs/balance-report.md`.
5. Las pruebas del core se nombran por regla: `it('R-17: …')`.
6. Identidad original (D-01): prohibido usar nombres, arte, audio o textos del juego original en el producto. Las referencias solo pueden aparecer en `docs/`.
7. Los textos de la UI van en `apps/web/src/i18n/es.ts`, con verbos claros y frases cortas en español neutro.
8. La progresión (PRD §18) es pura y vive en `packages/core/src/cards.ts` y `economy.ts`. Precios, monedas y banco se cambian en `balance.json`. El perfil del jugador se guarda en `apps/web/src/state/profile.ts`; si cambias su forma, sube la versión de la clave de almacenamiento.

## Phaser 4
Antes de tocar la escena, consulta las guías oficiales para agentes que vienen con el paquete, en `apps/web/node_modules/phaser/skills/` (cámaras, tweens, partículas, input, etc.). Notas locales:
- La cámara tiene zoom 1,5: la escena trabaja en coordenadas lógicas de 1280×720.
- Las texturas se generan desde SVG en `src/art` y se agregan con `textures.addImage`, sin cargador XHR.
- `fps.smoothStep` está desactivado a propósito (ADR 0004).

## Antes de terminar una tarea
`pnpm ci` en verde, capturas si cambió algo visible y una línea en `docs/ai-log.md` si fue una decisión relevante.

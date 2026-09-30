# Traspaso a Claude Code

Estado al 29 de septiembre de 2026: **v0.9**. Construido en claude.ai con Claude; desde aquí continúa en Claude Code.

## Qué hay

- **Juego completo para un jugador:** reglas R-01 a R-24, progresión con monedas, cajas y colección (R-25 a R-32), dificultades Clásica y Tormenta, tres ritmos de reloj, logros, pausa y ayuda.
- **Animación en cuatro fases:** esqueletos articulados, efectos, coreografía medida con metas de ritmo e interfaz animada.
- **Calidad:** 49 pruebas (Vitest), 2 pruebas e2e (Playwright), lint (Biome) y tipos (TypeScript 7), más un simulador de balance y un estimador de ritmo.
- **Publicación:** build normal (`pnpm build`) y de un solo archivo (`pnpm build:single`). El CI corre en GitHub Actions. Despliegue: Pendiente: Railway, hito M7.

## Puesta en marcha (una sola vez)

1. **Requisitos:** Node 22.12 o superior y Git. Activa pnpm con `corepack enable`; el repositorio fija pnpm 12.8.1 en `packageManager`.
2. **Repositorio:** `git init`, `git add -A` y `git commit -m "Ventisca v0.9: punto de partida"`.
3. **Dependencias:** `pnpm install`.
4. **Jugar en local:** `pnpm dev` y abre http://localhost:5173.
5. **Verificación completa:** `pnpm ci` (lint, tipos, pruebas y build).
6. **Pruebas en el navegador:** `pnpm --filter @ventisca/web exec playwright install chromium` y luego `pnpm e2e`. En una máquina sin GPU, usa `PW_SWIFTSHADER=1 pnpm e2e`.
7. **Despliegue:** Pendiente: Railway, hito M7.

## Herramientas útiles

- `?speed=0.2` en la URL acelera las animaciones (pruebas y demos).
- En desarrollo están expuestos `window.__ventisca` (store), `window.__ventiscaScene` (escena de Phaser) y `window.__ventiscaGame`.
- `pnpm sim -- --matches 2000 --skill 1 [--storm]` mide el balance con el bot, sin render.
- `pnpm pacing` mide cuánto dura la animación de cada turno sobre partidas del bot.

## Pendiente, según el PRD

- Validar con personas: balance, ritmo y animaciones están calibrados con datos, pero nadie lo ha jugado todavía.
- QA en Firefox y Safari, y control táctil.
- **Multijugador (v2, hitos M7 a M9):** primero se define su sección del PRD en claude.ai y después se implementa aquí.
- Rangos y experiencia (P-18).
- Despliegue: Pendiente: Railway, hito M7.
- Video de demo.

## Primer mensaje para Claude Code

Pégalo tal cual en la primera sesión:

> Hola. Este repositorio es Ventisca, un juego táctico por turnos que construí con Claude en claude.ai (v0.9). Antes de cambiar nada:
>
> 1. Lee `CLAUDE.md`, `AGENTS.md`, `docs/traspaso.md` y `docs/PRD.md` (sobre todo §7, §11, §13 y §18).
> 2. Instala las dependencias y corre `pnpm ci` y `pnpm e2e`. Si algo falla en mi máquina, corrígelo con el cambio mínimo y explícame la causa.
> 3. Resúmeme en pocas líneas la arquitectura como la entendiste y qué partes tocaría el multijugador (M7 a M9). No lo implementes todavía: su especificación la estamos definiendo aparte.
>
> Trabaja en español y haz commits pequeños con mensajes claros.

## Cuando el PRD del multijugador esté aprobado

Se preparará un segundo mensaje que pida implementar el M7 según la sección aprobada del PRD, con criterios de terminado verificables (pruebas del servidor, dos clientes conectados en local y reconexión).

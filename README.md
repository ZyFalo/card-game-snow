# Ventisca

Táctico cooperativo por turnos: tres aprendices de papel (Brasa, Marea y Escarcha) contra gólems de escarcha en un tablero de 9×5. Es una recreación fiel **en mecánica** de *Card-Jitsu Snow* (2013), hecha con IA para una clase, con identidad **100 % original**: nombre, personajes, arte, audio y textos propios.

## Jugar

> ¿Continúas el desarrollo con Claude Code? Empieza por `docs/traspaso.md`.

- En línea: la página publicada que comparta el equipo.
- Local: `pnpm install` y luego `pnpm dev`, y abre http://localhost:5173. Si `pnpm` falla con "Cannot find module …/bin/pnpm.cjs", tu Corepack es anterior a pnpm 12: actualízalo con `npm i -g corepack@latest` (o usa `npx corepack@latest pnpm dev`).
- Un solo archivo: `pnpm build:single` genera `apps/web/dist-single/index.html`, que sirve para itch.io o para compartir.

**Cómo se juega:** en cada turno planeas a los tres ninjas (movimiento y acción). Confirmas y se resuelve en orden: Fuego, Agua, Nieve y después los gólems. Llena el medidor para ganar cartas. Si dos o tres ninjas juegan carta en el mismo turno, desatan un combo. Supera tres rondas; si cumples la condición, se abre una ronda bonus.

**Progresión:** al entrar por primera vez eliges tu carta de camino (Fuego, Agua o Nieve). Cada ronda superada paga monedas (60, 120 y 120, más 120 por el bonus) y con ellas abres cajas de 1 a 3 cartas. Tu reserva en cada partida es toda tu colección, con repetidas.

**Controles:** clic para seleccionar, moverse y elegir objetivos · clic derecho o Esc para deshacer · Tab para cambiar de ninja · 1 a 4 para las cartas · Espacio para confirmar (y mantenerlo para acelerar la resolución) · S para sugerir una jugada · P para pausar.

## Estado (v0.9.5)

- Jugable de punta a punta: 3 rondas + bonus, cartas, combos, caídas y reanimación, 2 dificultades, 3 ritmos de reloj, consejos, logros, pausa y ayuda.
- Progresión: carta de camino, colección de 60 cartas, tienda de cajas y monedas por ronda (PRD §18).
- Animación: ninjas y gólems articulados por piezas, con estados de ataque, golpe, caída, reanimación, aturdido, aparición y celebración, más efectos de impacto, cinemáticas de carta, efectos de estado, coreografía medida con metas de ritmo e interfaz animada (PRD §10.2).
- 78 pruebas unitarias y 12 pruebas e2e de Playwright, con CI en GitHub Actions. El simulador de balance mide con la colección real del jugador (`docs/balance-report.md`).
- Pendiente: playtest con personas, QA manual en Firefox y Safari (las e2e de v0.9.1 ya pasan en WebKit y Firefox), táctil, despliegue (Pendiente: Railway, hito M7), multijugador (v2) y jefe con progresión (v3). Detalle en `docs/PRD.md` §13.

## Stack

TypeScript 7 · Phaser 4.2 (tablero) · React 19 + Zustand 5 (HUD) · Vite 8 · pnpm workspaces · Vitest · Playwright · Biome. Arte SVG y audio WebAudio generados en código (ADR 0003).

```
packages/core   Motor de reglas puro y determinista, bot y simulador
apps/web        Cliente: escena de Phaser, HUD de React, arte y audio
docs            PRD, ADRs, reporte de balance y bitácora de IA
```

## Despliegue

Pendiente: Railway, hito M7.

El CI (`.github/workflows/ci.yml`) corre lint, tipos, pruebas, build y las e2e de humo en cada push.

## Aviso

Proyecto educativo sin fines de lucro. *Card-Jitsu Snow* y *Club Penguin* son marcas de sus dueños; este repositorio no contiene ninguno de sus assets. Los valores de reglas se estudiaron a partir de documentación pública y de un servidor fan con licencia MIT (fuentes en el Apéndice B del PRD).

Las fuentes Dela Gothic One y Zen Kaku Gothic New se distribuyen con el juego (paquetes `@fontsource`) bajo la licencia SIL Open Font License 1.1.

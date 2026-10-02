# Ventisca

Táctico cooperativo por turnos: tres aprendices de papel (Brasa, Marea y Escarcha) contra gólems de escarcha en un tablero de 9×5. Es una recreación fiel **en mecánica** de *Card-Jitsu Snow* (2013), hecha con IA para una clase, con identidad **100 % original**: nombre, personajes, arte, audio y textos propios.

## Jugar

> ¿Continúas el desarrollo con Claude Code? Empieza por `docs/traspaso.md`.

- En línea: https://ventisca.wpena.dev. Se juega sin cuenta; con una cuenta se guardan la carta de camino, la colección y las cajas. Las partidas en línea llegan con el hito M8.
- Local: `pnpm install` y luego `pnpm dev`, y abre http://localhost:5173. Si `pnpm` falla con "Cannot find module …/bin/pnpm.cjs", tu Corepack es anterior a pnpm 12: actualízalo con `npm i -g corepack@latest` (o usa `npx corepack@latest pnpm dev`).
- Con el servidor (cuentas y progreso; las partidas en línea están en construcción): `cp .env.example .env` y luego `docker compose up --build`, y abre http://localhost:3000. Detalle en `docs/traspaso.md`.
- Un solo archivo: `pnpm build:single` genera `apps/web/dist-single/index.html`, que sirve para itch.io o para compartir.

**Cómo se juega:** en cada turno planeas a los tres ninjas (movimiento y acción). Confirmas y se resuelve en orden: Fuego, Agua, Nieve y después los gólems. Llena el medidor para ganar cartas. Si dos o tres ninjas juegan carta en el mismo turno, desatan un combo. Supera tres rondas; si cumples la condición, se abre una ronda bonus.

**Sin cuenta (sandbox):** cada ninja juega con el mazo de referencia (8, 9, 10, 10, 11 y 12), y no hay monedas, cartas ni logros. La progresión (carta de camino, monedas, cajas y colección) vive en la cuenta del modo en línea.

**Controles:** clic para seleccionar, moverse y elegir objetivos · clic derecho o Esc para deshacer · Tab para cambiar de ninja · 1 a 4 para las cartas · Espacio para confirmar (y mantenerlo para acelerar la resolución) · S para sugerir una jugada · P para pausar.

## Estado (v0.10, hito M7 completo)

- Jugable de punta a punta: 3 rondas + bonus, cartas, combos, caídas y reanimación, 2 dificultades, 3 ritmos de reloj, consejos, pausa y ayuda.
- Cuentas (M7): registro con verificación por correo, recuperación, cambio de contraseña y de correo, y borrado. El servidor guarda el progreso de cada cuenta: la carta de camino, la colección de 60 cartas y las cajas (PRD §18 y `docs/PRD-v2.md`). Las monedas se ganarán en las partidas en línea (M8), y el sandbox no da progreso (D-34).
- Animación: ninjas y gólems articulados por piezas, con estados de ataque, golpe, caída, reanimación, aturdido, aparición y celebración, más efectos de impacto, cinemáticas de carta, efectos de estado, coreografía medida con metas de ritmo e interfaz animada (PRD §10.2).
- 336 pruebas del motor, el cliente y el servidor (las del servidor, contra Postgres) y 34 pruebas e2e de Playwright, con CI en GitHub Actions. El simulador de balance mide con la colección real del jugador (`docs/balance-report.md`).
- Pendiente: playtest con personas, QA manual en Firefox y Safari (las e2e de v0.9.1 ya pasan en WebKit y Firefox), táctil, partidas en línea y emparejamiento (hitos M8 y M9 de v2) y jefe con progresión (v3). Detalle en `docs/PRD.md` §13.

## Stack

TypeScript 7 · Phaser 4.2 (tablero) · React 19 + Zustand 5 (HUD) · Vite 8 · pnpm workspaces · Vitest · Playwright · Biome. Servidor: Node · Fastify · Postgres con Drizzle · Zod · Docker (ADR 0006). Arte SVG y audio WebAudio generados en código (ADR 0003).

```
packages/core      Motor de reglas puro y determinista, bot y simulador
packages/protocol  Lo que viaja entre el cliente y el servidor, validado con Zod
apps/web           Cliente: escena de Phaser, HUD de React, arte y audio
apps/server        Servidor: cuentas, progreso y, desde el M8, las partidas
docs               PRD, ADRs, lineamientos de diseño, reporte de balance y bitácora de IA
```

## Despliegue

En Railway, con Postgres, en https://ventisca.wpena.dev: cada push a `main` se despliega cuando termina su CI. `pnpm check:prod` comprueba el despliegue. Detalle en `docs/traspaso.md`.

El CI (`.github/workflows/ci.yml`) corre lint, tipos, pruebas, build y las e2e de humo en cada push.

## Aviso

Proyecto educativo sin fines de lucro. *Card-Jitsu Snow* y *Club Penguin* son marcas de sus dueños; este repositorio no contiene ninguno de sus assets. Los valores de reglas se estudiaron a partir de documentación pública y de un servidor fan con licencia MIT (fuentes en el Apéndice B del PRD).

Las fuentes Dela Gothic One y Zen Kaku Gothic New se distribuyen con el juego (paquetes `@fontsource`) bajo la licencia SIL Open Font License 1.1.

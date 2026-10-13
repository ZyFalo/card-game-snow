# Ventisca

Táctico cooperativo por turnos: tres aprendices de papel (Brasa, Marea y Escarcha) contra gólems de escarcha en un tablero de 9×5. Es una recreación fiel **en mecánica** de *Card-Jitsu Snow* (2013), hecha con IA, con identidad **100 % original**: nombre, personajes, arte, audio y textos propios. Es el piloto de un proyecto personal, que su autor avanza en sus ratos libres.

## Jugar

> ¿Continúas el desarrollo con Claude Code? Empieza por `docs/traspaso.md`.

- En línea: https://ventisca.wpena.dev. Se juega sin cuenta. Con una cuenta se juega en línea (Beta) con una o dos personas más, y se guardan la carta de camino, las monedas, la colección y los logros.
- Local: `pnpm install` y luego `pnpm dev`, y abre http://localhost:5173. Si `pnpm` falla con "Cannot find module …/bin/pnpm.cjs", tu Corepack es anterior a pnpm 12: actualízalo con `npm i -g corepack@latest` (o usa `npx corepack@latest pnpm dev`).
- Con el servidor (cuentas, progreso y partidas en línea): `cp .env.example .env` y luego `docker compose up --build`, y abre http://localhost:3000. Detalle en `docs/traspaso.md`.
- Un solo archivo: `pnpm build:single` genera `apps/web/dist-single/index.html`, que sirve para itch.io o para compartir.

**Cómo se juega:** en cada turno planeas a los tres ninjas (movimiento y acción). Confirmas y se resuelve en orden: Fuego, Agua, Nieve y después los gólems. Llena el medidor para ganar cartas. Si dos o tres ninjas juegan carta en el mismo turno, desatan un combo. Supera tres rondas; si cumples la condición, se abre una ronda bonus.

**Sin cuenta (sandbox):** cada ninja juega con el mazo de referencia (8, 9, 10, 10, 11 y 12), y no hay monedas, cartas ni logros. La progresión (carta de camino, monedas, cajas y colección) vive en la cuenta del modo en línea.

**En línea (Beta):** de 2 a 3 personas, cada una con un ninja y con su colección de ese elemento; si falta una, el bot completa el equipo. Se entra por la cola pública o por una sala con código. Todos planean a la vez y ven los planes de los demás en el tablero: no hay chat. El reloj da 10 s por turno y no hay pausa. Cada ronda superada da monedas, que entran a la cuenta al terminar la partida; quien abandona pierde las de esa partida.

**Controles:** clic para seleccionar, moverse y elegir objetivos · clic derecho o Esc para deshacer · Tab para cambiar de ninja · 1 a 4 para las cartas · Espacio para confirmar (y mantenerlo para acelerar la resolución) · S para sugerir una jugada · P para pausar. En línea no hay pausa ni jugada sugerida, y cada persona lleva un solo ninja.

## Estado (v0.10, con la Beta del modo en línea)

- Jugable de punta a punta: 3 rondas + bonus, cartas, combos, caídas y reanimación, 2 dificultades, 3 ritmos de reloj, consejos, pausa y ayuda, y dos ayudas opcionales para ver el daño y el alcance de los gólems.
- Cuentas (M7): registro con verificación por correo, recuperación, cambio de contraseña y de correo, y borrado. El servidor guarda el progreso de cada cuenta: la carta de camino, las monedas, la colección de 60 cartas, las cajas, los logros y las estadísticas privadas (PRD §18 y `docs/PRD-v2.md`). El sandbox no da progreso (D-34).
- En línea (Beta, M8 y M9): cola pública por ninja, con la oferta del bot a los 30 s, y salas con código. El servidor resuelve cada partida con el mismo motor del sandbox, lleva el reloj y decide monedas, logros y estadísticas. Los logros son 12, cada uno con su contador, en los cuatro pliegues del amuleto de papel: uno por ninja, que se gana jugando con él, y uno de equipo; con los cuatro, las monedas valen el doble. Quien se desconecta deja a su ninja quieto y puede volver. Las pantallas de fuera del combate son adaptables; el combate es para computador.
- Animación: ninjas y gólems articulados por piezas, con estados de ataque, golpe, caída, reanimación, aturdido, aparición y celebración, más efectos de impacto, cinemáticas de carta, efectos de estado, coreografía medida con metas de ritmo e interfaz animada (PRD §10.2).
- 892 pruebas del motor, el protocolo, el cliente y el servidor (las del servidor, contra Postgres) y 99 pruebas e2e de Playwright, que para el juego en línea abren dos y tres navegadores a la vez, con CI en GitHub Actions. El simulador de balance mide con la colección real del jugador (`docs/balance-report.md`).
- Pendiente: seguir la Beta con personas (`docs/guia-beta.md`) y, tras unas semanas, medir el ritmo real del amuleto y ajustar las metas de los logros; Tormenta en línea, el combate en teléfono, QA manual en Firefox y Safari (las e2e de v0.9.1 ya pasan en WebKit y Firefox), táctil y jefe con progresión (v3). Detalle en `docs/traspaso.md` y en `docs/PRD.md` §13.

## Stack

TypeScript 7 · Phaser 4.2 (tablero) · React 19 + Zustand 5 (HUD) · Vite 8 · pnpm workspaces · Vitest · Playwright · Biome. Servidor: Node · Fastify · Postgres con Drizzle · Zod · Docker (ADR 0006). Arte SVG y audio WebAudio generados en código (ADR 0003).

```
packages/core      Motor de reglas puro y determinista, bot y simulador
packages/protocol  Lo que viaja entre el cliente y el servidor, validado con Zod
apps/web           Cliente: escena de Phaser, HUD de React, arte y audio
apps/server        Servidor: cuentas, progreso y partidas en línea
docs               PRD, ADRs, lineamientos de diseño, reporte de balance, guía de la Beta y bitácora de IA
```

## Despliegue

En Railway, con Postgres, en https://ventisca.wpena.dev: cada push a `main` se despliega cuando termina su CI. `pnpm check:prod` comprueba el despliegue. Detalle en `docs/traspaso.md`.

El CI (`.github/workflows/ci.yml`) corre lint, tipos, pruebas, build y las e2e de humo en cada push.

## Créditos e inspiración

Ventisca es un homenaje a *Card-Jitsu Nieve* (*Card-Jitsu Snow*), de la saga *Card-Jitsu* de *Club Penguin*. De ahí viene la idea; los personajes, el arte, la música, los sonidos y el código son propios, y este repositorio no contiene ningún recurso del juego original. Club Penguin y Card-Jitsu son marcas de Disney, y Ventisca no está afiliado ni respaldado por Disney. El detalle, con las fuentes de investigación, está en [`CREDITOS.md`](CREDITOS.md); el juego lo resume en su pantalla de créditos.

Los valores de reglas se estudiaron a partir de documentación pública y de un servidor fan con licencia MIT (fuentes en el Apéndice B del PRD).

Ventisca es el piloto de un proyecto personal: hoy el juego es gratuito, no vende nada ni muestra publicidad.

Las fuentes Dela Gothic One y Zen Kaku Gothic New se distribuyen con el juego (paquetes `@fontsource`) bajo la licencia SIL Open Font License 1.1.

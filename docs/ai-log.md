# Bitácora de trabajo con IA

Registro del proceso de recrear el juego con asistencia de IA (requisito de la clase). Asistente: Claude (Anthropic).

| # | Fecha | Pedido del dueño de producto | Qué hizo la IA | Qué decidió la persona | Cómo se verificó |
|---|---|---|---|---|---|
| 1 | 2026-09-29 | Investigar el juego original y crear un PRD vivo | Investigó wiki y un servidor fan con licencia MIT (solo valores y comportamiento). Redactó el PRD v0.1 con las reglas R-01 a R-24 y preguntas abiertas | Control de los 3 ninjas, sin fecha límite, investigar el stack | Fuentes citadas en el Apéndice B del PRD |
| 2 | 2026-09-29 | Elegir la mejor tecnología web | Comparó motores, backends y herramientas de 2026. Propuso Phaser 4 + React + Vite 8, con Cloudflare para publicar y para v2 | Aprobó el stack (D-09) | Versiones verificadas en npm y en los anuncios oficiales |
| 3 | 2026-09-29 | Construir el proyecto completo | Monorepo, motor puro con 33 pruebas por regla, bot, simulador y balance (se descubrió que el juego era trivial y se creó Tormenta) | Aceptó la dificultad Tormenta (D-13) | `pnpm test` y 8.000 partidas simuladas |
| 4 | 2026-09-29 | Continuar la construcción | Cliente web: arte y audio generados en código, escena de Phaser, HUD en React, pantallas, logros y pausa | — | Capturas en Chromium; partida completa jugada por la interfaz |
| 13 | 2026-09-29 | Preparar el traspaso a Claude Code | `CLAUDE.md`, guía de traspaso con primer mensaje, script de ritmo y verificación del zip desde una instalación limpia | Decidió construir el multijugador en Claude Code tras definir su PRD aquí | Instalación limpia desde el zip: `pnpm ci` en verde |
| 12 | 2026-09-29 | Fase 4 de animación: interfaz | Cartas que vuelan a la mano, medidor vivo, rastro de vida, transiciones entre pantallas y resultados que cuentan. Verificó congelando cada animación en un punto exacto | Aprobó la fase | 49 pruebas; e2e; capturas congeladas; partida completa con robos reales |
| 11 | 2026-09-29 | Fase 3 de animación: coreografía | Creó la tabla de tiempos y un estimador de ritmo sobre partidas del bot. Midió que un turno con combo duraba 11 s y lo bajó a 6,6 s encadenando las cartas del combo; agregó animaciones rápidas y aceleración con Espacio | Aprobó la fase | 49 pruebas (3 de metas de ritmo); e2e; partida completa |
| 10 | 2026-09-29 | Fase 2 de animación: efectos | Módulo de efectos, cinemáticas de carta, ataques de gólems y estados persistentes. Detectó que la pausa de impacto podía alargarse en equipos lentos y la midió por cuadro | Aprobó la fase | 46 pruebas; e2e; capturas por instante con la escena pausada |
| 9 | 2026-09-29 | Mejorar las animaciones (fase 1), revisando la coreografía de snowflake | Estudió los estados y tiempos del original en el servidor de referencia. Separó el arte en piezas, creó el motor de esqueletos y 17 clips con marcadores, y rehízo el animador | Aprobó el plan de 4 fases | 45 pruebas; hoja de poses; partida completa en Tormenta y secuencia sintética de caída y reanimación |
| 8 | 2026-09-29 | Implementar la progresión | Banco, economía y reserva en el motor (8 pruebas). Perfil, pantallas de camino, colección y tienda, revelado y cobro de monedas. Detectó y corrigió un revelado invisible y que el tablero renderizaba detrás de los menús | — | 43 pruebas; 2 e2e; partida completa cobrando monedas |
| 7 | 2026-09-29 | Diseñar monedas, cajas y colección | Analizó el catálogo original (509 cartas; las de poder van de 9 a 12) y el pago por ronda. Simuló colecciones y economía (el inicio con 0 cartas es inviable: 17 % de victorias) | Simplicidad, reserva fiel con repetidas, cajas de 1 a 3, inicio con 1 carta de 9 por elemento, camino, monedas del original | PRD v0.4, §18 |
| 6 | 2026-09-29 | Que los gólems puedan rematar al recién revivido antes de que los jugadores vuelvan a mover | Leyó el código y la referencia (completaban al final del turno). Movió la reanimación al paso 2 de R-11, agregó 3 pruebas y re-simuló el balance | Confirmó la regla (D-18) | 35 pruebas; simulación de 8.000 partidas; e2e |
| 5 | 2026-09-29 | Continuar | Pruebas de interacción y e2e con Playwright, build en un solo HTML, publicación, CI, documentación y PRD v0.3 | — | e2e en verde; mapeo de clics verificado a tres escalas |

## Errores reales encontrados durante el proceso

- **Bucle de revivir y caer en el bot tras D-18**: la simulación mostró 17 caídas por partida en Tormenta. El bot aprendió a no revivir al alcance de los gólems.

- **Tiempo de juego 20 veces más lento con render lento** (ADR 0004): se detectó midiendo con registros en el navegador y se corrigió con `smoothStep: false`.
- **Juego demasiado fácil con los valores originales** (reporte de balance): se detectó con simulación antes de cualquier playtest.
- **Reloj que mostraba 36 s durante un cuadro**: se detectó en una captura y se corrigió calculando el tiempo en cada render.
- **Botón de ayuda duplicado para lectores de pantalla bajo los modales**: se corrigió con `inert` en el HUD.

## Reglas que seguimos con la IA

- Nada de assets, nombres ni textos del original en el juego (D-01). Los prompts de arte describen la identidad propia, nunca el original.
- Toda regla del motor tiene una prueba que cita su identificador (R-xx).
- Cada cambio visible se verificó con capturas reales antes de darlo por hecho.

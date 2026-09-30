# Reporte de balance (v0.9.2)

Fecha: 29 de septiembre de 2026 · Motor: `@ventisca/core`, con D-18 y D-33 · Reemplaza al reporte de M4

## Por qué se rehízo

Desde la v0.5, la reserva de cada ninja es la colección del jugador (R-26). El reporte de M4 medía con el mazo fijo de v1 (6 cartas de 8 a 12), que el juego ya no usa, así que describía un juego distinto al que se juega. Este reporte mide la progresión real en tres etapas. El mazo fijo queda solo como referencia, en el anexo.

## Método

- El bot de ninjas (§8 del PRD) juega partidas completas sin render: 2.000 por configuración, con semillas fijas.
- **Habilidad 1:** siempre elige la jugada con mejor puntuación.
- **Habilidad 0,6:** con probabilidad 0,4 elige entre sus 3 mejores opciones, para aproximar a un jugador menos cuidadoso. Es la referencia principal.
- El bot no sufre el reloj ni se equivoca con la interfaz: estos números son un **techo** de lo que logrará una persona.
- **Colecciones** (R-25 a R-30):
  - **Inicio:** un 9 por elemento más la carta de camino (un 12). El elemento del camino casi no cambia el resultado: de 62,0 a 62,1 % de victorias en Clásica.
  - **Tras una caja:** el inicio más una caja de 3 cartas por elemento, sorteada en cada partida. Cuesta 750 monedas, unas 3 partidas.
  - **Completa:** las 20 cartas de cada elemento.

Para reproducirlo: `pnpm sim -- --collection starter|box|full [--storm] [--skill 0.6]` y `pnpm sim -- --table`.

## Resultados con habilidad 0,6

| Métrica | Clásica · Inicio | Clásica · Tras una caja | Clásica · Completa | Tormenta · Inicio | Tormenta · Tras una caja | Tormenta · Completa |
|---|---|---|---|---|---|---|
| Victoria | 62,1 % | 99,8 % | 99,7 % | 0,8 % | 60,3 % | 92,6 % |
| Derrotas en ronda 1 / 2 / 3 | 2 / 177 / 579 | 1 / 2 / 2 | 1 / 1 / 4 | 271 / 1.355 / 359 | 34 / 89 / 670 | 33 / 55 / 60 |
| Turnos por partida (media) | 18,8 | 16,8 | 15,9 | 18,2 | 23,1 | 21,7 |
| Turnos hasta superar R1 a R3 (p25 · p50 · p75) | 13 · 16 · 19 | 11 · 13 · 14 | 11 · 13 · 14 | 19 · 24 · 35 \* | 17 · 20 · 24 | 17 · 19 · 21 |
| Combos por partida | 0,95 | 3,41 | 3,80 | 0,76 | 3,28 | 4,93 |
| Caídas de ninjas por partida | 2,54 | 0,45 | 0,13 | 4,08 | 3,07 | 1,80 |
| Monedas por partida | 245 | 369 | 379 | 75 | 245 | 323 |
| Entra al bonus: sin caídas | 62,6 % | 96,7 % | 96,1 % | 20,0 % \* | 48,5 % | 60,4 % |
| Entra al bonus: vida completa | 1,9 % | 29,5 % | 35,2 % | 0,0 % \* | 3,2 % | 11,4 % |
| Entra al bonus: contra el reloj | 24,0 % | 65,2 % | 66,6 % | 0,0 % \* | 38,1 % | 42,7 % |
| Bonus ganados (de los jugados) | 7,5 % | 90,7 % | 100,0 % | 0,0 % \* | 4,5 % | 90,5 % |

\* Solo 16 de 2.000 partidas superan la ronda 3: la cifra no es representativa.

## Resultados con habilidad 1 (techo)

| Métrica | Clásica · Inicio | Clásica · Tras una caja | Clásica · Completa | Tormenta · Inicio | Tormenta · Tras una caja | Tormenta · Completa |
|---|---|---|---|---|---|---|
| Victoria | 70,8 % | 99,7 % | 99,8 % | 2,4 % | 69,3 % | 95,0 % |
| Derrotas en ronda 1 / 2 / 3 | 1 / 122 / 455 | 0 / 0 / 4 | 0 / 1 / 2 | 179 / 1.305 / 468 | 25 / 55 / 534 | 18 / 36 / 44 |
| Turnos por partida (media) | 18,9 | 16,3 | 15,3 | 18,8 | 23,0 | 21,5 |
| Turnos hasta superar R1 a R3 (p25 · p50 · p75) | 12 · 15 · 18 | 11 · 12 · 13 | 11 · 12 · 13 | 20 · 27 · 38 \* | 16 · 19 · 23 | 16 · 18 · 20 |
| Combos por partida | 0,96 | 3,38 | 3,65 | 0,79 | 3,35 | 4,95 |
| Caídas de ninjas por partida | 2,77 | 0,44 | 0,08 | 3,81 | 2,75 | 1,55 |
| Monedas por partida | 260 | 379 | 385 | 88 | 259 | 336 |
| Entra al bonus: sin caídas | 67,1 % | 98,1 % | 98,8 % | 0,0 % \* | 54,7 % | 69,0 % |
| Entra al bonus: vida completa | 1,3 % | 33,0 % | 35,7 % | 0,0 % \* | 5,6 % | 10,8 % |
| Entra al bonus: contra el reloj | 35,7 % | 76,1 % | 79,4 % | 27,3 % \* | 42,7 % | 51,8 % |
| Bonus ganados (de los jugados) | 10,3 % | 95,9 % | 99,9 % | 0,0 % \* | 6,4 % | 91,6 % |

\* Solo 48 de 2.000 partidas superan la ronda 3: la cifra no es representativa.

## Tabla del §18.3, reproducida

Habilidad 0,6, camino de Fuego y 2.000 partidas por celda (`pnpm sim -- --table`). El PRD usó entre 500 y 800 partidas por fila, así que las diferencias de uno o dos puntos son ruido de muestreo.

| Colección (por elemento) | Clásica (PRD → ahora) | Tormenta (PRD → ahora) | Combos por partida en Clásica (PRD → ahora) |
|---|---|---|---|
| 0 cartas | 17 → 18,4 % | 0 → 0,1 % | 0 → 0,00 |
| 1 carta de 9 (inicio de R-30, sin camino) | 49 → 49,6 % | 1 → 0,8 % | 0,9 → 0,86 |
| 1 carta de 9 + carta de camino (un 12) | 63 → 62,1 % | 1 → 0,8 % | 1,0 → 0,95 |
| Tras una caja de 3 por elemento | 99,6 → 99,8 % | 60 → 60,3 % | 3,4 → 3,41 |
| 8 cartas al azar del banco | 99,6 → 99,7 % | 92 → 91,9 % | 3,8 → 3,80 |
| Las 20 (colección completa) | 99,6 → 99,7 % | 94 → 92,6 % | 3,8 → 3,80 |
| Solo las 7 más altas (11 y 12) | 100 → 99,7 % | 97 → 95,6 % | 3,7 → 3,69 |

La tabla de economía del §18.3 también coincide. En monedas por partida en Clásica, el inicio pasa de 243 a 245, "tras una caja" de 367 a 369 y la colección completa de 377 a 379.

## Lectura

1. **La curva de dificultad es un escalón.**
   - Un jugador nuevo gana el 62 % en Clásica, y casi todas sus derrotas llegan en la ronda 3.
   - Tras una sola caja por elemento (unas 3 partidas de monedas), gana el 99,8 %.
   - El "juego trivial" que encontró el reporte de M4 reaparece desde la segunda o la tercera partida.
2. **Tormenta no se puede jugar al empezar:** 0,8 a 2,4 % de victorias. R-31 ya recomienda tener 4 cartas por elemento antes de jugarla, y los datos lo confirman: tras una caja hay 4 o 5 por elemento y la victoria sube al 60–69 %.
3. **El límite de turnos del bonus (D-12) se calibró con el mazo fijo.**
   - En Clásica, "contra el reloj" deja entrar al bonus al 24–36 % de los jugadores nuevos.
   - Tras una caja deja entrar al 65–76 % y con la colección completa al 67–79 %.
   - La calibración de M4 vale desde la primera caja; al empezar, el bonus es mucho más difícil.
4. **Los combos dependen de la colección.** Al empezar hay menos de uno por partida (0,95), así que el momento cumbre del juego casi no aparece. Tras la primera caja son 3,4.
5. **"Vida completa" sigue siendo la condición de maestría:** 2 % al empezar y 30–36 % después.
6. **D-33 apenas mueve Tormenta.** Con el mazo fijo, la victoria baja de 94,0 a 93,3 % con habilidad 1 y de 88,7 a 88,0 % con habilidad 0,6 (ver el anexo).

## Preguntas para el dueño de producto

Este reporte no cambia ningún valor; solo mide.

- ¿Se acepta que Clásica sea trivial tras unas 3 partidas? Las alternativas van desde una variante intermedia como predeterminada hasta una dificultad que escale con la colección.
- ¿El límite de turnos del bonus debería depender de la etapa o de la colección, o se mantiene en 13 / 18?
- ¿El inventario inicial (R-30, D-24) debería ser más generoso para que los combos aparezcan desde la primera partida?

## Pendiente de validar con personas

- Tasa de victoria real de un jugador nuevo en ritmo Normal (30 s por turno), turnos que vencen por tiempo y abandonos por frustración.
- Si la etapa "tras una caja" también resulta trivial para las personas, cómo sostener el reto (ver las preguntas anteriores).
- Meta sugerida para el playtest de la clase: 5 personas, 2 partidas cada una, con victoria de 70 a 90 % en Clásica · Normal. Con la colección inicial, el bot ya queda en 62–71 %.

## Anexo: mazo fijo de v1

Es la configuración del reporte de M4: un mazo de 6 cartas (8, 9, 10, 10, 11 y 12) por ninja. El juego ya no la usa, pero se conserva porque con ella se calibró D-12. Se volvió a medir con D-33, que solo cambia Tormenta. Antes de D-33, la victoria en Tormenta era de 94,0 % con habilidad 1 y 88,7 % con habilidad 0,6. Comando: `pnpm sim -- --collection fixed`.

| Métrica | Clásica · 1 | Clásica · 0,6 | Tormenta · 1 | Tormenta · 0,6 |
|---|---|---|---|---|
| Victoria | 99,8 % | 99,8 % | 93,3 % | 88,0 % |
| Derrotas en ronda 1 / 2 / 3 | 0 / 1 / 2 | 1 / 0 / 4 | 23 / 29 / 82 | 32 / 75 / 134 |
| Turnos por partida (media) | 15,4 | 15,9 | 22,5 | 22,5 |
| Turnos hasta superar R1 a R3 (p25 · p50 · p75) | 11 · 12 · 13 | 11 · 13 · 14 | 16 · 18 · 21 | 17 · 19 · 21 |
| Combos por partida | 3,66 | 3,80 | 4,44 | 4,36 |
| Caídas de ninjas por partida | 0,08 | 0,13 | 2,08 | 2,40 |
| Entra al bonus: sin caídas | 98,4 % | 96,3 % | 64,6 % | 59,5 % |
| Entra al bonus: vida completa | 32,6 % | 31,9 % | 8,3 % | 8,9 % |
| Entra al bonus: contra el reloj | 78,2 % | 63,8 % | 47,3 % | 43,5 % |
| Bonus ganados (de los jugados) | 99,8 % | 99,8 % | 50,0 % | 40,3 % |

**Historia.**
- **M4:** con este mazo y control total de los tres ninjas, el juego resultó trivial, y por eso nació Tormenta (D-13).
- **D-18:** la primera simulación dio 17,3 caídas por partida en Tormenta, porque el bot revivía al alcance de los gólems y volvían a derribarlo. Se corrigió en el bot, no en la regla: ahora solo revive expuesto si no tiene nada mejor que hacer.

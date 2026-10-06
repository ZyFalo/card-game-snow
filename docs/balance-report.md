# Reporte de balance (v0.9.2)

Fecha: 29 de septiembre de 2026 · Motor: `@ventisca/core`, con D-18 y D-33 · Reemplaza al reporte de M4

El 1 de octubre de 2026 se agregó la sección "En línea: equipos de colecciones mezcladas", que responde a P-20 del PRD de v2. El motor y los valores son los mismos. El 6 de octubre, el dueño de producto decidió con esos números (D-69 a D-72), y sus respuestas quedaron en las dos secciones de preguntas.

El 6 de octubre de 2026 también cambió una regla: la reanimación vuelve a completarse al final del turno (D-77, que reemplaza a D-18). La sección "La reanimación del original (D-77): antes y después" trae todos los números con una regla y con la otra. Las demás secciones conservan la medición hecha con D-18.

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
  - **Respondida el 6 de octubre de 2026 (D-72):** sí. Es el modo para empezar, y el simulador es un techo para personas reales.
- ¿El límite de turnos del bonus debería depender de la etapa o de la colección, o se mantiene en 13 / 18?
  - **Respondida el 6 de octubre de 2026 (D-71):** se mantiene en 13 y 18.
- ¿El inventario inicial (R-30, D-24) debería ser más generoso para que los combos aparezcan desde la primera partida? Sigue abierta.

## Pendiente de validar con personas

- Tasa de victoria real de un jugador nuevo en ritmo Normal (30 s por turno), turnos que vencen por tiempo y abandonos por frustración.
- Si la etapa "tras una caja" también resulta trivial para las personas, cómo sostener el reto (ver las preguntas anteriores).
- Meta sugerida para el playtest con personas: 5 personas, 2 partidas cada una, con victoria de 70 a 90 % en Clásica · Normal. Con la colección inicial, el bot ya queda en 62–71 %.

## En línea: equipos de colecciones mezcladas (P-20)

Agregado el 1 de octubre de 2026 (v0.10). No cambia ningún valor: solo mide.

En línea, cada persona lleva un ninja y juega con su propia colección de ese elemento (R-34 del PRD de v2). Con dos personas, el bot lleva el tercer ninja con el mazo de referencia (D-35 y D-47). Así, un mismo equipo puede juntar una colección nueva con una completa. Las tablas anteriores no lo medían, porque dan la misma colección a los tres ninjas.

### Método

- El simulador arma ahora la partida asiento por asiento: `pnpm sim -- --team fire=new,water=full,snow=bot`. Las tablas de esta sección salen de `pnpm sim -- --mixed` (habilidad 0,6) y `pnpm sim -- --mixed --skill 1`.
- **Asientos:**
  - **Nueva:** una cuenta nueva con el ninja de su camino. Juega con su 9 y su 12 (R-30).
  - **Nueva fuera de su camino:** una cuenta nueva con otro ninja. Juega solo con su 9, porque su carta de camino es de otro elemento.
  - **Una caja:** además abrió una caja de 3 de su elemento: 5 cartas. La caja cuesta 250 monedas y ganar una partida de Clásica paga 300 o más, así que es la colección de quien ya ganó una vez.
  - **Tres cajas:** abrió tres cajas de 3 de su elemento: 11 cartas.
  - **Completa:** las 20 cartas de su elemento.
  - **Bot:** el mazo de referencia (8, 9, 10, 10, 11 y 12), el mismo del sandbox (D-50).
- Cada equipo se juega con todas las formas de repartir sus asientos entre Fuego, Agua y Nieve, con 2.000 partidas por reparto y las semillas del resto del reporte. La cifra de un equipo junta todos sus repartos.
- **Comprobación:** con los asientos que equivalen a filas ya medidas, el simulador da los mismos números: el mazo de referencia en los tres ninjas (99,8 y 88,0 %), la colección completa (99,7 y 92,6 %) y el inicio de v1 (62,1 %).
- **Límites del método:**
  - El bot planifica a los tres ninjas a la vez y con la misma habilidad. Tres personas se coordinan peor y tienen 15 s por turno (D-46): estos números son un techo.
  - El asiento del bot juega igual que los demás, solo que con el mazo de referencia. No se mide si el bot jugaría mejor o peor que una persona.

### Cómo le va a cada equipo

Habilidad 0,6, salvo en las dos columnas que dicen "con habilidad 1".

| Equipo | Clásica: victoria | Clásica, con habilidad 1 | Tormenta: victoria | Tormenta, según quién lleva qué ninja | Tormenta, con habilidad 1 | Monedas por persona (Clásica · Tormenta) |
|---|---|---|---|---|---|---|
| **Sandbox (D-50): el mazo de referencia en los tres ninjas** | | | | | | |
| Bot · Bot · Bot | 99,8 % | 99,8 % | 88,0 % | — | 93,3 % | 376 · 294 |
| **Tres personas** | | | | | | |
| Nueva · Nueva · Nueva | 83,3 % | 89,9 % | 4,8 % | — | 9,7 % | 284 · 119 |
| Nueva · Nueva · Una caja | 96,0 % | 98,1 % | 18,4 % | 18,4 a 18,6 % | 25,0 % | 325 · 165 |
| Nueva · Una caja · Una caja | 99,3 % | 99,8 % | 49,4 % | 44,3 a 52,4 % | 58,1 % | 361 · 225 |
| Una caja · Una caja · Una caja | 99,7 % | 99,8 % | 79,3 % | — | 87,5 % | 378 · 273 |
| Nueva · Nueva · Completa | 96,9 % | 98,5 % | 31,6 % | 22,1 a 45,0 % | 38,3 % | 334 · 186 |
| Nueva · Una caja · Completa | 99,3 % | 99,8 % | 62,6 % | 50,1 a 74,2 % | 70,5 % | 364 · 243 |
| Nueva · Completa · Completa | 99,4 % | 99,8 % | 72,6 % | 57,6 a 84,9 % | 79,0 % | 366 · 262 |
| Una caja · Una caja · Completa | 99,7 % | 99,9 % | 86,5 % | 84,8 a 88,8 % | 92,0 % | 378 · 290 |
| Una caja · Completa · Completa | 99,7 % | 99,9 % | 90,6 % | 89,3 a 91,3 % | 94,2 % | 379 · 309 |
| Tres cajas · Tres cajas · Tres cajas | 99,7 % | 99,8 % | 92,6 % | — | 95,4 % | 378 · 323 |
| Completa · Completa · Completa | 99,7 % | 99,8 % | 92,6 % | — | 95,0 % | 379 · 323 |
| **Dos personas y el bot (D-35)** | | | | | | |
| Nueva · Nueva · Bot | 96,6 % | 98,1 % | 22,0 % | 19,6 a 24,6 % | 29,1 % | 329 · 171 |
| Nueva · Una caja · Bot | 99,3 % | 99,8 % | 53,6 % | 46,5 a 57,8 % | 63,1 % | 362 · 231 |
| Nueva · Completa · Bot | 99,3 % | 99,8 % | 67,0 % | 53,5 a 80,5 % | 74,8 % | 365 · 251 |
| Una caja · Una caja · Bot | 99,7 % | 99,8 % | 83,5 % | 83,0 a 84,3 % | 89,9 % | 378 · 281 |
| Una caja · Completa · Bot | 99,7 % | 99,9 % | 89,0 % | 87,6 a 90,7 % | 93,0 % | 378 · 299 |
| Completa · Completa · Bot | 99,7 % | 99,8 % | 91,5 % | 90,3 a 92,5 % | 94,7 % | 378 · 315 |
| **Personas nuevas fuera de su camino (R-34)** | | | | | | |
| Nueva fuera de su camino · Nueva fuera de su camino · Nueva fuera de su camino | 49,6 % | 57,6 % | 0,8 % | — | 1,4 % | 219 · 62 |
| Nueva · Nueva fuera de su camino · Nueva fuera de su camino | 62,1 % | 70,7 % | 1,1 % | 0,8 a 1,4 % | 2,7 % | 245 · 78 |
| Nueva fuera de su camino · Completa · Completa | 98,7 % | 99,3 % | 63,3 % | 39,5 a 81,5 % | 69,8 % | 354 · 239 |

**Quién lleva el mazo corto.** En Tormenta, con habilidad 0,6:

| Equipo | La persona distinta lleva a Fuego | A Agua | A Nieve |
|---|---|---|---|
| Una nueva con dos completas | 75,3 % | 84,9 % | 57,6 % |
| Una completa con dos nuevas | 27,8 % | 22,1 % | 45,0 % |

En Clásica casi no importa: de 99,0 a 99,6 % con una nueva, y de 96,0 a 98,4 % con dos.

### El límite de turnos del bonus

La condición "contra el reloj" (R-21) pide superar las rondas 1 a 3 en 13 turnos en Clásica y en 18 en Tormenta (D-12). Ese límite se calibró con el mazo de referencia. Las tablas dicen qué parte de las partidas que superan la ronda 3 lo logra con el límite de hoy y con otros cercanos. Habilidad 0,6, salvo la última columna.

**Clásica** (límite de hoy: 13)

| Equipo | Superan la ronda 3 | Turnos hasta superarla (p25 · p50 · p75) | ≤ 11 | ≤ 12 | **≤ 13 (hoy)** | ≤ 14 | ≤ 15 | ≤ 16 | ≤ 18 | Con habilidad 1, dentro del límite de hoy |
|---|---|---|---|---|---|---|---|---|---|---|
| **Sandbox (D-50): el mazo de referencia en los tres ninjas** | | | | | | | | | | |
| Bot · Bot · Bot | 99,8 % | 11 · 13 · 14 | 26,6 % | 47,1 % | **64,1 %** | 78,8 % | 88,1 % | 93,7 % | 99,2 % | 77,8 % |
| **Tres personas** | | | | | | | | | | |
| Nueva · Nueva · Nueva | 83,3 % | 12 · 14 · 17 | 21,5 % | 31,5 % | **43,5 %** | 54,0 % | 63,9 % | 71,8 % | 83,1 % | 54,8 % |
| Nueva · Nueva · Una caja | 96,0 % | 12 · 14 · 16 | 21,7 % | 34,2 % | **48,0 %** | 60,1 % | 70,6 % | 79,5 % | 90,0 % | 59,8 % |
| Nueva · Una caja · Una caja | 99,3 % | 12 · 13 · 15 | 24,9 % | 41,2 % | **58,2 %** | 72,1 % | 81,8 % | 89,5 % | 96,9 % | 69,4 % |
| Una caja · Una caja · Una caja | 99,7 % | 11 · 13 · 14 | 28,4 % | 49,6 % | **68,2 %** | 80,0 % | 89,7 % | 95,6 % | 99,5 % | 80,0 % |
| Nueva · Nueva · Completa | 96,9 % | 12 · 14 · 16 | 21,3 % | 33,6 % | **47,3 %** | 59,5 % | 69,6 % | 78,2 % | 89,4 % | 58,8 % |
| Nueva · Una caja · Completa | 99,3 % | 12 · 13 · 15 | 24,5 % | 40,7 % | **57,7 %** | 71,5 % | 81,3 % | 89,2 % | 96,7 % | 69,1 % |
| Nueva · Completa · Completa | 99,4 % | 12 · 13 · 15 | 24,3 % | 40,0 % | **57,4 %** | 71,3 % | 80,9 % | 88,9 % | 96,7 % | 68,6 % |
| Una caja · Una caja · Completa | 99,7 % | 11 · 13 · 14 | 27,9 % | 49,0 % | **67,6 %** | 80,0 % | 89,3 % | 95,1 % | 99,3 % | 79,6 % |
| Una caja · Completa · Completa | 99,7 % | 11 · 13 · 14 | 27,7 % | 48,4 % | **66,8 %** | 79,9 % | 89,2 % | 94,8 % | 99,1 % | 79,1 % |
| Tres cajas · Tres cajas · Tres cajas | 99,7 % | 11 · 13 · 14 | 27,6 % | 48,8 % | **67,1 %** | 80,2 % | 89,7 % | 95,1 % | 99,5 % | 79,6 % |
| Completa · Completa · Completa | 99,7 % | 11 · 13 · 14 | 27,2 % | 47,7 % | **66,4 %** | 80,0 % | 89,3 % | 94,5 % | 98,9 % | 78,5 % |
| **Dos personas y el bot (D-35)** | | | | | | | | | | |
| Nueva · Nueva · Bot | 96,6 % | 12 · 14 · 16 | 20,9 % | 33,1 % | **46,8 %** | 59,2 % | 69,0 % | 77,9 % | 89,4 % | 58,5 % |
| Nueva · Una caja · Bot | 99,3 % | 12 · 13 · 15 | 24,2 % | 40,2 % | **57,1 %** | 71,0 % | 81,1 % | 89,0 % | 96,6 % | 68,6 % |
| Nueva · Completa · Bot | 99,3 % | 12 · 13 · 15 | 24,0 % | 39,7 % | **56,6 %** | 70,7 % | 80,6 % | 88,5 % | 96,5 % | 68,0 % |
| Una caja · Una caja · Bot | 99,7 % | 11 · 13 · 14 | 27,6 % | 48,7 % | **66,9 %** | 79,9 % | 88,8 % | 94,8 % | 99,3 % | 79,3 % |
| Una caja · Completa · Bot | 99,7 % | 11 · 13 · 14 | 27,4 % | 48,0 % | **66,1 %** | 79,6 % | 88,8 % | 94,5 % | 99,2 % | 78,9 % |
| Completa · Completa · Bot | 99,7 % | 11 · 13 · 14 | 27,0 % | 47,3 % | **65,5 %** | 79,6 % | 89,0 % | 94,2 % | 99,1 % | 78,3 % |
| **Personas nuevas fuera de su camino (R-34)** | | | | | | | | | | |
| Nueva fuera de su camino · Nueva fuera de su camino · Nueva fuera de su camino | 49,6 % | 14 · 16 · 20 | 9,9 % | 16,5 % | **24,3 %** | 33,4 % | 42,0 % | 52,0 % | 69,6 % | 35,6 % |
| Nueva · Nueva fuera de su camino · Nueva fuera de su camino | 62,1 % | 13 · 15 · 19 | 13,1 % | 20,8 % | **29,5 %** | 39,2 % | 50,5 % | 59,3 % | 73,3 % | 40,6 % |
| Nueva fuera de su camino · Completa · Completa | 98,7 % | 12 · 14 · 16 | 17,2 % | 29,7 % | **45,8 %** | 60,4 % | 73,3 % | 82,8 % | 93,6 % | 59,2 % |

**Tormenta** (límite de hoy: 18)

| Equipo | Superan la ronda 3 | Turnos hasta superarla (p25 · p50 · p75) | ≤ 16 | ≤ 17 | **≤ 18 (hoy)** | ≤ 19 | ≤ 20 | ≤ 22 | ≤ 24 | Con habilidad 1, dentro del límite de hoy |
|---|---|---|---|---|---|---|---|---|---|---|
| **Sandbox (D-50): el mazo de referencia en los tres ninjas** | | | | | | | | | | |
| Bot · Bot · Bot | 88,0 % | 17 · 19 · 21 | 19,8 % | 32,1 % | **44,7 %** | 57,2 % | 69,0 % | 84,1 % | 92,2 % | 51,2 % |
| **Tres personas** | | | | | | | | | | |
| Nueva · Nueva · Nueva | 4,8 % \* | 20 · 23 · 32 | 6,3 % | 11,5 % | **16,7 %** | 22,9 % | 29,2 % | 44,8 % | 52,1 % | 21,8 % |
| Nueva · Nueva · Una caja | 18,4 % | 18 · 22 · 27 | 12,9 % | 19,1 % | **25,7 %** | 34,9 % | 41,4 % | 53,1 % | 63,3 % | 29,0 % |
| Nueva · Una caja · Una caja | 49,4 % | 18 · 21 · 25 | 15,9 % | 23,9 % | **33,7 %** | 42,4 % | 49,7 % | 63,8 % | 74,3 % | 38,4 % |
| Una caja · Una caja · Una caja | 79,3 % | 17 · 19 · 22 | 23,5 % | 35,8 % | **45,9 %** | 58,2 % | 66,4 % | 79,8 % | 87,9 % | 51,9 % |
| Nueva · Nueva · Completa | 31,6 % | 20 · 25 · 31 | 7,7 % | 11,2 % | **16,0 %** | 21,2 % | 27,0 % | 38,1 % | 47,9 % | 19,5 % |
| Nueva · Una caja · Completa | 62,6 % | 18 · 21 · 26 | 12,9 % | 19,7 % | **27,7 %** | 35,9 % | 44,5 % | 59,0 % | 70,2 % | 32,6 % |
| Nueva · Completa · Completa | 72,6 % | 19 · 21 · 25 | 11,1 % | 17,0 % | **24,0 %** | 33,1 % | 42,9 % | 59,4 % | 72,1 % | 30,3 % |
| Una caja · Una caja · Completa | 86,5 % | 17 · 19 · 22 | 21,7 % | 33,2 % | **44,1 %** | 55,9 % | 65,1 % | 78,9 % | 87,5 % | 51,4 % |
| Una caja · Completa · Completa | 90,6 % | 17 · 19 · 22 | 20,7 % | 31,9 % | **43,9 %** | 56,1 % | 66,3 % | 81,4 % | 89,7 % | 52,2 % |
| Tres cajas · Tres cajas · Tres cajas | 92,6 % | 17 · 19 · 21 | 21,0 % | 32,1 % | **45,3 %** | 59,1 % | 70,7 % | 86,8 % | 94,3 % | 52,3 % |
| Completa · Completa · Completa | 92,6 % | 17 · 19 · 21 | 20,6 % | 32,9 % | **44,8 %** | 57,9 % | 69,5 % | 85,5 % | 94,1 % | 54,0 % |
| **Dos personas y el bot (D-35)** | | | | | | | | | | |
| Nueva · Nueva · Bot | 22,0 % | 19 · 22 · 28 | 9,6 % | 14,6 % | **20,9 %** | 28,9 % | 36,8 % | 50,9 % | 61,3 % | 24,2 % |
| Nueva · Una caja · Bot | 53,6 % | 18 · 21 · 24 | 13,7 % | 21,6 % | **30,3 %** | 39,5 % | 48,7 % | 64,2 % | 75,3 % | 35,6 % |
| Nueva · Completa · Bot | 67,0 % | 18 · 21 · 25 | 11,2 % | 17,8 % | **25,3 %** | 34,5 % | 44,4 % | 60,4 % | 72,9 % | 31,1 % |
| Una caja · Una caja · Bot | 83,5 % | 17 · 19 · 22 | 21,6 % | 33,3 % | **45,2 %** | 57,4 % | 66,5 % | 79,5 % | 87,5 % | 52,2 % |
| Una caja · Completa · Bot | 89,0 % | 17 · 19 · 22 | 20,4 % | 31,8 % | **44,1 %** | 56,4 % | 66,5 % | 81,3 % | 89,6 % | 52,3 % |
| Completa · Completa · Bot | 91,5 % | 17 · 19 · 21 | 20,4 % | 32,2 % | **44,5 %** | 57,1 % | 68,4 % | 84,8 % | 92,8 % | 53,5 % |
| **Personas nuevas fuera de su camino (R-34)** | | | | | | | | | | |
| Nueva fuera de su camino · Nueva fuera de su camino · Nueva fuera de su camino | 0,8 % \* | 26 · 30 · 39 | 6,3 % | 6,3 % | **6,3 %** | 6,3 % | 6,3 % | 18,8 % | 18,8 % | 0,0 % |
| Nueva · Nueva fuera de su camino · Nueva fuera de su camino | 1,1 % \* | 21 · 28 · 37 | 2,9 % | 5,8 % | **11,6 %** | 17,4 % | 24,6 % | 29,0 % | 36,2 % | 11,6 % |
| Nueva fuera de su camino · Completa · Completa | 63,3 % | 19 · 23 · 27 | 7,3 % | 12,1 % | **18,5 %** | 25,0 % | 33,4 % | 48,3 % | 63,4 % | 21,0 % |

\* Menos de 100 partidas superan la ronda 3: la cifra no es representativa.

### Lectura

1. **Clásica aguanta cualquier mezcla.**
   - Tres personas nuevas ganan el 83,3 %. Es más que el 62,1 % del inicio de v1, porque en línea cada una trae su carta de camino.
   - Con una sola persona que ya abrió una caja, el equipo sube al 96,0 %; con dos, al 99,3 %.
   - Una persona nueva casi no le cuesta a un equipo con cartas: 99,4 % con dos completas, contra 99,7 % con tres.
2. **En Clásica, el escalón llega con la primera caja.** Tres personas con una caja ganan el 99,7 %, igual que con la colección completa.
3. **En Tormenta, cada persona nueva le cuesta mucho al equipo.**
   - Tres completas ganan el 92,6 %. Con una nueva, el 72,6 %. Con dos, el 31,6 %. Tres nuevas, el 4,8 %.
   - Importa quién lleva el mazo corto: una nueva entre dos completas gana el 84,9 % con Agua, el 75,3 % con Fuego y el 57,6 % con Nieve.
4. **Una caja saca a la persona del pozo, y tres la dejan en el techo.** En Tormenta, tres personas con una caja ganan el 79,3 %; con tres cajas (11 cartas), el 92,6 %, igual que con las 20.
5. **Empezar con el bot nunca es peor que sumar a una persona nueva.** Dos nuevas y el bot ganan el 96,6 % en Clásica y el 22,0 % en Tormenta; tres nuevas, el 83,3 y el 4,8 %. El mazo del bot rinde un poco más que una caja: dos personas con una caja y el bot ganan el 83,5 % en Tormenta, y tres con una caja, el 79,3 %.
6. **Fuera de su camino, una persona nueva casi no trae cartas.** Tres nuevas fuera de su camino ganan el 49,6 % en Clásica. Una sola entre dos completas gana el 98,7 % en Clásica y el 63,3 % en Tormenta (el 39,5 % si lleva a Nieve).
7. **El límite del bonus sigue calibrado para quien ya tiene cartas.**
   - Con el mazo de referencia, que es el del sandbox, entra el 64,1 % en Clásica y el 44,7 % en Tormenta (77,8 y 51,2 % con habilidad 1).
   - Los equipos donde cada persona tiene al menos una caja quedan muy cerca: de 65,5 a 68,2 % en Clásica y de 43,9 a 45,9 % en Tormenta.
   - Con personas nuevas baja. En Clásica, de 56,6 a 58,2 % con una y de 43,5 a 48,0 % con dos o tres. En Tormenta, de 24,0 a 33,7 % con una y de 16,0 a 25,7 % con dos.
   - Para que tres personas nuevas entren al bonus tanto como en el sandbox harían falta 15 turnos en Clásica (63,9 %). En Tormenta, un equipo con una nueva y dos completas llega al 42,9 % con 20 turnos.

### Preguntas para el dueño de producto, con sus respuestas

Respondidas el 6 de octubre de 2026. Con ellas se cerró P-20.

- **¿Tormenta en línea pide un mínimo de cartas por persona?** Hasta ahora R-31 solo recomendaba 4 por elemento. Si cada persona tiene al menos una caja de su elemento (5 cartas), el peor equipo gana el 79,3 %. Sin mínimo, una persona nueva baja a un equipo completo del 92,6 al 72,6 %, y al 57,6 % si lleva a Nieve.
  - **Respuesta (D-69 y R-51 del PRD de v2):** sí. Tormenta pide 5 cartas del elemento del ninja con que se entra, en el emparejamiento y en las salas con código. La pantalla muestra cuánto falta y sugiere jugar Clásica para conseguir la primera caja.
- **¿El emparejamiento junta a cualquiera dentro de la dificultad elegida?** En Clásica los números lo permiten. En Tormenta dependía de la respuesta anterior.
  - **Respuesta (D-70):** sí. Con pocas personas jugando, más filtros solo alargan la espera.
- **¿El límite de turnos del bonus se queda en 13 y 18?** Funciona igual que en el sandbox para los equipos con cartas. A los equipos con personas nuevas les cuesta más, pero esa etapa dura hasta la primera caja.
  - **Respuesta (D-71):** sí, se queda en 13 y 18.
- **¿Se acepta que Clásica en línea sea trivial desde la primera caja?** Es la misma pregunta de la sección anterior, ahora con tres personas: 99,7 %.
  - **Respuesta (D-72):** sí. Es el modo para empezar, y el simulador es un techo para personas reales.

**Tras la ronda de ajustes de jugabilidad** que viene antes del M8 hay que volver a correr estas tablas (`pnpm sim -- --mixed` y `pnpm sim -- --mixed --skill 1`), porque los ajustes pueden mover sus números.

## La reanimación del original (D-77): antes y después

Agregado el 6 de octubre de 2026 (PRD 0.10.18). Cambia una regla, no un valor: la reanimación vuelve a completarse al final del turno, como en el original (R-09 y R-11).

### Qué cambió

- **Antes (D-18):** el caído se levantaba en el acto, con 1 de vida, antes de la fase de los gólems.
- **Ahora (D-77):** se levanta al final del turno, con 1 de vida, si quien lo revive sigue en pie. Las cartas de Nieve siguen reviviendo en el acto.
- **El bot:** antes casi no revivía a un caído al que alcanzaba un gólem. Ahora mira si alcanzan a quien revive, en la casilla desde donde revive.

### Método

- Son las corridas del resto del reporte, antes y después: 2.000 partidas por configuración, con las mismas semillas. "Antes" es el motor de `main` en `febd156`; "después", el de este cambio.
- **Comprobación:** "antes" reproduce los números publicados: 99,8 y 88,0 % en el sandbox, 62,1 % con la colección de inicio, y las tablas de P-20.
- El simulador cuenta ahora las reanimaciones: cuántas se empiezan por partida y cuántas se interrumpen. Para "antes" se contó, con un contador temporal, cuántas veces el revivido volvía a caer ese mismo turno.
- Para reproducirlo: `pnpm sim -- --matches 2000 --skill 0.6 [--storm]`, lo mismo con `--collection starter|box|full`, `pnpm sim -- --table`, `pnpm sim -- --mixed` y `pnpm sim -- --mixed --skill 1`.

Cada celda dice "antes → después".

### El sandbox (mazo de referencia, D-50)

| Métrica | Clásica · 0,6 | Tormenta · 0,6 | Clásica · 1 | Tormenta · 1 |
|---|---|---|---|---|
| Victoria | 99,8 → 99,8 % (igual) | 88,0 → 91,5 % (+3,5) | 99,8 → 100,0 % (+0,2) | 93,3 → 95,5 % (+2,2) |
| Derrotas en ronda 1 / 2 / 3 | 1 / 0 / 4 → 1 / 3 / 1 | 32 / 75 / 134 → 23 / 44 / 102 | 0 / 1 / 2 → 0 / 0 / 0 | 23 / 29 / 82 → 13 / 15 / 61 |
| Turnos por partida (media) | 15,9 → 15,9 | 22,5 → 22,6 | 15,3 → 15,3 | 22,4 → 22,5 |
| Combos por partida | 3,80 → 3,79 | 4,36 → 4,46 | 3,66 → 3,66 | 4,44 → 4,51 |
| Caídas de ninjas por partida | 0,13 → 0,12 | 2,40 → 2,30 | 0,08 → 0,07 | 2,08 → 2,07 |
| Reanimaciones por partida (la acción de revivir) | 0,03 → 0,04 | 0,46 → 0,66 | 0,01 → 0,02 | 0,36 → 0,63 |
| De esas, las que se pierden | 43,9 → 2,7 % | 48,9 → 2,6 % | 72,0 → 0,0 % | 49,1 → 2,5 % |
| Caídos que levanta una carta de Nieve, por partida | 0,07 → 0,07 | 0,80 → 0,75 | 0,05 → 0,04 | 0,77 → 0,72 |
| Entra al bonus: sin caídas | 96,3 → 96,6 % | 59,5 → 57,3 % | 98,4 → 98,4 % | 64,6 → 63,1 % |
| Entra al bonus: vida completa | 31,9 → 31,8 % | 8,9 → 8,6 % | 32,6 → 32,5 % | 8,3 → 8,9 % |
| Entra al bonus: contra el reloj | 63,8 → 64,0 % | 43,5 → 43,0 % | 78,2 → 78,1 % | 47,3 → 47,9 % |
| Bonus ganados (de los jugados) | 99,8 → 99,8 % | 40,3 → 41,4 % | 99,8 → 99,9 % | 50,0 → 52,8 % |
| Monedas por partida | 376 → 376 | 294 → 302 | 383 → 384 | 310 → 317 |

### Por colección

Victoria, con el camino de Fuego:

| Colección | Clásica · 0,6 | Tormenta · 0,6 | Clásica · 1 | Tormenta · 1 | Reanimaciones que se pierden (Tormenta · 0,6) |
|---|---|---|---|---|---|
| Inicio | 62,1 → 66,3 % (+4,2) | 0,8 → 0,9 % (+0,1) | 70,8 → 75,3 % (+4,5) | 2,4 → 3,1 % (+0,7) | 51,9 → 5,5 % |
| Tras una caja | 99,8 → 99,8 % (igual) | 60,3 → 64,3 % (+4,0) | 99,7 → 100,0 % (+0,3) | 69,3 → 73,2 % (+3,9) | 51,0 → 4,4 % |
| Completa | 99,7 → 99,8 % (+0,1) | 92,6 → 95,5 % (+2,9) | 99,8 → 100,0 % (+0,2) | 95,0 → 97,2 % (+2,2) | 48,8 → 3,1 % |

La tabla del §18.3 (habilidad 0,6):

| Colección (por elemento) | Clásica | Tormenta |
|---|---|---|
| 0 cartas | 18,4 → 23,1 % (+4,7) | 0,1 → 0,1 % (igual) |
| 1 carta de 9 (inicio de R-30, sin camino) | 49,6 → 55,0 % (+5,4) | 0,8 → 1,2 % (+0,4) |
| 1 carta de 9 + carta de camino (un 12) | 62,1 → 66,3 % (+4,2) | 0,8 → 0,9 % (+0,1) |
| Tras una caja de 3 por elemento | 99,8 → 99,8 % (igual) | 60,3 → 64,3 % (+4,0) |
| 8 cartas al azar del banco | 99,7 → 99,8 % (+0,1) | 91,9 → 94,5 % (+2,6) |
| Las 20 (colección completa) | 99,7 → 99,8 % (+0,1) | 92,6 → 95,5 % (+2,9) |
| Solo las 7 más altas (11 y 12) | 99,7 → 100,0 % (+0,3) | 95,6 → 97,3 % (+1,7) |

### Equipos de colecciones mezcladas (P-20)

Habilidad 0,6, salvo en las dos columnas que dicen "con habilidad 1". La columna "según quién lleva qué ninja" es la de después.

| Equipo | Clásica: victoria | Clásica, con habilidad 1 | Tormenta: victoria | Tormenta, según quién lleva qué ninja | Tormenta, con habilidad 1 |
|---|---|---|---|---|---|
| **Sandbox (D-50): el mazo de referencia en los tres ninjas** | | | | | |
| Bot · Bot · Bot | 99,8 → 99,8 % (igual) | 99,8 → 100,0 % (+0,2) | 88,0 → 91,5 % (+3,5) | — | 93,3 → 95,5 % (+2,2) |
| **Tres personas** | | | | | |
| Nueva · Nueva · Nueva | 83,3 → 84,3 % (+1,0) | 89,9 → 92,1 % (+2,2) | 4,8 → 5,6 % (+0,8) | — | 9,7 → 10,6 % (+0,9) |
| Nueva · Nueva · Una caja | 96,0 → 97,3 % (+1,3) | 98,1 → 98,7 % (+0,6) | 18,4 → 21,6 % (+3,2) | 21,2 a 22,1 % | 25,0 → 28,7 % (+3,7) |
| Nueva · Una caja · Una caja | 99,3 → 99,8 % (+0,5) | 99,8 → 100,0 % (+0,2) | 49,4 → 53,7 % (+4,3) | 51,3 a 55,4 % | 58,1 → 62,7 % (+4,6) |
| Una caja · Una caja · Una caja | 99,7 → 99,8 % (+0,1) | 99,8 → 100,0 % (+0,2) | 79,3 → 83,5 % (+4,2) | — | 87,5 → 89,7 % (+2,2) |
| Nueva · Nueva · Completa | 96,9 → 98,0 % (+1,1) | 98,5 → 99,0 % (+0,5) | 31,6 → 36,6 % (+5,0) | 25,0 a 46,5 % | 38,3 → 45,0 % (+6,7) |
| Nueva · Una caja · Completa | 99,3 → 99,8 % (+0,5) | 99,8 → 99,9 % (+0,1) | 62,6 → 68,5 % (+5,9) | 57,7 a 78,7 % | 70,5 → 76,1 % (+5,6) |
| Nueva · Completa · Completa | 99,4 → 99,8 % (+0,4) | 99,8 → 99,9 % (+0,1) | 72,6 → 78,9 % (+6,3) | 68,5 a 89,3 % | 79,0 → 84,8 % (+5,8) |
| Una caja · Una caja · Completa | 99,7 → 99,8 % (+0,1) | 99,9 → 100,0 % (+0,1) | 86,5 → 90,0 % (+3,5) | 88,8 a 92,2 % | 92,0 → 94,5 % (+2,5) |
| Una caja · Completa · Completa | 99,7 → 99,8 % (+0,1) | 99,9 → 100,0 % (+0,1) | 90,6 → 94,0 % (+3,4) | 92,6 a 95,0 % | 94,2 → 96,5 % (+2,3) |
| Tres cajas · Tres cajas · Tres cajas | 99,7 → 99,9 % (+0,2) | 99,8 → 100,0 % (+0,2) | 92,6 → 95,5 % (+2,9) | — | 95,4 → 97,8 % (+2,4) |
| Completa · Completa · Completa | 99,7 → 99,8 % (+0,1) | 99,8 → 100,0 % (+0,2) | 92,6 → 95,5 % (+2,9) | — | 95,0 → 97,2 % (+2,2) |
| **Dos personas y el bot (D-35)** | | | | | |
| Nueva · Nueva · Bot | 96,6 → 97,8 % (+1,2) | 98,1 → 98,8 % (+0,7) | 22,0 → 25,3 % (+3,3) | 22,9 a 26,9 % | 29,1 → 33,2 % (+4,1) |
| Nueva · Una caja · Bot | 99,3 → 99,7 % (+0,4) | 99,8 → 100,0 % (+0,2) | 53,6 → 59,0 % (+5,4) | 54,3 a 61,7 % | 63,1 → 68,6 % (+5,5) |
| Nueva · Completa · Bot | 99,3 → 99,7 % (+0,4) | 99,8 → 100,0 % (+0,2) | 67,0 → 73,6 % (+6,6) | 63,1 a 84,8 % | 74,8 → 80,6 % (+5,8) |
| Una caja · Una caja · Bot | 99,7 → 99,8 % (+0,1) | 99,8 → 100,0 % (+0,2) | 83,5 → 86,9 % (+3,4) | 86,5 a 87,5 % | 89,9 → 92,5 % (+2,6) |
| Una caja · Completa · Bot | 99,7 → 99,8 % (+0,1) | 99,9 → 100,0 % (+0,1) | 89,0 → 92,3 % (+3,3) | 90,8 a 94,3 % | 93,0 → 95,8 % (+2,8) |
| Completa · Completa · Bot | 99,7 → 99,8 % (+0,1) | 99,8 → 100,0 % (+0,2) | 91,5 → 94,6 % (+3,1) | 93,7 a 95,3 % | 94,7 → 97,1 % (+2,4) |
| **Personas nuevas fuera de su camino (R-34)** | | | | | |
| Nueva fuera de su camino · Nueva fuera de su camino · Nueva fuera de su camino | 49,6 → 55,0 % (+5,4) | 57,6 → 63,1 % (+5,5) | 0,8 → 1,2 % (+0,4) | — | 1,4 → 2,0 % (+0,6) |
| Nueva · Nueva fuera de su camino · Nueva fuera de su camino | 62,1 → 66,0 % (+3,9) | 70,7 → 75,1 % (+4,4) | 1,1 → 1,3 % (+0,2) | 0,9 a 1,5 % | 2,7 → 3,8 % (+1,1) |
| Nueva fuera de su camino · Completa · Completa | 98,7 → 99,4 % (+0,7) | 99,3 → 99,7 % (+0,4) | 63,3 → 71,5 % (+8,2) | 54,3 a 86,0 % | 69,8 → 77,2 % (+7,4) |

**Quién lleva el mazo corto.** En Tormenta, con habilidad 0,6:

| Equipo | La persona distinta lleva a Fuego | A Agua | A Nieve |
|---|---|---|---|
| Una nueva con dos completas | 75,3 → 79,0 % | 84,9 → 89,3 % | 57,6 → 68,5 % |
| Una completa con dos nuevas | 27,8 → 38,4 % | 22,1 → 25,0 % | 45,0 → 46,5 % |

**El límite de turnos del bonus.** De las partidas que superan la ronda 3, las que lo logran dentro del límite de hoy (13 turnos en Clásica y 18 en Tormenta):

| Equipo | Clásica: dentro de 13 turnos | Clásica, con habilidad 1 | Tormenta: dentro de 18 turnos | Tormenta, con habilidad 1 |
|---|---|---|---|---|
| **Sandbox (D-50): el mazo de referencia en los tres ninjas** | | | | |
| Bot · Bot · Bot | 64,1 → 64,0 % | 77,8 → 77,8 % | 44,7 → 43,8 % | 51,2 → 51,3 % |
| **Tres personas** | | | | |
| Nueva · Nueva · Nueva | 43,5 → 42,9 % | 54,8 → 53,4 % | 16,7 → 13,4 % | 21,8 → 20,4 % |
| Nueva · Nueva · Una caja | 48,0 → 47,3 % | 59,8 → 59,4 % | 25,7 → 21,8 % | 29,0 → 25,5 % |
| Nueva · Una caja · Una caja | 58,2 → 58,0 % | 69,4 → 69,4 % | 33,7 → 31,7 % | 38,4 → 36,2 % |
| Una caja · Una caja · Una caja | 68,2 → 68,0 % | 80,0 → 80,1 % | 45,9 → 44,9 % | 51,9 → 52,0 % |
| Nueva · Nueva · Completa | 47,3 → 46,8 % | 58,8 → 58,6 % | 16,0 → 14,2 % | 19,5 → 16,6 % |
| Nueva · Una caja · Completa | 57,7 → 57,5 % | 69,1 → 69,0 % | 27,7 → 25,7 % | 32,6 → 30,7 % |
| Nueva · Completa · Completa | 57,4 → 57,3 % | 68,6 → 68,6 % | 24,0 → 22,7 % | 30,3 → 28,9 % |
| Una caja · Una caja · Completa | 67,6 → 67,4 % | 79,6 → 79,7 % | 44,1 → 43,5 % | 51,4 → 51,5 % |
| Una caja · Completa · Completa | 66,8 → 66,7 % | 79,1 → 79,2 % | 43,9 → 43,6 % | 52,2 → 52,6 % |
| Tres cajas · Tres cajas · Tres cajas | 67,1 → 67,1 % | 79,6 → 79,5 % | 45,3 → 45,3 % | 52,3 → 52,7 % |
| Completa · Completa · Completa | 66,4 → 66,3 % | 78,5 → 78,6 % | 44,8 → 44,8 % | 54,0 → 54,5 % |
| **Dos personas y el bot (D-35)** | | | | |
| Nueva · Nueva · Bot | 46,8 → 46,3 % | 58,5 → 58,1 % | 20,9 → 18,5 % | 24,2 → 21,1 % |
| Nueva · Una caja · Bot | 57,1 → 56,8 % | 68,6 → 68,6 % | 30,3 → 28,2 % | 35,6 → 33,3 % |
| Nueva · Completa · Bot | 56,6 → 56,4 % | 68,0 → 68,0 % | 25,3 → 23,8 % | 31,1 → 29,5 % |
| Una caja · Una caja · Bot | 66,9 → 66,8 % | 79,3 → 79,3 % | 45,2 → 44,4 % | 52,2 → 51,9 % |
| Una caja · Completa · Bot | 66,1 → 66,0 % | 78,9 → 79,0 % | 44,1 → 43,5 % | 52,3 → 52,3 % |
| Completa · Completa · Bot | 65,5 → 65,4 % | 78,3 → 78,4 % | 44,5 → 44,1 % | 53,5 → 53,6 % |
| **Personas nuevas fuera de su camino (R-34)** | | | | |
| Nueva fuera de su camino · Nueva fuera de su camino · Nueva fuera de su camino | 24,3 → 21,7 % | 35,6 → 32,4 % | 6,3 → 4,2 % | 0,0 → 0,0 % |
| Nueva · Nueva fuera de su camino · Nueva fuera de su camino | 29,5 → 27,8 % | 40,6 → 38,2 % | 11,6 → 9,3 % | 11,6 → 8,8 % |
| Nueva fuera de su camino · Completa · Completa | 45,8 → 45,6 % | 59,2 → 59,1 % | 18,5 → 17,0 % | 21,0 → 19,5 % |

### El ritmo

`pnpm pacing` (300 partidas por dificultad, bot 0,8). El turno dura lo mismo: 3,0 s de mediana en Clásica y 3,5 s en Tormenta sin combo, y 6,6 y 6,7 s con combo. La partida entera sigue en 70,2 s en Clásica y pasa de 101,0 a 103,1 s en Tormenta.

### Lectura

1. **La reanimación deja de perderse.** Con D-18, cerca de la mitad de las veces el revivido volvía a caer ese mismo turno: del 44 al 54 % con habilidad 0,6. Con D-77 se interrumpe entre el 1 y el 6 %.
2. **El bot revive más.** En Tormenta, con el mazo de referencia, pasa de 0,46 a 0,66 reanimaciones por partida.
3. **Las caídas casi no cambian:** de 2,40 a 2,30 por partida en Tormenta. Se cae igual, pero levantarse sirve.
4. **Clásica no se mueve donde ya era fácil.** Sube donde todavía se pierde: de 62,1 a 66,3 % con la colección de inicio, y de 49,6 a 55,0 % con tres personas nuevas fuera de su camino.
5. **Tormenta sube unos 3 puntos con el mismo mazo en los tres ninjas:** de 88,0 a 91,5 % en el sandbox y de 92,6 a 95,5 % con la colección completa.
6. **En los equipos mezclados sube entre 3 y 8 puntos,** y más cuando una persona nueva juega con otras que ya tienen cartas: con dos completas pasa de 72,6 a 78,9 %. Los equipos que casi no ganan en Tormenta siguen igual: tres personas nuevas pasan de 4,8 a 5,6 %.
7. **Importa menos quién lleva el mazo corto.** Una persona nueva entre dos completas, con Nieve, pasa de 57,6 a 68,5 %.
8. **El límite del bonus no se mueve para los equipos con cartas.** Con personas nuevas baja: entre 1 y 4 puntos en Tormenta, y unos 2 en Clásica cuando juegan fuera de su camino. Ahora superan la ronda 3 partidas que antes se perdían, y esas llegan tarde.
9. **Los números con que se cerró P-20** (D-69 a D-72) quedan así en Tormenta: con una caja por persona, de 79,3 a 83,5 %; una persona nueva en un equipo completo, de 72,6 a 78,9 %; tres completas, de 92,6 a 95,5 %. En Clásica, tres personas con una caja pasan de 99,7 a 99,8 %.

Las secciones anteriores de este reporte conservan la medición hecha con D-18, que es con la que se decidió. Se vuelven a correr al terminar la ronda de claridad del tablero.

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
- **D-77:** la reanimación vuelve a completarse al final del turno, y el bot mira si alcanzan a quien revive. Con este mazo, Tormenta pasa de 88,0 a 91,5 % con habilidad 0,6 y de 93,3 a 95,5 % con habilidad 1.

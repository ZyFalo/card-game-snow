# Reporte de balance (M4)

Fecha: 29 de septiembre de 2026 · Motor: `@ventisca/core` · Comando: `pnpm sim -- --matches 2000 --skill <k> [--storm]`

## Método

El bot de ninjas (§8 del PRD) juega partidas completas sin render. Cada configuración se simuló con 2.000 semillas distintas.

- **Habilidad 1**: el bot siempre elige la jugada con mejor puntuación.
- **Habilidad 0,6**: con probabilidad 0,4 elige una alternativa peor, para aproximar a un jugador menos cuidadoso.

El bot no sufre el reloj ni se equivoca con la interfaz, así que estos números son un **techo** de lo que logrará una persona.

## Resultados (tras D-18: la reanimación se completa antes de la fase enemiga)

| Métrica | Clásica · 1 | Clásica · 0,6 | Tormenta · 1 | Tormenta · 0,6 |
|---|---|---|---|---|
| Victoria | 99,8 % | 99,8 % | 94,0 % | 88,7 % |
| Derrotas en ronda 1 / 2 / 3 | 0 / 1 / 2 | 1 / 0 / 4 | 21 / 28 / 69 | 29 / 71 / 125 |
| Turnos por partida (media) | 15,4 | 15,9 | 22,5 | 22,6 |
| Turnos hasta superar R1 a R3 (p25 · p50 · p75) | 11 · 12 · 13 | 11 · 13 · 14 | 16 · 18 · 20 | 17 · 19 · 21 |
| Combos por partida | 3,66 | 3,80 | 4,45 | 4,37 |
| Caídas de ninjas por partida | 0,08 | 0,13 | 2,10 | 2,46 |
| Entra al bonus: sin caídas | 98,4 % | 96,3 % | 64,6 % | 59,8 % |
| Entra al bonus: vida completa | 32,6 % | 31,9 % | 8,5 % | 8,2 % |
| Entra al bonus: contra el reloj | 78,2 % | 63,8 % | 49,4 % | 44,2 % |
| Bonus ganados (de los jugados) | 99,8 % | 99,8 % | 50,9 % | 38,3 % |

Antes de D-18, la victoria en Tormenta era de 96,2 % (habilidad 1) y 93,0 % (habilidad 0,6). Clásica casi no cambia porque ahí los ninjas casi nunca caen.

**Hallazgo al aplicar D-18.** La primera simulación dio 17,3 caídas por partida en Tormenta. El bot revivía junto a los gólems, lo remataban y volvía a revivir, en bucle. Se corrigió en el bot, no en la regla: una reanimación expuesta (el caído está al alcance de un gólem no aturdido) solo se elige si no hay nada mejor. La interfaz avisa lo mismo al jugador cuando planea una reanimación expuesta.

## Lectura

1. **Con los valores originales y un solo jugador que controla a los tres, el juego es muy fácil.** En el original, tres personas se coordinaban con 10 s cada una y sin hablar. Aquí una sola mente coordina a los tres y eso elimina la dificultad principal. Por eso se agregó la dificultad **Tormenta** (D-13), sin tocar la Clásica.
2. **Tormenta** (2 a 4 gólems por ronda, 5 en el bonus, vida ×1,4 y gólems que rematan al ninja más débil) produce derrotas reales (4 % a 7 %), casi 3 caídas por partida y un bonus que se gana menos de la mitad de las veces. Revivir pasa a importar.
3. **Límite de turnos del bonus (D-12).** En Clásica, N = 13 deja entrar al 78 % con juego óptimo y al 64 % con juego flojo. Es alcanzable, pero hay que ir rápido. En Tormenta, N = 18 coincide con la mediana (53 % y 45 %).
4. **"Vida completa"** es la condición más dura en ambas dificultades (8 % a 33 %). Se mantiene así a propósito, como la condición "de maestría".
5. **Los combos aparecen de forma natural**: el 99 % de las partidas tiene al menos uno. El clímax visual se verá en casi todas las partidas.

## Pendiente de validar con personas

- Tasa de victoria real en Normal (30 s por turno), turnos que vencen por tiempo y abandonos por frustración.
- Si Clásica resulta trivial también para humanos, evaluar como predeterminada una variante intermedia (por ejemplo, solo "rematan al más débil").
- Meta sugerida para el playtest de la clase (5 personas, 2 partidas cada una): victoria entre 70 % y 90 % en Clásica · Normal.

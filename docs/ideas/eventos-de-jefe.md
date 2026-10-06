# Eventos de jefe (idea para después)

**Estado:** solo una idea del dueño de producto. No está decidida ni tiene fecha. Reemplaza la idea anterior de un modo fijo ("camino a la gloria").

## La idea

- **Las partidas en línea siguen igual:** las tres rondas de siempre.
- **Durante un evento,** por tiempo limitado, al final aparece un **jefe especial**.
- **Quien lo derrota recibe una insignia** o un reconocimiento. Se gana jugando y nunca se compra (principio 0 de `microtransacciones.md`).
- **Cada cierto tiempo cambia el jefe.** La magia está en el jefe final, no en un modo nuevo.

## Precedente en el original

- La batalla contra Tusk se desbloqueaba al completar el traje de ninja de nieve. Vencerlo convertía a la persona en ninja de nieve y le daba la capa de Tusk.
- Había una estampilla por derrotar al maestro de la nieve.
- En esa batalla, el Sensei peleaba junto a los tres ninjas y los apoyaba cada 3 turnos con una carta de poder.

## Por qué eventos y no un modo fijo

- **Un solo juego que aprender:** las rondas 1 a 3 son las de siempre.
- **Razones para volver:** siempre hay algo nuevo esperando al final.
- **Momentos compartidos:** por ejemplo, un grupo de amigos persiguiendo al jefe de la semana.
- **Reconocimiento que se gana, no que se compra.**

## Decisiones para cuando se retome

1. **Cuándo aparece el jefe:** siempre como cuarta ronda durante el evento, o solo si el equipo cumple la condición de la ronda bonus. La segunda opción es más exigente y especial, pero deja fuera a más equipos. Hay que decidir también cómo convive con la ronda bonus actual.
2. **Quién recibe la insignia:** quienes estaban conectados al terminar la pelea, como con las recompensas por ronda (D-48). Un equipo que juega con el bot (D-45) también cuenta.
3. **Quién ve el reconocimiento:** hoy las estadísticas son privadas (D-39, P-21) y no hay perfil público. Una insignia que reconoce necesita que otros la vean, por ejemplo los compañeros de partida junto al nombre. Eso es una decisión nueva y cambia el aviso de privacidad, con el mecanismo de avisos del M9.
4. **Que nadie quede fuera para siempre:** los jefes vuelven en ediciones posteriores, y la insignia lleva su edición (por ejemplo, "[Jefe] · 2027"). Así se conserva lo especial sin cerrarle la puerta a quien no pudo jugar esa vez.
5. **La mentora** (la garza de papel de Ventisca, en lugar del Sensei del original; ver `progresion-y-mentora.md`): anuncia el evento, pelea junto al equipo contra el jefe como el Sensei en el original, o ambas cosas.
6. **El cielo del evento:** el jefe trae su propio cielo, que todo el equipo ve durante la pelea. Es pertenencia compartida, y podría quedar como fondo de batalla para quien lo derrote (ver `microtransacciones.md`, sección 3.1).
7. **Dificultad:** cada jefe se mide en el simulador antes de publicarse, en Clásica y en Tormenta, como se hizo con P-20.

## Lo técnico

- **Jefes como datos** en `packages/core`: casillas que ocupa (Tusk ocupaba 2×3), ataques y su ciclo. Así, agregar un jefe es barato.
- **Calendario de eventos en el servidor:** inicio, fin y jefe. Activar o cerrar un evento no debe requerir desplegar código.
- **Insignias por cuenta:** en su propia tabla, que el borrado de cuenta (D-56) también elimina.
- **Anuncio en el inicio en línea:** "Evento: [jefe], hasta el [fecha]".
- **Requisito:** las partidas en línea del M8, estables.

## Nombre

"Camino" ya se usa para la carta de camino y para "Camino del Fuego". Propuesta: **La Cumbre**. Las tres rondas son el ascenso y el jefe espera arriba: "Esta semana en la cumbre: [jefe]". Otras opciones: Las Pruebas de la Mentora y El Ventisquero.

## Cuándo retomarlo

Después del M9, con las partidas en línea estables y personas jugando. Entonces se convierte en un hito del PRD, con sus reglas y decisiones.

# Guía de la prueba de la Beta con amigos

Para la primera prueba del juego en línea con personas (D-83). Toma unos 45 minutos, con dos o tres personas además de quien la dirige. Al final hay que poder responder las preguntas de "Qué decidir después".

## Antes de empezar

- **Publicar:** fusiona el PR cuando nadie esté jugando (D-95) y espera a que `pnpm check:prod` pase completo. Sus dos comprobaciones nuevas dicen que la conexión del juego responde y que solo se abre desde el propio juego.
- **Cada persona necesita:**
  - un computador con Chrome o Edge al día. El combate en línea no es para teléfono (D-73), y Firefox y Safari no están revisados a mano;
  - su cuenta creada y verificada en https://ventisca.wpena.dev, con su camino elegido. Conviene que la creen el día anterior, para que la prueba no empiece con el correo;
  - haber jugado una partida "sin cuenta", para conocer el tablero.
- **La voz:** el juego no tiene chat (D-91). Haz al menos una partida sin llamada de voz: es la única forma de saber si las marcas del tablero bastan para coordinarse.
- **Anota la hora de inicio.** Con ella se encuentran después las partidas en los registros de Railway.

## El recorrido

Marca cada paso con lo que pasó. Si algo falla, pide una captura de pantalla y anota la hora.

1. **Una sala con tres personas.** Una crea la sala y dicta el código; las otras se unen. Dos deben tener el mismo camino, para que una tenga que elegir otro ninja. Jueguen la partida completa, sin voz.
2. **Una sala con dos personas y el bot.** Quien creó la sala usa "Empezar con el bot".
3. **La cola pública.**
   - Entran dos personas con ninjas distintos. A los 30 s les llega la oferta del bot: una acepta primero y la otra después.
   - En otra ronda, entran tres con un ninja de cada elemento: la partida empieza sola.
   - Entran dos con el mismo ninja: no se juntan, y la pantalla dice qué se busca.
4. **Desconexiones,** en una partida de sala:
   - una persona apaga su wifi unos 20 segundos y lo vuelve a encender;
   - otra recarga la página;
   - otra cierra la pestaña y no vuelve hasta que la partida termine. Después abre el juego y entra a "Jugar en línea".
5. **Salir con la ✕** a mitad de una partida, después de superar una ronda.
6. **Dos pestañas:** una persona abre el juego en otra pestaña y entra a "Jugar en línea" en las dos.
7. **Después de jugar:** los resultados, la Libreta ninja ("Mi progreso" y "Mis cartas") y abrir una caja con las monedas ganadas.
8. **El reinicio** (solo quien dirige, y avisando): con una partida de prueba en curso que ya superó una ronda, lanza un redespliegue desde el panel de Railway.

## Qué debe pasar

| Paso | Lo esperado |
|---|---|
| 1 | Quien encuentra su ninja ocupado elige uno libre. Cada persona ve los planes de las otras mientras los arman. Al final, las tres ven el mismo resultado y vuelven a la sala. |
| 2 | El bot juega el ninja libre y no aparece cobrando. |
| 3 | La oferta del bot sale a las dos personas a la vez, y la partida empieza cuando aceptan las dos. |
| 4 | El ninja de quien se desconecta queda gris y quieto, y el turno no espera por él. Quien vuelve retoma a su ninja desde el turno siguiente. Quien no vuelve ve, una sola vez, "La partida terminó sin ti", y no recibe monedas. |
| 5 | Quien sale no recibe monedas de esa partida. Lo que sumó a sus logros se mantiene: lo ve al pie de su ficha. |
| 6 | La primera pestaña avisa que el juego se abrió en otra, y ofrece "Conectarme aquí". |
| 7 | Las monedas de los resultados son las de la Libreta. Las estadísticas solo las ve su dueño. |
| 8 | Todas las personas vuelven al inicio en línea con "La partida terminó". Conservan las monedas de las rondas completas, y la partida no cuenta como derrota. |

## Qué mirar mientras juegan

- **El reloj de 10 s (D-90).** Cuenta los turnos que se resolvieron por el reloj con alguien sin confirmar. Anota en qué casos no alcanzó: moverse y atacar, colocar una carta, revivir, o decidir entre dos objetivos.
- **Los combos.** Si lograron alguno sin voz. Si alguien vio el borde dorado o leyó la franja antes de confirmar.
- **Confirmar.** Si alguien confirmó sin querer. Confirmar es definitivo.
- **Las esperas.** Si los 30 s de la cola o la espera entre turnos se sienten largos.
- **Lo que no entienden.** Sobre todo qué pasó cuando alguien se desconectó, y de dónde salen las monedas.
- **Los retrasos.** Si lo que hace una persona tarda en verse en la pantalla de otra.
- **Las caídas.** Cuántas veces cae un ninja en cada partida, si lo reviven y quién. De eso dependen tres logros, y el simulador no lo sabe: su bot casi no cae (P-25). Con ese dato se ajustan sus metas.

## Si algo falla

- **Registros** (panel de Railway, 7 días): cada partida deja "Empieza una partida" y "Termina una partida", con su identificador, sus turnos y cuántas personas quedaron. Un error del juego en línea sale como "Fallo en el juego en línea". No traen nombres, correos ni IPs.
- **La base** (en Railway, el servicio de Postgres deja consultar sus tablas):
  - `select id, status, outcome, turns, started_at, ended_at from matches order by started_at desc limit 20;`
  - `select match_id, seat, rounds, exit, notice from match_players order by joined_at desc limit 60;`
- **Volver atrás:** en Deployments, "Rollback" sobre el despliegue anterior. Vale entre versiones que tienen la misma tabla de logros. No vale volver a una anterior a los ajustes de la Beta (D-104): su migración cambió esa tabla, y la versión vieja fallaría al guardar un logro en plena partida.

## Qué decidir después

1. **El reloj:** si se queda en 10 s o sube (D-90 dice que se revisa tras esta prueba).
2. **El abandono:** si perder todas las monedas de la partida se siente justo (D-93, P-22).
3. **La coordinación sin chat:** si las marcas bastan o hace falta algo más (D-91).
4. **Las metas de los logros:** tras unas semanas, medir el ritmo real del amuleto y ajustarlas. "De pie otra vez" y "Reanimador" piden hoy una sola vez, porque el bot del simulador casi no cae (P-25).
5. **Lo que sigue:** Tormenta en línea (D-85), el combate en teléfono (D-73) y el mecanismo para avisar los cambios del aviso de privacidad (D-96).

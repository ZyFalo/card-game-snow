# ADR 0004 · El tiempo de juego sigue al reloj real

- Estado: aceptada (D-16) · Fecha: 2026-09-29

## Contexto
En las pruebas automáticas, un cartel de 1,65 s tardó 35 s. Con `fps.smoothStep` activo (valor por defecto), Phaser limita el delta a 16,6 ms durante los primeros 120 cuadros o cuando la ventana no tiene foco. Con render lento, el tiempo de juego se estira hasta 20 veces.

## Decisión
`fps: { smoothStep: false }` en la configuración del juego. Todas las esperas del animador usan el reloj de la escena para que la pausa congele todo de forma coherente.

## Consecuencias
- En equipos lentos se saltan cuadros, pero el turno dura lo previsto.
- Al volver de otra pestaña el delta puede ser grande. Se mitiga con la pausa automática al ocultar la pestaña.

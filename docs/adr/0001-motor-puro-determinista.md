# ADR 0001 · Motor de reglas puro y determinista

- Estado: aceptada (D-02) · Fecha: 2026-09-29

## Contexto
El juego necesita reglas verificables con pruebas, repeticiones por semilla, simulación masiva para el balance y, en v2, un servidor autoritativo que reutilice exactamente las mismas reglas.

## Decisión
`packages/core` es TypeScript puro, sin DOM ni Phaser. Toda la aleatoriedad pasa por un RNG con semilla guardado en el estado (R-23) y todos los números son enteros (R-24). `resolveTurn(estado, planes)` devuelve el nuevo estado y una lista de eventos. La interfaz solo anima esos eventos.

## Consecuencias
- Las pruebas nombran la regla que verifican (R-xx) y corren en milisegundos.
- La simulación de 8.000 partidas tarda menos de un minuto.
- El mismo motor servirá dentro de un Durable Object en v2.
- Costo: la escena no puede "improvisar" efectos. Todo lo que se ve debe existir como evento.

# ADR 0002 · Phaser 4 para el tablero y React para el HUD

- Estado: aceptada (D-09) · Fecha: 2026-09-29

## Contexto
El combate necesita sprites, tweens y partículas. Los menús, paneles y cartas son interfaz de texto que debe ser accesible, traducible y fácil de iterar.

## Decisión
Phaser 4 dibuja el tablero, las unidades y los efectos en un canvas de 1920×1080 (cámara con zoom 1,5 sobre coordenadas lógicas de 1280×720). React 19 dibuja el HUD en HTML encima del canvas, dentro de un escenario 16:9 que se escala a la ventana. Ambos leen el mismo store de Zustand (vanilla). Las acciones del jugador pasan por `state/actions.ts`, nunca directo al motor.

## Consecuencias
- Botones reales con foco, `aria-*` y teclado. Los textos viven en `i18n/es.ts`.
- Phaser recalcula la escala del puntero con `getBoundingClientRect`, así que basta con `scale.refresh()` al cambiar el marco. Está verificado a escalas 1, 1,125 y 0,70.
- El HUD usa `pointer-events: none` salvo en los elementos interactivos, para no bloquear los clics al tablero.

# ADR 0003 · Arte y audio generados en código

- Estado: aceptada (D-14, D-15) · Fecha: 2026-09-29

## Contexto
D-01 prohíbe usar assets del original. Hacía falta arte coherente sin depender de generadores de imágenes, con licencias claras y un peso mínimo.

## Decisión
- Todo el arte (ninjas, gólems, rocas, fondos, íconos y efectos) se escribe como SVG en `apps/web/src/art`. Al iniciar se rasteriza a 2× como texturas de Phaser, y React reutiliza el mismo SVG como `data:` URI.
- El audio (efectos y música generativa) se sintetiza con WebAudio en `apps/web/src/audio/audio.ts`. No hay archivos de audio.

## Consecuencias
- Cero peticiones de red para assets. El juego cabe en un solo HTML de 1,6 MB, donde la mayor parte es Phaser.
- La estética "papel plegado" encaja con polígonos planos. Iterar el arte es editar coordenadas.
- Límite: no hay animación por huesos. Las animaciones son tweens de código (P-13 resuelta).

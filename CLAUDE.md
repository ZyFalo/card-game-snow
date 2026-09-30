# CLAUDE.md

**Ventisca**: táctico por turnos cooperativo, recreación fiel en mecánica de *Card-Jitsu Snow* (2013) con identidad 100 % propia. Monorepo pnpm en TypeScript: motor puro en `packages/core` y cliente web (Phaser 4 + React 19) en `apps/web`.

Construido en claude.ai hasta la v0.9; aquí continúa el desarrollo. Empieza por `docs/traspaso.md`.

@AGENTS.md

## Documentos que mandan

- `docs/PRD.md`: el mapa del proyecto (reglas R-01 a R-32, decisiones D-01 a D-33, hitos y preguntas abiertas). Si una tarea contradice el PRD, pregunta antes de implementar.
- `docs/PRD-v2.md`: el modo en línea (v2): multijugador, cuentas, progreso en el servidor y despliegue en Railway, con las reglas R-33 a R-49, las decisiones D-34 a D-57 y los hitos M7 a M9. En todo lo del modo en línea manda sobre `docs/PRD.md`.
- `docs/traspaso.md`: estado del proyecto, puesta en marcha y próximos pasos.
- `docs/adr/`, `docs/balance-report.md` y `docs/ai-log.md`: decisiones de arquitectura, balance medido y bitácora del trabajo con IA.

## Cómo trabajar aquí

- **Idioma:** español neutro en la interfaz, la documentación y los mensajes de commit; identificadores de código en inglés.
- **Terminado significa:** `pnpm ci` en verde, más `pnpm e2e` si tocaste la interfaz o la escena. Si cambias algo visible, verifícalo en el navegador.
- **Commits pequeños,** uno por paso lógico, con mensajes que expliquen el porqué.
- **Registro:** toda decisión de producto o arquitectura va al registro de decisiones del PRD (D-xx), con una línea en `docs/ai-log.md`.
- **Identidad (D-01):** nunca uses nombres, arte, audio ni textos del juego original.
- **Motor puro (D-02):** `packages/core` no conoce el DOM, Phaser ni la red. El multijugador debe reutilizarlo tal cual en el servidor.
- **Balance y ritmo se miden:** si cambias números, vuelve a correr `pnpm sim` o `pnpm pacing` y actualiza el reporte correspondiente.

## Modo en línea (v2)

Se implementa según `docs/PRD-v2.md` (aprobado), que manda sobre `docs/PRD.md` en todo lo del modo en línea.

- **Por hitos (M7 a M9) y en PRs pequeños:** cada uno con sus pruebas y con la CI en verde. El dueño de producto revisa cada PR antes de fusionarlo.
- **Nunca subas secretos al repositorio:** las variables de entorno se documentan en `.env.example`.

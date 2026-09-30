# ADR 0005 · Dificultad "Tormenta"

- Estado: aceptada (D-13) · Fecha: 2026-09-29

## Contexto
Con los valores originales y control total de los tres ninjas, el bot gana el 100 % de las partidas (ver `docs/balance-report.md`).

## Decisión
Se mantiene **Clásica** (valores del original) como predeterminada y se agrega **Tormenta**: 2 a 4 gólems por ronda, 5 en el bonus, vida ×1,4, gólems que priorizan rematar al ninja más débil y límite de bonus de 18 turnos. Todo vive en `balance.json → difficulty`.

## Consecuencias
- El modo fiel sigue disponible para la nostalgia y el modo exigente da retos reales.
- La dificultad forma parte de la repetición (`ReplayData.difficulty`), así que las repeticiones siguen siendo deterministas.

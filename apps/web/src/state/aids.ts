import type { AppState } from './store';

/*
 * Las ayudas opcionales (D-78). El tablero muestra lo que se puede hacer, no el resultado: el cálculo es
 * de quien juega. Quien quiera ver más enciende estas ayudas en "Tu equipo", y vienen apagadas.
 */
export interface Aids {
  /** "Ver el daño antes de confirmar": la vida que perdería cada gólem, en su barra. */
  damage: boolean;
  /** "Ver el alcance de los enemigos": las casillas que puede golpear el gólem que está bajo el ratón. */
  reach: boolean;
}

/**
 * Las ayudas que valen en la partida en curso. Existen solo en las partidas locales (sandbox y un
 * jugador): en línea se ignoran, estén como estén los ajustes, para que todas las personas jueguen con la
 * misma información.
 */
export function activeAids(s: Pick<AppState, 'settings' | 'local'>): Aids {
  return { damage: s.local && s.settings.aidDamage, reach: s.local && s.settings.aidReach };
}

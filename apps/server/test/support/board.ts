import type { ElementKind, Enemy, EnemyKind, MatchState } from '@ventisca/core';

/*
 * Tableros preparados para las pruebas del juego en línea: una partida recién creada se deja con cada
 * quien donde la prueba lo necesita. Los usan las pruebas del servidor y el servidor de las pruebas e2e.
 */

/** Dónde va cada quien en un tablero preparado. Lo que no se dice, queda como en la partida recién creada. */
export interface Board {
  ninjas?: Partial<Record<ElementKind, { at?: [number, number]; hp?: number; hand?: number[]; everKo?: boolean }>>;
  golems?: { kind: EnemyKind; at: [number, number]; hp?: number }[];
  round?: MatchState['round'];
  bonus?: MatchState['bonusCondition'];
}

const LIFE: Record<EnemyKind, number> = { sniper: 30, artillery: 45, colossus: 60 };

/** Un tablero sin rocas, con los ninjas en la columna 0 y un coloso lejos, que tarda en llegar. */
export function board(spec: Board = {}): (state: MatchState) => MatchState {
  return (state) => {
    state.rocks = [];
    state.round = spec.round ?? 1;
    state.bonusCondition = spec.bonus ?? 'noKo';
    const rows: Record<ElementKind, number> = { fire: 0, water: 2, snow: 4 };
    for (const n of state.ninjas) {
      const s = spec.ninjas?.[n.id] ?? {};
      const [x, y] = s.at ?? [0, rows[n.id]];
      n.pos = { x, y };
      n.hp = s.hp ?? n.maxHp;
      n.everKo = s.everKo ?? n.hp <= 0;
      n.hand = (s.hand ?? []).map((value, i) => ({ id: `${n.id}-m${i + 1}`, element: n.id, value }));
    }
    const golems = spec.golems ?? [{ kind: 'colossus' as const, at: [8, 2] as [number, number] }];
    state.enemies = golems.map(
      (g, i): Enemy => ({
        id: `e${i + 1}`,
        kind: g.kind,
        pos: { x: g.at[0], y: g.at[1] },
        hp: g.hp ?? LIFE[g.kind],
        maxHp: LIFE[g.kind],
        stunned: false,
        burnTicks: 0,
      }),
    );
    state.nextEnemySeq = state.enemies.length + 1;
    return state;
  };
}
